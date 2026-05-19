# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Générateur de quittances de loyer en PDF, **local-first** (aucune donnée ne sort du navigateur). Cible : bailleurs particuliers français (multi-bailleurs / multi-biens). Interface en français.

Deux documents complémentaires existent — **les lire avant tout changement non trivial** :
- [README.md](README.md) — doc utilisateur, usage local, hébergement
- [PRD.md](doc/PRD.md) — vision produit, roadmap (v2.0 livrée)

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
    storage.js         # load/save localStorage avec try/catch
    schema.js          # Schéma Zod + normalisation des imports (data + historique)
    pdf.js             # Construction async du PDF (mise en page pro, police Inter, n° quittance)
    historique.js      # Fonctions pures historique (buildEntry, findDoublons, filter/sort, listes filtres, nextNumeroQuittance)
    xlsx-export.js     # Export XLSX de l'historique (lazy-loaded via import dynamique)
    pwa.js             # SW register (prompt mode), bannière d'install, toast de mise à jour
    nombre-en-lettres.js
    period.js          # 1er au dernier jour du mois, format FR
    format.js          # formatMontant, moisTexte, formatDateFR
    toast.js           # Toasts + confirmDialog (focus trap, ARIA)
  test/                # Tests Vitest (fonctions pures)
public/                # Assets statiques copiés tels quels par Vite : icônes PWA (icon.svg + PNG générés), favicon
dist/                  # Sortie du build Vite (gitignoré, artefact de déploiement — inclut sw.js + manifest.webmanifest)
```

### Modèle de données (v2.0)

Persistance dans `localStorage` sous la clé `quittances_data`. Hiérarchie **bailleurs → biens → locataires** (un locataire est rattaché à un bien, un bien à un bailleur) :

```js
{
  version: '2.0',
  bailleurs: [
    { id, nom, adresse, ville, signature, email, telephone }
  ],
  biens: [
    { id, bailleurId, libelle, adresse, type, reference }
    // type ∈ TYPES_BIEN = ['appartement','maison','chambre','local','parking','autre']
  ],
  locataires: [
    { id, bienId, nom, email, loyer, charges, modeReglement, referenceBail, coOccupants }
    // coOccupants = texte libre (un nom par ligne, affiché sur la quittance pour colocations)
  ],
  historique: [
    {
      id, numeroQuittance, dateGeneration,  // n° de quittance (Q-YYYYMM-NNN)
      moisNum, annee,                       // clé doublon
      bailleurId,                           // référence pour filtrage (snapshot append-only ; les id peuvent disparaître si l'entité est supprimée)
      bailleur: { ... },                    // snapshot complet (incl. email, telephone)
      bien: { libelle, adresse, type, reference },
      locataire: { nom, email, loyer, charges, modeReglement, referenceBail, coOccupants },
      loyer, charges,                       // montants effectifs (peuvent différer de la fiche)
      periodeDebut, periodeFin,
      modeReglement, dateEncaissement,
      dateEmission                          // ISO YYYY-MM-DD ; rejouée à la réédition (PDF identique)
    }
  ]
}
```

- `loadData()` ([src/lib/storage.js](src/lib/storage.js)) appelle `migrate()` ([src/lib/schema.js](src/lib/schema.js)) — normalise les imports/charges en complétant les champs manquants avec leurs défauts. Pas de support de schéma antérieur (phase prototype). **Préserver ce point d'entrée** quand on évoluera vers de nouveaux formats.
- L'import JSON utilisateur passe par `parseImport()` → `migrate()` puis validation Zod stricte (`dataSchema.parse`). Un import malformé est rejeté avec un toast d'erreur.
- **Historique = snapshot complet** : permet de regénérer le PDF à l'identique même si la fiche locataire/bien/bailleur évolue ou est supprimée. Ne jamais relire la fiche courante depuis une entrée d'historique.
- **Suppression en cascade** : supprimer un bailleur supprime ses biens et leurs locataires (avec confirmation indiquant le nombre d'entités impactées). L'historique est **toujours conservé** (journal légal).

### Flux principaux

- **Alpine.data('app', appData)** ([src/app.js](src/app.js)) — single source of truth réactive. Toute mutation persiste via `persist()` (≡ `saveData(this.data)`).
- **Onglets** : `Générer · Historique · Locataires · Patrimoine` (ordre persisté dans `tabsOrder` côté Alpine pour la navigation clavier ←/→/Home/End). L'onglet Patrimoine regroupe bailleurs + biens et accueille aussi les boutons export/import.
- **CRUD locataire / bailleur / bien : modale unifiée** ([src/index.html](src/index.html), [src/app.js](src/app.js)). Une seule modale par entité gère création **et** édition via un champ `mode: 'create' | 'edit'`. État Alpine : `editingLocataire`, `editingBailleur`, `editingBien` (`{ open, mode, id, form, previousActive }`). Méthodes : `openCreateXxx()` / `openEditXxx(id)` pour ouvrir, `closeXxxModal()` pour fermer (restaure le focus précédent), `saveXxx()` valide + crée OU modifie selon le mode. Le titre et le label du bouton enregistrer s'adaptent via `x-text`. Pas de formulaire inline dans la page — chaque liste a un bouton « ➕ Ajouter » qui ouvre la modale en mode create.
- **Sélection à la génération** : `selectedBailleurId` puis `selectedLocataireId` (en cascade : changer de bailleur réinitialise le locataire via `$watch`). Le bien est dérivé du locataire via son `bienId`. Auto-sélection si un seul bailleur existe (à l'init et après import).
- **Génération PDF** : `buildPDF({ bailleur, bien, locataire, … })` ([src/lib/pdf.js](src/lib/pdf.js)) est **async** (charge la police Inter en lazy-load, mémoïsée). L'adresse du logement loué vient désormais de `bien.adresse`. Les `coOccupants` du locataire sont listés sous son nom dans le bloc LOCATAIRE. Tous les callers (`generatePDF`, `generateAndEmail`, `regenererPDF`, `buildAndReturn`) sont async. Fallback Helvetica silencieux si fetch Inter échoue.
- **N° de quittance** : `nextNumeroQuittance(historique, bailleurId, moisNum, annee)` ([src/lib/historique.js](src/lib/historique.js)) calcule le prochain n° au format `Q-YYYYMM-NNN`. **Séquence par (bailleur, mois)** — chaque bailleur a sa propre numérotation comptable, indépendante. Stocké dans l'entrée d'historique (snapshot append-only — un trou dans la séquence reste un trou, on prend `max+1`).
- **Période couverte** : auto (1er → dernier jour) via `defaultPeriod()`, surchargeable par l'utilisateur via deux champs date (case à cocher « Personnaliser la période »).
- **Mode de règlement** : valeur par défaut stockée par locataire (`locataire.modeReglement`), surchargeable à la génération.
- **Date d'encaissement** : transient (saisie à chaque génération si besoin).
- **Date d'émission** : calculée et stockée dans le snapshot historique au format ISO `YYYY-MM-DD` lors d'une génération neuve (`buildAndReturn` la fige en `new Date().toISOString().slice(0,10)`). Affichée en `DD/MM/YYYY` sur le PDF (« Émise le X » + « Fait à <ville>, le X »). Le snapshot la rejoue à l'identique en réédition — un PDF regénéré 6 mois plus tard porte la date du jour de l'émission originale, pas celle de la regen.
  - **Comportement actuel** : `dateEmission = aujourd'hui` quelle que soit la période. Conforme art. 21 (la quittance est datée du jour de remise).
  - **Hook latent pour back-dating automatique** : si on veut un jour qu'une quittance générée rétroactivement pour un mois passé porte la date de fin de période plutôt qu'aujourd'hui (ex : « Émise le 31/01/2021 » pour janvier 2021), il suffit de remplacer la ligne unique dans `buildAndReturn` ([src/app.js](src/app.js)) par `dateEmission = (this.periodeFin && this.periodeFin < today) ? this.periodeFin : today`. Toute la plomberie (snapshot, réédition à l'identique, propagation vers `buildPDF`) est déjà en place — pas de schéma ni de test à toucher. Décision **volontairement laissée hors scope** : le comportement « date du jour » reste légalement le plus défendable (on ne prédate pas un document juridique).
