# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Générateur de quittances de loyer en PDF, **local-first** (aucune donnée ne sort du navigateur). Cible : bailleurs particuliers français. Interface en français.

Deux documents complémentaires existent — **les lire avant tout changement non trivial** :
- [README.md](README.md) — doc utilisateur, usage local, hébergement
- [PRD.md](doc/PRD.md) — vision produit, roadmap (v1.2 → v2.0)

## Architecture

**Stack : Vite + Alpine.js + Tailwind CSS + Zod + Vitest + write-excel-file (lazy).**

Le code source vit entièrement dans `src/` ; l'app servie en prod est l'artefact de build (`dist/`).

### Arborescence

```
src/
  index.html           # Template UI avec directives Alpine + ARIA tabs/modal
  main.js              # Entrée : enregistre Alpine.data('app', …) puis Alpine.start()
  app.js               # State + méthodes du composant Alpine 'app'
  style.css            # Tailwind + composants @layer (.btn, .field-input, …)
  lib/
    storage.js         # load/save localStorage avec try/catch
    schema.js          # Schéma Zod + normalisation des imports (data + historique)
    pdf.js             # Construction du PDF jsPDF (fonction pure buildPDF)
    historique.js      # Fonctions pures historique (buildEntry, findDoublons, filter/sort, listes filtres)
    xlsx-export.js     # Export XLSX de l'historique (lazy-loaded via import dynamique)
    nombre-en-lettres.js
    period.js          # 1er au dernier jour du mois, format FR
    format.js          # formatMontant, moisTexte, formatDateFR
    toast.js           # Toasts + confirmDialog (focus trap, ARIA)
  test/                # Tests Vitest (fonctions pures)
dist/                  # Sortie du build Vite (gitignoré, artefact de déploiement)
```

### Modèle de données

Persistance dans `localStorage` sous la clé `quittances_data` :

```js
{
  version: '1.0',
  bailleur: { nom, adresse, ville, signature },
  locataires: [
    { nom, email, adresse, loyer, charges, modeReglement }
  ],
  historique: [
    {
      id, dateGeneration,                 // métadonnées
      moisNum, annee,                     // clé doublon
      bailleur: { ... },                  // snapshot complet
      locataire: { ... },                 // snapshot complet
      loyer, charges,                     // montants effectifs (peuvent différer de la fiche)
      periodeDebut, periodeFin,
      modeReglement, dateEncaissement
    }
  ]
}
```

- `loadData()` ([src/lib/storage.js](src/lib/storage.js)) appelle `migrate()` ([src/lib/schema.js](src/lib/schema.js)) — normalise les imports en ajoutant les champs manquants avec des valeurs par défaut. **Préserver ce comportement** à toute évolution du schéma (sert de point d'entrée pour les futures migrations).
- L'import JSON utilisateur passe par `parseImport()` → `migrate()` puis validation Zod stricte (`dataSchema.parse`). Un import malformé est rejeté avec un toast d'erreur.
- **Historique = snapshot complet** : permet de regénérer le PDF à l'identique même si la fiche locataire/bailleur évolue. Ne jamais relire la fiche courante depuis une entrée d'historique.

### Flux principaux

- **Alpine.data('app', appData)** ([src/app.js](src/app.js)) — single source of truth réactive. Toute mutation persiste via `persist()` (≡ `saveData(this.data)`).
- **Génération PDF** : `buildPDF()` ([src/lib/pdf.js](src/lib/pdf.js)) est une fonction pure (input → `{ doc, filename }`), réutilisable et testable.
- **Période couverte** : auto (1er → dernier jour) via `defaultPeriod()`, surchargeable par l'utilisateur via deux champs date (case à cocher « Personnaliser la période »).
- **Mode de règlement** : valeur par défaut stockée par locataire (`locataire.modeReglement`), surchargeable à la génération.
- **Date d'encaissement** : transient (saisie à chaque génération si besoin).
- **Anti-doublon** : avant toute génération, `findDoublons()` ([src/lib/historique.js](src/lib/historique.js)) cherche une entrée existante pour `(locataire.nom, moisNum, annee)`. Si trouvé, `confirmDialog()` propose de regénérer ; sur confirmation une **nouvelle** entrée est appendée (journal append-only). Le bouton « Regénérer » depuis l'historique ne crée **pas** d'entrée.
- **Export XLSX** : `lib/xlsx-export.js` est importé dynamiquement (`await import(...)`) au clic, pour ne pas alourdir le bundle initial.
- **Toasts / confirmation** : `toast(msg, variant)` et `await confirmDialog({...})` ([src/lib/toast.js](src/lib/toast.js)) remplacent tous les `alert()` / `confirm()`.
- **Email** : `mailto:` ne supporte pas les pièces jointes — le PDF est téléchargé et l'utilisateur l'attache manuellement (toast d'avertissement explicite).

## Commandes

```bash
npm install                   # première fois — si erreur de cache npm: ajouter --cache /tmp/npm-cache
npm run dev                   # serveur Vite (http://localhost:5173) avec HMR
npm run build                 # vite build → dist/
npm run preview               # sert dist/ pour validation locale
npm run test                  # vitest run (58 tests sur fonctions pures)
npm run test:watch            # vitest en mode watch
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
