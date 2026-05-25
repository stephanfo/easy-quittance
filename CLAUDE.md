# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Générateur de quittances de loyer en PDF, **local-first** (aucune donnée ne sort du navigateur). Cible : bailleurs particuliers français (multi-bailleurs / multi-biens). Interface en français.

Deux documents complémentaires existent — **les lire avant tout changement non trivial** :
- [README.md](README.md) — doc utilisateur, usage local, hébergement
- [PRD.md](doc/PRD.md) — vision produit, roadmap (v2.2 livrée)

## Architecture

**Stack : Vite + Alpine.js + Tailwind CSS + Zod + Vitest + write-excel-file (lazy) + vite-plugin-pwa (Workbox).**

Le code source vit entièrement dans `src/` ; l'app servie en prod est l'artefact de build (`dist/`).

### Arborescence

```
src/
  index.html           # Template UI avec directives Alpine + ARIA tabs/modal + meta PWA
  main.js              # Entrée : Alpine.start() puis setupServiceWorker() + setupInstallPrompt()
  app.js               # State + méthodes du composant Alpine 'app'
  style.css            # Tailwind + composants @layer (.btn, .field-input, …)
  assets/fonts/        # Inter-Regular.ttf, Inter-Bold.ttf (SIL OFL) — chargés en lazy via import.meta.url
  lib/
    storage.js         # load/save localStorage + monitoring quota (getStorageInfo, buildArchivedCopy, cutoffYearsAgo)
    schema.js          # Schéma Zod v2.1 (data) + settings.emailTemplates + DEFAULT_EMAIL_TEMPLATES + normalisation des imports
    pdf.js             # Construction async des PDF (quittance + reçus DG) — drawSignatureBox 3 modes, logo en-tête, retenues en texte plat (splitTextToSize) — lazy-load (chunk ~400 kB séparé du bundle initial)
    historique.js      # Fonctions pures historique (buildEntry, buildRecuEntry, findDoublons[Recu], filter/sort, nextNumeroQuittance, nextNumeroRecu, resolveBailleurForRender)
    xlsx-export.js     # Export XLSX de l'historique (lazy-loaded via import dynamique)
    email-template.js  # renderTemplate(str, vars) — substitution {placeholder} pour les emails personnalisables (mailto)
    forms.js           # emptyLocataireForm / emptyBailleurForm / emptyBienForm — factories de formulaires vides pour les modales unifiées
    image-upload.js    # validateImageFile + readImageAsDataUrl (PNG/JPEG ≤ 500 Ko, callback onError)
    pwa.js             # SW register (prompt mode), bannière d'install, toast de mise à jour
    nombre-en-lettres.js
    period.js          # 1er au dernier jour du mois, format FR
    format.js          # formatMontant, moisTexte, formatDateFR — défensifs (NaN/format invalide → "" ou "0,00")
    toast.js           # Toasts + confirmDialog (focus trap, ARIA)
  test/                # Tests Vitest (fonctions pures)
public/                # Assets statiques copiés tels quels par Vite : icônes PWA (icon.svg + PNG générés), favicon
dist/                  # Sortie du build Vite (gitignoré, artefact de déploiement — inclut sw.js + manifest.webmanifest)
```

### Modèle de données (v2.1)

Persistance dans `localStorage` sous la clé `quittances_data`. Hiérarchie **bailleurs → biens → locataires** (un locataire est rattaché à un bien, un bien à un bailleur) :