- **Anti-doublon** : avant toute génération, `findDoublons()` ([src/lib/historique.js](src/lib/historique.js)) cherche une entrée existante pour `(bailleurId, locataire.nom, moisNum, annee)`. Le scope par bailleur est obligatoire — deux bailleurs peuvent avoir un locataire homonyme sans collision. Si un doublon est trouvé, `choiceDialog()` ([src/lib/toast.js](src/lib/toast.js)) propose trois actions : **Rééditer l'existante** (rejoue le PDF depuis le snapshot d'historique, aucune nouvelle entrée), **Générer une nouvelle** (push d'une entrée supplémentaire — journal append-only), **Annuler**. Le bouton « Regénérer » depuis l'onglet Historique correspond exactement à la première action.
- **Validation en deux temps** ([src/app.js](src/app.js)) : `validateBaseSelection()` (bailleur + locataire + mois/année) gate l'entrée du flux et la détection de doublon ; `validateForNewGeneration()` (fiche bailleur complète, bien existant, période cohérente) n'est invoquée qu'avant une génération neuve. Ce découplage permet de rééditer un PDF archivé même si la fiche bailleur courante a été vidée depuis.
- **Signature email** : en réédition, le corps du `mailto:` reprend la signature du **snapshot** (cohérent avec le PDF joint), pas celle de la fiche bailleur courante. En génération neuve, c'est la fiche courante qui est utilisée.
- **Filtres historique** : `filterAndSort()` accepte `{ locataireNom, annee, bailleurId, bienLibelle }`. La barre de filtres dans l'onglet Historique expose les 4.
- **Export XLSX** : `lib/xlsx-export.js` est importé dynamiquement (`await import(...)`) au clic, pour ne pas alourdir le bundle initial.
- **Toasts / dialogues** : `toast(msg, variant)`, `await confirmDialog({...})` (2 boutons) et `await choiceDialog({ choices: [{value, label, variant, autoFocus}] })` (N boutons, renvoie la valeur du bouton cliqué ou `null`) ([src/lib/toast.js](src/lib/toast.js)) remplacent tous les `alert()` / `confirm()`. `confirmDialog` est désormais un wrapper sur `choiceDialog`. **Convention d'ordre des `choices`** : du moins primaire au plus primaire (le conteneur a `flex-col-reverse` sur mobile et `justify-end` sur desktop, ce qui place le dernier item au bon endroit dans les deux layouts).
- **Email** : `mailto:` ne supporte pas les pièces jointes — le PDF est téléchargé et l'utilisateur l'attache manuellement (toast d'avertissement explicite).
- **PWA** : `vite-plugin-pwa` (mode `prompt`, `injectRegister: false`) génère `sw.js` + `manifest.webmanifest` au build. [src/lib/pwa.js](src/lib/pwa.js) gère l'enregistrement du SW (toast « Nouvelle version dispo · Recharger »), capture `beforeinstallprompt` et affiche une bannière d'install dismissible (flag `quittance_pwa_install_dismissed` dans `localStorage`). Précachage Workbox de tous les assets buildés ; SW désactivé en dev (`devOptions.enabled: false`).

## Commandes

```bash
npm install                   # première fois — si erreur de cache npm: ajouter --cache /tmp/npm-cache
npm run dev                   # serveur Vite (http://localhost:5173) avec HMR
npm run build                 # vite build → dist/
npm run preview               # sert dist/ pour validation locale
npm run test                  # vitest run (~80 tests sur fonctions pures)
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
