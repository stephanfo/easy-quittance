# PRD — Quittances & Dépôt de garantie

> Document de cadrage produit. Voir aussi : [README.md](../README.md) (doc utilisateur).
> Statut : v2.3 livrée.

## Problème

Les bailleurs particuliers (petits propriétaires, 1 à quelques biens) ont besoin de remettre une quittance de loyer mensuelle à leurs locataires. Les solutions actuelles sont :

- **SaaS de gestion locative** (Rentila, Smovin, etc.) : surdimensionnés, payants, demandent la création d'un compte et l'envoi de données personnelles sur leurs serveurs
- **Templates Word/Excel** : besoin de remplir manuellement chaque mois les mêmes infos, risque d'erreur
- **Documents administratifs CERFA** : pas de version en ligne pratique

**Besoin réel** : un outil minimal, rapide, qui mémorise les locataires une fois pour toutes et génère un PDF en deux clics.

## Utilisateur cible

- **Profil principal** : particulier propriétaire de 1 à 10 biens immobiliers en France
- **Profil secondaire** : SCI familiale gérée par un membre non-pro
- **Profil exclu** : agences immobilières, gestionnaires professionnels (gros volume → besoin d'un CRM dédié)

## Vision

> **Le générateur de quittances le plus simple possible : local-first, gratuit, open-source.**

## Principes produit

1. **Local-first** — Aucune donnée ne quitte le navigateur. RGPD-friendly par design, pas de DPA à signer, pas de fuite possible.
2. **Zéro friction** — Pas de compte, pas d'installation obligatoire, pas d'email à donner. Ouvrir une URL, ça marche.
3. **Conformité légale française** — La quittance produite doit respecter l'art. 21 de la loi du 6 juillet 1989 (mention loyer/charges, période, signature).
4. **Gratuit et open-source** — Pas de fonctionnalité payante, pas de freemium. Le code est libre.
5. **Pérennité des données** — L'utilisateur doit pouvoir exporter ses données à tout moment dans un format ouvert (JSON).

## État actuel — v2.0

**v1.0 — Socle de génération PDF**

- ✅ Génération de quittances PDF conformes à l'art. 21 de la loi du 6 juillet 1989 (via jsPDF)
- ✅ Période couverte explicite sur la quittance (1er au dernier jour du mois, personnalisable)
- ✅ Mode de règlement par défaut par locataire (virement / chèque / espèces / autre)
- ✅ Date d'encaissement optionnelle (utile CAF)
- ✅ Gestion CRUD des locataires
- ✅ Configuration du bailleur (nom, adresse, ville, signature)
- ✅ Override loyer/charges pour un mois donné
- ✅ Préparation d'envoi par email via `mailto:` (PDF à joindre manuellement)
- ✅ Export / import des données en JSON (validé par schéma Zod)
- ✅ Conversion automatique du montant en lettres
- ✅ Toasts et modales custom (focus trap, ARIA), pas d'`alert()` / `confirm()` natifs
- ✅ Accessibilité ARIA (tabs, modales, focus management)
- ✅ Responsive mobile / tablette / desktop
- ✅ Stockage `localStorage`, 100% client-side

**v1.1 — Historique des quittances émises**

- ✅ Journal local de chaque génération PDF (snapshot complet : bailleur + locataire + montants + période + mode + date encaissement)
- ✅ Alerte anti-doublon : confirmation demandée si une quittance existe déjà pour `(locataire, mois, année)`
- ✅ Onglet « Historique » : liste triée par date desc, filtres par locataire et par année
- ✅ Regénération PDF à partir d'une entrée d'historique (à l'identique, indépendamment des modifications ultérieures de la fiche locataire)
- ✅ Suppression d'une entrée d'historique (avec confirmation)
- ✅ Export XLSX de l'historique (`write-excel-file`, chargé à la demande pour ne pas alourdir le bundle initial)
- ✅ Historique inclus dans l'export JSON global

**Refonte du PDF (livrée avec v1.1)**

- ✅ Mise en page pro : grille / marges constantes, hiérarchie typo, séparateurs anthracite
- ✅ En-tête avec n° de quittance (`Q-YYYYMM-NNN`, séquencé par mois, persisté en historique) + date d'émission
- ✅ Tableau aligné Loyer / Charges / Total perçu (en-tête anthracite, total surligné)
- ✅ Encart « Période couverte »
- ✅ Bloc signature dans une zone dessinée
- ✅ Pied de page : mention art. 21 + pagination
- ✅ Police Inter (SIL OFL) embarquée en lazy-load — accents et `€` rendus proprement (fallback Helvetica si fetch échoue)
- ✅ Coordonnées bailleur étendues (email / téléphone optionnels)
- ✅ Référence du bail optionnelle sur la fiche locataire

**v1.2 — PWA / mode offline**

- ✅ Manifest web + Service Worker (Workbox via `vite-plugin-pwa`) — précache complet des assets buildés (HTML, JS, CSS, polices, icônes)
- ✅ Icônes PWA générées depuis un SVG source ([public/icon.svg](../public/icon.svg)) : 64, 192, 512, maskable, apple-touch, favicon ICO/SVG
- ✅ Meta tags PWA dans [src/index.html](../src/index.html) (theme-color, apple-mobile-web-app-*, icônes)
- ✅ Bannière d'installation discrète, dismissible (flag localStorage `quittance_pwa_install_dismissed`, ne re-spamme pas)
- ✅ Toast de mise à jour : quand un nouveau SW est prêt, l'utilisateur voit « Nouvelle version disponible · Recharger »
- ✅ Logique encapsulée dans [src/lib/pwa.js](../src/lib/pwa.js) ; helpers purs testés par Vitest
- ✅ Headers Cache-Control no-cache pour `sw.js`, `workbox-*.js`, `manifest.webmanifest`, `index.html` ([.htaccess](../.htaccess))

**v2.0 — Multi-bailleurs / multi-biens / colocations**

Refonte du modèle de données : `bailleurs[] → biens[] → locataires[] → historique[]` (un locataire est rattaché à un bien, un bien à un bailleur).

- ✅ Nouvel onglet **Patrimoine** regroupant CRUD bailleurs + CRUD biens (avec sauvegarde JSON déplacée dans cet onglet)
- ✅ **Bailleurs multiples** : chacun avec ses propres infos (nom, adresse, ville, signature, email, téléphone) et sa propre numérotation `Q-YYYYMM-NNN`
- ✅ **Biens étendus** : libellé + adresse + type (`appartement` / `maison` / `chambre` / `local` / `parking` / `autre`) + référence interne optionnelle
- ✅ **Sélecteur bailleur + locataire** dans l'onglet Générer (cascade : le choix d'un bailleur filtre les locataires), avec auto-sélection si un seul bailleur existe
- ✅ **Colocations** : champ texte libre `coOccupants` sur le locataire (un nom par ligne), affichés sur la quittance sous le locataire principal
- ✅ **Filtres historique étendus** : bailleur · bien · locataire · année
- ✅ **Export XLSX enrichi** : colonnes Bailleur et Bien ajoutées
- ✅ **Suppression en cascade** (avec confirmation détaillant l'impact) : supprimer un bailleur supprime ses biens et leurs locataires. L'historique est **toujours conservé** (journal légal append-only)
- ✅ **Anti-doublon scopé par bailleur** : deux bailleurs peuvent avoir un locataire homonyme sans fausse alerte

**v2.1 — Personnalisation PDF et robustesse données**

- ✅ **Signature image** du bailleur (upload PNG/JPEG ≤500 Ko, base64, affichée dans le cadre signature avec le nom en petit dessous)
- ✅ **Toggle d'activation de la signature** par bailleur : si désactivé, seul le nom du signataire apparaît sur les documents (pas de cadre)
- ✅ **Logo bailleur** optionnel dans l'en-tête PDF (utile SCI / société civile), même upload UI que la signature
- ✅ **Reçu de dépôt de garantie** : nouvel onglet « Dépôt de garantie » avec deux flux (encaissement à l'entrée, restitution à la sortie). Champ `depotGarantie` sur la fiche locataire. Sortie : champ texte multi-ligne pour le détail des retenues (simplifié en V2.2). Historique unifié avec discriminant `type` ∈ `quittance` / `recu_dg_entree` / `recu_dg_sortie`. Anti-doublon scopé par (bailleur, locataire, sousType)
- ✅ **Snapshot historique allégé** : images base64 (signature + logo) ne sont **pas** dupliquées dans l'historique. À la réédition, on relit le bailleur courant via `resolveBailleurForRender` ; fallback gracieux sur le snapshot texte si le bailleur a été supprimé
- ✅ **Renommage onglet** : « Générer » → « Quittance » ; nouvel onglet « Configuration » (placeholder + jauge storage)
- ✅ **Contraste accessibilité renforcé** : couleur `apple-muted` passée de `#6e6e73` (~4.5:1) à `#5b5b60` (~5.9:1 sur blanc, ~5.5:1 sur le fond bg) — atteint WCAG AAA pour le corps de texte muted. PDF aligné (MUTED `[91,91,96]`).
- ✅ **Détection localStorage saturé** : jauge dans l'onglet Configuration (statut `ok` / `warning` ≥70 % / `critical` ≥90 %), alerte forte si le navigateur refuse l'écriture (QuotaExceededError), bouton « Archiver l'historique de plus de 2 ans » avec confirmation et incitation à exporter d'abord

**v2.2 — Templates email configurables + simplification retenues DG**

- ✅ **Templates email personnalisables** dans l'onglet Configuration : 3 documents (quittance, reçu DG entrée, reçu DG sortie) × 2 champs (sujet, corps) = 6 textareas avec bouton « Réinitialiser » par template. Placeholders `{locataire}`, `{mois}`, `{annee}`, `{bailleur}`, `{signature}` substitués au moment de l'envoi via `renderTemplate` ([src/lib/email-template.js](../src/lib/email-template.js)). Persistance debouncée (400 ms) pour éviter d'écrire à chaque frappe. Stocké dans la nouvelle clé `data.settings.emailTemplates` (premier setting global du schema). Valeurs par défaut exposées via `DEFAULT_EMAIL_TEMPLATES`.
- ✅ **Bouton email côté reçu DG** : symétrique à l'onglet Quittance, deux boutons (« Télécharger » + « Télécharger et préparer l'email ») dans l'onglet Dépôt de garantie. Nouvelle méthode `generateRecuDGAndEmail()`.
- ✅ **Retrait Tiptap / simplification retenues** : l'éditeur WYSIWYG (gras/italique/souligné/listes) est remplacé par un simple `<textarea>` multi-ligne. Le champ snapshot historique passe de `retenuesHtml` (HTML restreint) à `retenuesTexte` (texte plat). Migration : les entrées V2.1 avec `retenuesHtml` sont **vidées** (décision assumée — feature récente, volume faible, et le HTML brut serait illisible sur le PDF texte plat).
- ✅ **Allègement du bundle** : suppression des dépendances `@tiptap/core` + `@tiptap/starter-kit` + `@tiptap/extension-underline` (~40 Ko gzip), des fonts `Inter-Italic.ttf` + `Inter-BoldItalic.ttf` (~830 KiB précachés PWA), du parser HTML→PDF (`parseRichTextHtml` + `drawRichText` + tests, ~250 lignes). PWA precache passe de ~2500 KiB à ~1670 KiB.

**v2.3 — Mobile / PWA / accessibilité**

- ✅ **Refonte responsive mobile** : onglets scrollables avec snap + fade, listes adaptées (boutons d'action sur ligne dédiée pleine largeur sous 640 px, cible tactile ≥ 44 px), modales avec `my-4 sm:my-12` et padding `safe-area`, grilles formulaires interpolant 1→2→3 colonnes, badge DG passé en `text-xs`.
- ✅ **Sticky header mobile** : `<header class="app-header">` qui regroupe titre + barre d'onglets reste collé en haut sur mobile (`position: sticky; top: 0`), avec `padding-top: env(safe-area-inset-top)` pour couvrir la status bar iOS transparente. Le header disparaît en `sm+` (rendu inline classique).
- ✅ **Sticky CTA mobile** : sur `< 640 px`, le bloc « Télécharger PDF / Email » est `position: fixed` au viewport (pas de remontée en bas de scroll, pas de bande grise révélée par l'overscroll iOS). Compensation `padding-bottom: 5rem + safe-area` sur les panels concernés (`.panel-with-cta`).
- ✅ **PWA iOS** : `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style: black-translucent`, safe-area-inset sur body / container / banner / modales. Body coloré mobile (`white` clair, `#2c2c2e` dark) pour neutraliser l'overscroll élastique iOS.
- ✅ **Dark mode auto** (`prefers-color-scheme: dark`) : palette d'override des classes utilitaires de surface en CSS (pas de variant `dark:` Tailwind, trop de surface à tagger). Le PDF jsPDF reste indépendant — toujours en thème clair.
- ✅ **Manifest enrichi** : `categories: ['productivity', 'finance', 'business']`, `shortcuts` (« Générer une quittance », « Historique ») branchés via routing `?tab=` lu à `init()` sur whitelist `tabsOrder`. `share_target` retiré tant qu'aucun handler ne consomme les params.
- ✅ **Web Share API** ([src/lib/share.js](../src/lib/share.js)) : `sharePDFIfPossible(blob, filename, nav?)` branché dans les 3 flux PDF non-email. Sur Safari iOS / Chrome Android : feuille de partage native. Sur navigateur non-supportant : fallback transparent vers `doc.save()`. `AbortError` géré pour éviter le double-téléchargement.
- ✅ **Lock anti double-clic** : flag `_busy` + helper `_withBusy(fn)` partagé par les 5 méthodes de génération PDF. Boutons HTML désactivés via `:disabled="_busy"` + label « ⏳ Génération… ». Évite la race observable sur sticky CTA fixed iOS et le double-push d'entrée historique.
- ✅ **Aperçu temps réel des montants** : sur l'onglet Quittance, une card « Aperçu de la quittance » apparaît dès qu'un locataire est sélectionné, montrant période + loyer + charges + total + mode de règlement + date d'encaissement effectifs (override compris, avec badge « Ajusté pour ce mois »). Symétrique sur l'onglet DG (initial / retenue / restitué). Tout via getters Alpine réactifs (`effectiveLoyer/Charges/PeriodeLabel`, `dgEffective*`).
- ✅ **Lazy-load du module PDF** : `import('./lib/pdf.js')` dynamique mémoïsé. Bundle initial gzippé passe de ~178 kB à ~44 kB (-75%). `html2canvas` et `dompurify` (transitifs jsPDF) partent automatiquement dans le chunk lazy. Pré-cache SW garantit l'usage hors-ligne après 1ʳ visite.
- ✅ **Modèles d'email** : `resetEmailTemplatePair(subjectKey, bodyKey)` demande une seule confirmation et applique sujet + corps en un seul `setTimeout` (avant : 2 confirms successifs). Modèles repliés par défaut dans Configuration.
- ✅ **Durée d'archivage configurable** : `data.settings.archiveYears` (1/2/3/5/10, défaut 2), clampé via Zod, modifiable dans l'onglet Configuration. Migration automatique des payloads v2.2 sans cette clé.
- ✅ **Accessibilité** : focus rings WCAG (`field-input`, `.btn:focus-visible`, onglets), `prefers-reduced-motion`, `<main>` landmark, `aria-live="polite"` annonçant le changement d'onglet (`currentTabLabel`), `scroll-margin-top: 6rem` sous le header sticky mobile, `<details>` avec chevron CSS rotatif (custom car Tailwind reset masque le natif).
- ✅ **Sécurité / robustesse** : `formatMontant` et `formatDateFR` défensifs (NaN/format invalide → fallback affichable), `URL.createObjectURL` révoqué via `setTimeout 1000ms` pour ne pas être interrompu par `window.location.href = mailto:` sur Safari iOS.
- ✅ **Renommage** : titre app `📄 Quittances & Dépôt de garantie` (au lieu de « Générateur de Quittances »), reflète la dualité quittance / DG en place depuis v2.1.

## Non-objectifs

Volontairement **hors scope** :

- ❌ Backend / synchronisation cloud (casse le principe local-first)
- ❌ Comptes utilisateurs / authentification
- ❌ Paiement intégré, relances automatiques, suivi des impayés (→ c'est un CRM, pas un générateur de quittance)
- ❌ Gestion comptable complète (recettes/charges déductibles, déclaration 2044, etc.)
- ❌ Génération d'autres documents juridiques (bail, état des lieux, congés)
- ❌ Multi-utilisateurs sur la même instance
- ❌ Application mobile native (PWA suffit)

## Stack technique

| Couche | Choix |
|---|---|
| Build | Vite |
| Framework | Alpine.js (HTML-first, ~15 ko gzippé) |
| CSS | Tailwind CSS (utility-first) |
| PDF | jsPDF + police Inter (SIL OFL, lazy-load via `import.meta.url`) |
| Validation | Zod (import JSON et futures migrations de schéma) |
| Export XLSX | write-excel-file (chargé en lazy import) |
| Tests | Vitest pour les fonctions pures (`nombreEnLettres`, période, schéma, historique, storage, email-template) |
| Stockage | `localStorage` (clé `quittances_data`) |

Le tout reste **100% client-side**, build produit du HTML/CSS/JS statique déployable n'importe où.

## Métriques de succès

Le projet étant local-first et sans backend, **on n'instrumente rien**. Les seuls signaux disponibles sont :

- ⭐ Stars GitHub (intérêt communautaire)
- 🐛 Issues ouvertes (besoins non couverts, bugs réels)
- 🔁 Pull requests (santé contributive)

Pas de tracking, pas d'analytics — c'est cohérent avec le principe local-first.