```js
{
  version: '2.1',
  bailleurs: [
    { id, nom, adresse, ville, signature, signatureActive, signatureImage, logo, email, telephone }
    // signatureActive: bool (défaut true) — si false, seul `nom` apparaît sous le bloc signature
    // signatureImage / logo: dataURL base64 (PNG/JPEG ≤ 500 Ko côté UI) ou ''
  ],
  biens: [
    { id, bailleurId, libelle, adresse, type, reference }
    // type ∈ TYPES_BIEN = ['appartement','maison','chambre','local','parking','autre']
  ],
  locataires: [
    { id, bienId, nom, email, loyer, charges, modeReglement, referenceBail, coOccupants, depotGarantie }
    // coOccupants = texte libre (un nom par ligne, affiché sur la quittance pour colocations)
    // depotGarantie = montant DG (prérempli sur les reçus DG, surchargeable à la génération)
  ],
  historique: [
    {
      id,
      type,                                 // 'quittance' (défaut, rétrocompat v2.0) | 'recu_dg_entree' | 'recu_dg_sortie'
      numeroQuittance,                      // Q-YYYYMM-NNN (quittance) | DG-E-YYYY-NNN | DG-S-YYYY-NNN
      dateGeneration, moisNum, annee,       // moisNum vide pour les reçus DG
      bailleurId,                           // référence pour filtrage / lookup courant
      bailleur: {
        nom, adresse, ville, signature,
        signatureActive,                    // snapshotté pour figer le rendu (toggle) au moment de l'émission
        email, telephone,
        // NB: signatureImage et logo NE SONT PAS snapshottés — relus sur le bailleur courant
      },
      bien: { libelle, adresse, type, reference },
      locataire: { nom, email, loyer, charges, modeReglement, referenceBail, coOccupants, depotGarantie },
      // Champs spécifiques aux quittances
      loyer, charges,                       // montants effectifs (peuvent différer de la fiche)
      periodeDebut, periodeFin,
      modeReglement, dateEncaissement,
      // Champs spécifiques aux reçus DG (0 / '' pour une quittance)
      montantInitial, montantRestitue,
      retenuesTexte,                        // Texte multiligne libre (V2.2 : ex-retenuesHtml, plus de markup)
      dateEvenement,                        // date d'encaissement (entrée) ou de restitution (sortie)
      dateEmission                          // ISO YYYY-MM-DD ; rejouée à la réédition (PDF identique)
    }
  ],
  // V2.2 : premier setting global (jusqu'ici tout était per-bailleur). Les défauts viennent
  // de DEFAULT_EMAIL_TEMPLATES dans schema.js et sont restaurables via resetEmailTemplatePair.
  settings: {
    emailTemplates: {
      quittanceSubject, quittanceBody,
      dgEntreeSubject,  dgEntreeBody,
      dgSortieSubject,  dgSortieBody,
      // Placeholders supportés : {locataire}, {mois}, {annee}, {bailleur}, {signature}
    },
    archiveYears, // V2.3.1 : durée de conservation de l'historique avant proposition d'archivage. Défaut 2, clampé [1, 30], configurable dans l'onglet Configuration.
  }
}
```

