# Quittances & Dépôt de garantie

> Un générateur de quittances de loyer et de reçus de dépôt de garantie : simple, gratuit, local-first et open-source.
> Vos données restent dans votre navigateur. Pas de compte, pas de cloud, pas de tracking.

<!-- TODO: ajouter une capture d'écran de l'app ici -->
<!-- ![Capture d'écran](docs/screenshot.png) -->

## Pourquoi ce projet

Les bailleurs particuliers qui louent un ou quelques biens n'ont pas besoin d'un SaaS complet de gestion locative. Ils ont besoin d'un outil qui mémorise leurs locataires et qui produit une quittance PDF conforme en deux clics — sans inscription, sans abonnement, sans envoyer leurs données chez un tiers.

C'est exactement ce que fait cet outil. Stockage `localStorage`, génération PDF côté client, aucun serveur.

## Fonctionnalités

- 📄 **Génération PDF** de quittances de loyer conformes (via [jsPDF](https://github.com/parallax/jsPDF)) — mise en page pro avec n° de quittance, encart période, tableau aligné loyer/charges/total, bloc signature et pied de page légal ; rendu en police [Inter](https://rsms.me/inter/) (accents et `€` propres)
- ✍️ **Signature image** uploadable par bailleur (PNG/JPEG ≤ 500 Ko) affichée dans le cadre signature, ou désactivable via toggle (seul le nom du signataire apparaît alors)
- 🏷️ **Logo bailleur** optionnel dans l'en-tête PDF (utile SCI / société civile)
- 💰 **Reçu de dépôt de garantie** : génération de reçus d'encaissement (entrée) et de restitution (sortie) dans un onglet dédié, avec champ texte multi-ligne pour détailler les retenues sur la restitution
- 📨 **Modèles d'email personnalisables** : sujet et corps de l'email préparé (quittance + reçus DG) configurables dans l'onglet Configuration, avec placeholders `{locataire}`, `{mois}`, `{annee}`, `{bailleur}`, `{signature}` et bouton « Réinitialiser » par template
- 🗓️ **Période couverte explicite** sur la quittance (1er au dernier jour du mois, personnalisable)
- 💳 **Mode de règlement** (virement / chèque / espèces / autre), défaut par locataire
- 📥 **Date d'encaissement** optionnelle (utile pour les locataires CAF)
- 🧑‍💼 **Multi-bailleurs / SCI** : gérez plusieurs bailleurs (personne physique ou morale), chacun avec sa propre numérotation comptable
- 🏠 **Multi-biens** : un bailleur peut posséder plusieurs biens (appartement, maison, studio, local, parking…), avec adresse et référence interne
- 👥 **Gestion des locataires** : ajout, modification, suppression, rattachés à un bien, avec référence de bail, co-occupants (colocation) et dépôt de garantie optionnels
- 🔢 **Numérotation automatique** des quittances émises (`Q-YYYYMM-NNN`) et des reçus DG (`DG-E-YYYY-NNN` / `DG-S-YYYY-NNN`), incrémentée **par bailleur**
- ✏️ **Override mensuel** : modifier ponctuellement le loyer ou les charges pour un mois donné
- 📧 **Préparation d'email** : ouvre votre client mail avec sujet et corps pré-remplis (PDF à attacher manuellement)
- 📋 **Historique unifié** : journal local de toutes les quittances et reçus DG émis, alerte anti-doublon, regénération à l'identique du PDF, filtres type/bailleur/bien/locataire/année, export XLSX
- 💾 **Export / import JSON** : sauvegarde et restauration de toutes vos données (validées par schéma)
- 📊 **Onglet Configuration** : jauge de l'espace de stockage local utilisé (alerte à 70 %, critique à 90 %) avec bouton d'archivage des entrées d'historique de plus de 2 ans pour libérer de l'espace
- 🔢 **Conversion automatique** du montant en lettres (exigence légale)
- ♿ **Accessible** : navigation clavier WAI-ARIA sur les onglets, modales avec focus trap, contraste WCAG AAA sur le texte secondaire
- 📱 **Responsive** : utilisable depuis un téléphone, une tablette ou un ordinateur
- 📲 **Installable comme PWA** : ajoutable à l'écran d'accueil (mobile, desktop), fonctionne hors-ligne après la première visite

## Démo

<!-- TODO: ajouter l'URL de démo si vous en hébergez une -->
*Pas de démo en ligne pour le moment — voir la section ci-dessous pour utiliser l'app en local.*

## Utilisation

### Pour les utilisateurs finaux

L'app est un site statique : récupérez le contenu de `dist/` après build (voir ci-dessous), uploadez-le sur n'importe quel hébergeur de fichiers statiques, et c'est en ligne. Aucun serveur applicatif requis.

### Pour les développeurs

Pré-requis : Node.js ≥ 20.

```bash
npm install           # installe les dépendances
npm run dev           # serveur Vite (HMR) sur http://localhost:5173
npm run build         # build de prod → dist/
npm run preview       # sert dist/ pour validation locale
npm run test          # vitest run (couvre les fonctions pures)
npm run test:watch    # vitest en mode watch
```

### Premier usage (dans l'app)

1. Onglet **Patrimoine** : créez un bailleur (nom, adresse, ville, signature ; image de signature et logo optionnels), puis ajoutez un ou plusieurs biens (libellé, adresse, type) rattachés à ce bailleur.
2. Onglet **Locataires** : ajoutez vos locataires en choisissant le bien loué (loyer, charges, mode de règlement par défaut, dépôt de garantie ; co-occupants si colocation).
3. Onglet **Quittance** : sélectionnez un bailleur puis un locataire, un mois, ajustez la période ou le mode de règlement si besoin, puis cliquez sur « Télécharger la quittance PDF ».
4. Onglet **Dépôt de garantie** (optionnel) : générez le reçu d'encaissement à la signature du bail, puis le reçu de restitution à la sortie (avec détail des retenues éventuelles en texte riche).
5. Onglet **Configuration** (optionnel) : surveillez l'espace de stockage local, archivez l'historique ancien pour libérer de l'espace.

## Hébergement

`npm run build` produit dans `dist/` un site statique (`index.html` + `assets/`) déployable absolument n'importe où.

- **GitHub Pages** : le workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) build et déploie automatiquement à chaque push sur `main`. Il suffit d'activer Pages dans `Settings → Pages → Source: GitHub Actions`.
- **Netlify / Vercel / Cloudflare Pages** : commande de build `npm run build`, dossier de publication `dist`.
- **Apache** : un fichier [.htaccess](.htaccess) est fourni (HTTPS forcé, indexation désactivée) — uploader le contenu de `dist/` dans le DocumentRoot.

Aucune configuration serveur n'est nécessaire au-delà du service de fichiers statiques.

## Confidentialité

🔒 **Toutes vos données restent dans le `localStorage` de votre navigateur.**

- Aucune donnée n'est envoyée à un serveur (ni au nôtre, ni à un tiers).
- Aucun cookie, aucun analytics, aucun tracker.
- Toutes les dépendances (jsPDF, Alpine.js) sont embarquées dans le bundle au build — aucun appel CDN à l'exécution.
- Effacer les données du navigateur = effacer toutes vos données. **Pensez à exporter régulièrement** depuis l'onglet Configuration.

## Sauvegarde

Vos données vivent dans le `localStorage` de votre navigateur, qui peut être effacé par :
- une réinitialisation du navigateur
- un nettoyage agressif des données de site
- un changement de navigateur ou d'appareil

**Utilisez régulièrement le bouton « Exporter les données »** (onglet Configuration). Cela télécharge un fichier JSON que vous pouvez sauvegarder sur votre cloud, votre disque dur, ou ailleurs. Le bouton « Importer les données » permet de restaurer ce fichier sur le même ou un autre navigateur.

## Roadmap

Vue synthétique — voir [PRD.md](doc/PRD.md) pour le détail.

- **v1.0** ✅ Génération PDF conforme (art. 21 loi 1989), gestion locataires, export/import JSON, accessibilité ARIA.
- **v1.1** ✅ Historique des quittances émises, alerte anti-doublons, export XLSX.
- **v1.2** ✅ Mode PWA : installable, fonctionne hors-ligne, prompt de mise à jour.
- **v2.0** ✅ Multi-bailleurs / multi-biens, colocations (co-occupants), onglet Patrimoine, migration automatique depuis v1.x.
- **v2.1** ✅ Signature image et logo bailleur sur le PDF, reçus de dépôt de garantie (entrée + restitution), onglet Configuration avec jauge de stockage + archivage, contraste WCAG AAA renforcé.
- **v2.2** ✅ Modèles d'email personnalisables (3 documents × sujet/corps avec placeholders), bouton « préparer l'email » pour les reçus DG, simplification des retenues DG en texte brut (retrait de Tiptap et des fonts italiques, ~870 KiB en moins).
- **v2.3** ✅ Refonte mobile / PWA installable : header et CTA sticky, dark mode auto, safe-area iOS (encoche / home indicator), Web Share API pour partager les PDF, raccourcis manifest, lazy-load du module PDF (-75% sur le bundle initial), durée d'archivage configurable, aperçu temps réel des montants, focus rings WCAG + `prefers-reduced-motion`.

## Contribuer

Les contributions sont les bienvenues !

1. Ouvrez une **issue** pour signaler un bug ou proposer une fonctionnalité — surtout pour les gros changements, autant en discuter avant.
2. Pour une PR : fork → branche dédiée → PR vers `main` avec une description claire.
3. Pas de processus lourd : respecter le code existant et l'esprit local-first du projet. Toute nouvelle fonction pure doit avoir ses tests Vitest.

## Stack technique

- [Vite](https://vitejs.dev/) — build et dev server
- [Alpine.js](https://alpinejs.dev/) — réactivité HTML-first, ~15 ko gzippé
- [Tailwind CSS](https://tailwindcss.com/) — utility-first
- [jsPDF](https://github.com/parallax/jsPDF) — génération PDF côté client
- [Inter](https://rsms.me/inter/) (SIL OFL) — police embarquée du PDF, chargée à la demande
- [Zod](https://zod.dev/) — validation du schéma à l'import JSON
- [write-excel-file](https://www.npmjs.com/package/write-excel-file) — export XLSX de l'historique (chargé à la demande)
- [Vitest](https://vitest.dev/) — tests des fonctions pures
- `localStorage` pour la persistance, 100 % client-side

## Licence

Copyright © 2026 Stephanfo

Ce projet est distribué sous licence [GNU AGPL v3](LICENSE) (Affero General Public License).

Concrètement :
- ✅ Vous pouvez **utiliser**, **modifier**, **redistribuer** le code.
- ✅ Vous pouvez l'**héberger** publiquement pour vous-même ou pour d'autres.
- ⚠️ Toute version modifiée — même si elle est seulement hébergée comme service web — doit être publiée sous AGPL v3 avec son code source accessible.
- ⚠️ Pas de fork commercial fermé.

C'est un choix délibéré : ce projet doit rester libre et le rester pour tous ceux qui le forkent.