- `loadData()` ([src/lib/storage.js](src/lib/storage.js)) appelle `migrate()` ([src/lib/schema.js](src/lib/schema.js)) — normalise les imports/charges en complétant les champs manquants avec leurs défauts. Pas de support de schéma antérieur (phase prototype). **Préserver ce point d'entrée** quand on évoluera vers de nouveaux formats.
- L'import JSON utilisateur passe par `parseImport()` → `migrate()` puis validation Zod stricte (`dataSchema.parse`). Un import malformé est rejeté avec un toast d'erreur.
- **Snapshot historique allégé** (v2.1) : on capture les champs texte du bailleur (nom, adresse, signature, `signatureActive`) mais **pas** les images base64 (signature image, logo) pour ne pas saturer le localStorage. La réédition relit les images sur le bailleur courant via `resolveBailleurForRender(entry, bailleursCourants)` ([src/lib/historique.js](src/lib/historique.js)). **Conséquence** : si l'utilisateur change son image de signature, les PDF historiques regénérés afficheront la **dernière** image (compromis assumé). Si le bailleur a été supprimé, fallback gracieux sur le snapshot texte (`signatureActive` du snapshot, pas d'image).
- **Suppression en cascade** : supprimer un bailleur supprime ses biens et leurs locataires (avec confirmation indiquant le nombre d'entités impactées). L'historique est **toujours conservé** (journal légal).

### Flux principaux

- **Alpine.data('app', appData)** ([src/app.js](src/app.js)) — single source of truth réactive. Toute mutation persiste via `persist()` qui appelle `saveData(this.data)` ; en cas de `QuotaExceededError` (localStorage saturé), un toast d'erreur invite à se rendre dans Configuration pour exporter + archiver.
- **Onglets** : `Quittance · Dépôt de garantie · Historique · Locataires · Patrimoine · Configuration` (ordre persisté dans `tabsOrder` côté Alpine pour la navigation clavier ←/→/Home/End ; l'id interne du premier onglet reste `'generate'` pour ne pas casser les IDs DOM existants, seul le **libellé** a changé). L'onglet Patrimoine regroupe bailleurs + biens. L'onglet Configuration centralise tout ce qui touche aux données globales : export/import JSON, jauge de stockage et archivage de l'historique ancien.
- **CRUD locataire / bailleur / bien : modale unifiée** ([src/index.html](src/index.html), [src/app.js](src/app.js)). Une seule modale par entité gère création **et** édition via un champ `mode: 'create' | 'edit'`. État Alpine : `editingLocataire`, `editingBailleur`, `editingBien` (`{ open, mode, id, form, previousActive }`). Méthodes : `openCreateXxx()` / `openEditXxx(id)` pour ouvrir, `closeXxxModal()` pour fermer (restaure le focus précédent), `saveXxx()` valide + crée OU modifie selon le mode. Le titre et le label du bouton enregistrer s'adaptent via `x-text`. Pas de formulaire inline dans la page — chaque liste a un bouton « ➕ Ajouter » qui ouvre la modale en mode create.
- **Upload images bailleur** : la modale bailleur expose un toggle `signatureActive` + deux uploads (signature image + logo). Méthodes `_readImageAsDataUrl(file)` (validation type PNG/JPEG + taille ≤ 500 Ko, lecture via FileReader→dataURL base64), `uploadSignatureImage(event)` / `uploadLogo(event)` / `removeSignatureImage()` / `removeLogo()`. Aperçu inline (`<img :src="...">`) directement depuis la dataURL.
- **Sélection à la génération** : `selectedBailleurId` puis `selectedLocataireId` (en cascade : changer de bailleur réinitialise le locataire via `$watch`). Le bien est dérivé du locataire via son `bienId`. Auto-sélection si un seul bailleur existe (à l'init et après import). L'onglet Dépôt de garantie réplique le même schéma avec `dgSelectedBailleurId` / `dgSelectedLocataireId`.
- **Génération PDF quittance** : `buildPDF({ bailleur, bien, locataire, … })` ([src/lib/pdf.js](src/lib/pdf.js)) est **async** (charge la police Inter en lazy-load, mémoïsée). L'adresse du logement loué vient de `bien.adresse`. Les `coOccupants` du locataire sont listés sous son nom dans le bloc LOCATAIRE. Tous les callers (`generatePDF`, `generateAndEmail`, `regenererPDF`, `buildAndReturn`) sont async. Fallback Helvetica silencieux si fetch Inter échoue. Le logo bailleur, s'il existe, est rendu en haut à gauche de l'en-tête (zone max 40×16mm, ratio préservé via `drawImageInBox`).
- **Bloc signature PDF** : `drawSignatureBox(doc, font, x, y, { signatureActive, signatureImage, signature, nom })` a trois rendus distincts — (1) toggle off : seul `nom` apparaît, pas de cadre ; (2) image présente : image redimensionnée dans le cadre 70×28mm + nom en petit dessous ; (3) sans image : cadre + texte `signature` (comportement original).
- **Génération PDF reçu DG** : `buildRecuDGPDF({ sousType, bailleur, bien, locataire, montantInitial, montantRestitue, retenuesTexte, dateEvenement, numeroRecu, dateEmission })` ([src/lib/pdf.js](src/lib/pdf.js)) génère un reçu d'encaissement (entrée) ou de restitution (sortie) avec une mise en page parallèle à la quittance. La sortie inclut un tableau récap (initial / retenues / restitué) et le détail libre des retenues rendu en texte brut multiligne via `doc.splitTextToSize(retenuesTexte, CONTENT_W)` puis `doc.text(lines, M.left, y)` — pattern identique à l'introduction de la quittance, retours à la ligne de l'utilisateur préservés.
- **Numérotation reçus DG** : `nextNumeroRecu(historique, bailleurId, annee, sousType)` ([src/lib/historique.js](src/lib/historique.js)) au format `DG-E-YYYY-NNN` (entrée) ou `DG-S-YYYY-NNN` (sortie). **Séquence par (bailleur, année, sousType)** — pas par mois, l'événement n'est pas mensuel.
- **Anti-doublon DG** : `findDoublonsRecu(historique, bailleurId, locataireNom, sousType)` — un seul reçu entrée + un seul reçu sortie par (bailleur, locataire) sont attendus. Le dialogue propose les mêmes 3 actions que pour les quittances (Rééditer / Générer un nouveau / Annuler).
- **N° de quittance** : `nextNumeroQuittance(historique, bailleurId, moisNum, annee)` ([src/lib/historique.js](src/lib/historique.js)) calcule le prochain n° au format `Q-YYYYMM-NNN`. **Séquence par (bailleur, mois)** — chaque bailleur a sa propre numérotation comptable, indépendante. Stocké dans l'entrée d'historique (snapshot append-only — un trou dans la séquence reste un trou, on prend `max+1`).
- **Période couverte** : auto (1er → dernier jour) via `defaultPeriod()`, surchargeable par l'utilisateur via deux champs date (case à cocher « Personnaliser la période »).
- **Mode de règlement** : valeur par défaut stockée par locataire (`locataire.modeReglement`), surchargeable à la génération.
- **Date d'encaissement** : transient (saisie à chaque génération si besoin).
- **Date d'émission** : calculée et stockée dans le snapshot historique au format ISO `YYYY-MM-DD` lors d'une génération neuve (`buildAndReturn` la fige en `new Date().toISOString().slice(0,10)`). Affichée en `DD/MM/YYYY` sur le PDF (« Émise le X » + « Fait à <ville>, le X »). Le snapshot la rejoue à l'identique en réédition — un PDF regénéré 6 mois plus tard porte la date du jour de l'émission originale, pas celle de la regen.
  - **Comportement actuel** : `dateEmission = aujourd'hui` quelle que soit la période. Conforme art. 21 (la quittance est datée du jour de remise).
  - **Hook latent pour back-dating automatique** : si on veut un jour qu'une quittance générée rétroactivement pour un mois passé porte la date de fin de période plutôt qu'aujourd'hui (ex : « Émise le 31/01/2021 » pour janvier 2021), il suffit de remplacer la ligne unique dans `buildAndReturn` ([src/app.js](src/app.js)) par `dateEmission = (this.periodeFin && this.periodeFin < today) ? this.periodeFin : today`. Toute la plomberie (snapshot, réédition à l'identique, propagation vers `buildPDF`) est déjà en place — pas de schéma ni de test à toucher. Décision **volontairement laissée hors scope** : le comportement « date du jour » reste légalement le plus défendable (on ne prédate pas un document juridique).
- **Anti-doublon quittance** : avant toute génération, `findDoublons()` ([src/lib/historique.js](src/lib/historique.js)) cherche une entrée existante pour `(bailleurId, locataire.nom, moisNum, annee)` **scopée aux types `quittance` uniquement** (les reçus DG ne déclenchent pas de faux positifs). Le scope par bailleur est obligatoire — deux bailleurs peuvent avoir un locataire homonyme sans collision. Si un doublon est trouvé, `choiceDialog()` ([src/lib/toast.js](src/lib/toast.js)) propose trois actions : **Rééditer l'existante** (rejoue le PDF depuis le snapshot d'historique, aucune nouvelle entrée), **Générer une nouvelle** (push d'une entrée supplémentaire — journal append-only), **Annuler**. Le bouton « Regénérer » depuis l'onglet Historique correspond exactement à la première action.
- **Réédition unifiée** : `_buildPDFFromEntry(entry)` ([src/app.js](src/app.js)) lit `entry.type` pour router vers `buildPDF` ou `buildRecuDGPDF`. Avant le rendu, `resolveBailleurForRender` recompose `bailleurRender = { ...entry.bailleur, signatureActive, signatureImage, logo }` en mixant snapshot (texte) et bailleur courant (images).
- **Validation en deux temps** ([src/app.js](src/app.js)) : `validateBaseSelection()` (bailleur + locataire + mois/année) gate l'entrée du flux et la détection de doublon ; `validateForNewGeneration()` (fiche bailleur complète, bien existant, période cohérente) n'est invoquée qu'avant une génération neuve. Ce découplage permet de rééditer un PDF archivé même si la fiche bailleur courante a été vidée depuis.
- **Signature email** (V2.3.x) : `generateAndEmail` et `generateRecuDGAndEmail` lisent **toujours** la signature dans le snapshot de la dernière entrée historique (sélectionnée via `findDoublons[Recu]` puis `reduce` sur `dateGeneration`). Cohérent avec le PDF déjà téléchargé, même si la fiche bailleur a évolué depuis. Plus de distinction « génération neuve » vs « réédition » côté email — l'email ne génère plus de PDF, il ouvre juste le mailto.
- **Filtres historique** : `filterAndSort()` accepte `{ locataireNom, annee, bailleurId, bienLibelle, type }`. La barre de filtres dans l'onglet Historique expose les 5. Le rendu d'une entrée DG affiche un badge `Reçu DG (entrée/sortie)` et bascule sur un layout dédié (montants DG au lieu de loyer+charges, date d'événement au lieu de période).
- **Export XLSX** : `lib/xlsx-export.js` est importé dynamiquement (`await import(...)`) au clic, pour ne pas alourdir le bundle initial.
- **Templates email personnalisables** (V2.2) : sujet + corps du `mailto:` configurables dans l'onglet Configuration pour 3 types de documents (quittance, reçu DG entrée, reçu DG sortie). Stockés dans `data.settings.emailTemplates`. Substitution via `renderTemplate(str, vars)` ([src/lib/email-template.js](src/lib/email-template.js)) — placeholders `{locataire}`, `{mois}`, `{annee}`, `{bailleur}`, `{signature}` remplacés au moment de l'envoi. Bouton « Réinitialiser » par template restore les défauts via `resetEmailTemplate(key)`. Persistance debouncée (400 ms) via `persistTemplates()` pour éviter d'écrire dans le localStorage à chaque frappe. Les retenues du reçu DG sortie sont saisies dans un simple `<textarea>` (V2.2 : Tiptap retiré, plus de mise en forme — texte brut multi-ligne).
- **Storage monitoring** ([src/lib/storage.js](src/lib/storage.js)) : `saveData(data)` retourne `{ ok, quotaExceeded }`. `getStorageInfo()` renvoie `{ bytes, quotaBytes, percent, status }` avec `status ∈ 'ok' | 'warning' (≥70 %) | 'critical' (≥90 %)`. L'onglet Configuration affiche une jauge réactive (le getter `storageInfo` lit `this.data` pour qu'Alpine re-track le getter à chaque mutation). Bouton `archiveAncienHistorique(years)` qui retire les entrées dont `dateGeneration < cutoffYearsAgo(years)` après confirmation (incite à exporter d'abord). **V2.3.1** : la durée est configurable via `data.settings.archiveYears` (1, 2, 3, 5 ou 10 ans, défaut 2). Quota plafonné à 5 Mo (constante `STORAGE_QUOTA_BYTES`).
- **Toasts / dialogues** : `toast(msg, variant)`, `await confirmDialog({...})` (2 boutons) et `await choiceDialog({ choices: [{value, label, variant, autoFocus}] })` (N boutons, renvoie la valeur du bouton cliqué ou `null`) ([src/lib/toast.js](src/lib/toast.js)) remplacent tous les `alert()` / `confirm()`. `confirmDialog` est désormais un wrapper sur `choiceDialog`. **Convention d'ordre des `choices`** : du moins primaire au plus primaire (le conteneur a `flex-col-reverse` sur mobile et `justify-end` sur desktop, ce qui place le dernier item au bon endroit dans les deux layouts).
- **Email** (V2.3.x — flow séparé) : les deux boutons sont indépendants. **« Télécharger »** (`generatePDF` / `generateRecuDG`) génère le PDF, pousse l'historique, sauve sur disque. **« Préparer l'email »** (`generateAndEmail` / `generateRecuDGAndEmail`) ne génère **plus** de PDF ; il ouvre seulement le `mailto:` avec sujet/corps pré-remplis depuis le snapshot historique le plus récent. Précondition : une entrée d'historique doit déjà exister pour le contexte (locataire+mois/an côté quittance, locataire+sousType côté DG). Sinon, toast d'avertissement « Téléchargez d'abord le PDF » et le mailto n'est PAS ouvert. Justification produit : éviter le double téléchargement du PDF et la confusion liée à la feuille de partage native (Web Share API retirée pour la même raison).
- **PWA** : `vite-plugin-pwa` (mode `prompt`, `injectRegister: false`) génère `sw.js` + `manifest.webmanifest` au build. [src/lib/pwa.js](src/lib/pwa.js) gère l'enregistrement du SW (toast « Nouvelle version dispo · Recharger »), capture `beforeinstallprompt` et affiche une bannière d'install dismissible (flag `quittance_pwa_install_dismissed` dans `localStorage`). Précachage Workbox de tous les assets buildés ; SW désactivé en dev (`devOptions.enabled: false`). **V2.3** : manifest enrichi avec `categories` et `shortcuts` (raccourcis ?tab=generate / ?tab=historique au long-press de l'icône installée). Routing `?tab=` lu une fois à `init()` via `tabsOrder.includes(...)`. Pas de `share_target` (retiré tant qu'aucun handler ne consomme les params).

## V2.3 : polish PWA + mobile, accessibilité, perf

- **Lock anti-double-clic** ([src/app.js](src/app.js)) : flag `_busy` + helper `_withBusy(fn)` partagé par les 3 méthodes de génération PDF (`generatePDF`, `generateRecuDG`, `regenererPDF`). Boutons HTML : `:disabled="_busy"` + `x-text` qui affiche `⏳ Génération…` pendant l'opération. Évite la race observable sur sticky CTA fixed iOS et le double-push d'entrée historique. Les boutons « Préparer l'email » ne génèrent plus de PDF (cf. flow séparé) → pas de `_busy`.
- **Aperçu temps réel** ([src/app.js](src/app.js) getters `effectiveLoyer`, `effectiveCharges`, `effectivePeriodeLabel` côté Quittance ; `dgEffectiveMontantInitial/Restitue/Retenu` côté DG) : la card-section « Aperçu » sur les onglets Quittance et DG montre les montants/période/dates effectifs qui iront sur le PDF, sans que l'utilisateur ait besoin de cocher « personnaliser ». Badge « Ajusté pour ce mois » si `overrideMontants` actif.
- **Sticky CTA mobile** ([src/style.css](src/style.css)) : sur < 640px, `.actions-cta` est `position: fixed; left: 0; right: 0; bottom: 0` avec padding `env(safe-area-inset-bottom/left/right)`. Les panels concernés portent la classe `panel-with-cta` qui ajoute `padding-bottom: calc(5rem + safe-area)` pour ne pas masquer le dernier champ. Désactivé en sm+ (rendu inline classique).
- **Header sticky mobile** ([src/style.css](src/style.css)) : `<header class="app-header">` qui wrappe `<h1>` + barre d'onglets devient sticky en haut sur mobile (`position: sticky; top: 0; z-index: 40`), avec `padding-top: env(safe-area-inset-top)` pour couvrir la status bar iOS transparente (`black-translucent` mode). Le container parent passe à `pt-0` mobile pour éviter le double padding.
- **Dark mode auto** ([src/style.css](src/style.css), `tailwind.config.js` `darkMode: 'media'`) : surcharges CSS ciblées des classes utilitaires de surface (`bg-white`, `bg-apple-bg`, `text-apple-*`, bannières amber/red). `color-scheme: dark` pour que les contrôles natifs suivent. Le PDF jsPDF reste indépendant — toujours en thème clair.
- **Lazy-load PDF** ([src/app.js](src/app.js)) : `import('./lib/pdf.js')` dynamique mémoïsé via `loadPdfModule()`. Bundle initial passe de ~178 kB à ~44 kB gzippé (-75%). `html2canvas` et `dompurify` (transitivement importés par jsPDF) partent automatiquement dans le chunk lazy `pdf.js`.
- **Accessibilité** : focus rings WCAG sur `.field-input` (`focus:ring-2 focus:ring-apple-blue/40`), `.btn:focus-visible` (outline 2px), onglets (`focus-visible:outline`). `prefers-reduced-motion` honoré globalement. `<main>` landmark autour des panels. `aria-live="polite"` annonce le changement d'onglet via `currentTabLabel`. `scroll-margin-top: 6rem` sur les éléments cibles mobile pour ne pas être masqués par le header sticky.
- **Default des champs de quittance affichés en aperçu** : `formatDateFR` exposé sur le composant Alpine (`formatDateFR` re-bind comme méthode) — sinon les imports JS ne sont pas accessibles depuis les `x-text` du template.
- **Email DG** : le placeholder `{mois}` est désormais substitué par `moisTexte(dateEvenement)` (avant : chaîne vide). Permet d'utiliser ce placeholder dans les templates DG personnalisés.

## Commandes

```bash
npm install                   # première fois — si erreur de cache npm: ajouter --cache /tmp/npm-cache
npm run dev                   # serveur Vite (http://localhost:5173) avec HMR
npm run build                 # vite build → dist/
npm run preview               # sert dist/ pour validation locale
npm run test                  # vitest run (~130 tests sur fonctions pures, environnement node uniquement)
npm run test:watch            # vitest en mode watch
```

Pour régénérer les icônes PWA après modification de [public/icon.svg](public/icon.svg) :
```bash
npx pwa-assets-generator --preset minimal-2023 public/icon.svg
```

Pour tester la persistance proprement : DevTools → Application → Local Storage → clé `quittances_data`.

## Conventions

- **Langue** : tout est en français (UI, code, identifiants, commentaires).
- **Conformité légale française** : la quittance générée doit respecter l'art. 21 de la loi du 6 juillet 1989 (distinction loyer/charges, **période couverte explicite**, signature, mode de règlement souhaité). Toute modification du PDF doit être vérifiée contre ce cadre.
- **Local-first non négociable** : aucune feature ne doit envoyer de données vers un serveur tiers.
- **Échappement XSS** : utiliser `x-text` plutôt que `x-html` dans les templates Alpine ; éviter `innerHTML` côté JS. Exception tolérée : templates structurels **strictement statiques** (sans interpolation) suivis d'injection des données dynamiques via `.textContent` — voir le pattern dans [src/lib/toast.js](src/lib/toast.js) (confirmDialog).
- **Tests** : toute nouvelle fonction pure (calcul, conversion, validation) doit être couverte par Vitest dans [src/test/](src/test/).

## Déploiement

Hébergement statique pur. Le [.htaccess](.htaccess) (HTTPS forcé, indexation désactivée) est fourni pour Apache.

Pour déployer : `npm run build`, puis copier le contenu de `dist/` (`index.html` + `assets/`) à la racine du serveur, OU configurer Apache pour `DocumentRoot` pointant vers `dist/`.
