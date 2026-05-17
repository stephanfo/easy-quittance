# Quittance — Générateur de Quittances de Loyer

> Un générateur de quittances de loyer simple, gratuit, local-first et open-source.
> Vos données restent dans votre navigateur. Pas de compte, pas de cloud, pas de tracking.

<!-- TODO: ajouter une capture d'écran de l'app ici -->
<!-- ![Capture d'écran](docs/screenshot.png) -->

## Pourquoi ce projet

Les bailleurs particuliers qui louent un ou quelques biens n'ont pas besoin d'un SaaS complet de gestion locative. Ils ont besoin d'un outil qui mémorise leurs locataires et qui produit une quittance PDF conforme en deux clics — sans inscription, sans abonnement, sans envoyer leurs données chez un tiers.

C'est exactement ce que fait cet outil. Stockage `localStorage`, génération PDF côté client, aucun serveur.

## Fonctionnalités

- 📄 **Génération PDF** de quittances de loyer conformes (via [jsPDF](https://github.com/parallax/jsPDF)) — mise en page pro avec n° de quittance, encart période, tableau aligné loyer/charges/total, bloc signature et pied de page légal ; rendu en police [Inter](https://rsms.me/inter/) (accents et `€` propres)
- 🗓️ **Période couverte explicite** sur la quittance (1er au dernier jour du mois, personnalisable)
- 💳 **Mode de règlement** (virement / chèque / espèces / autre), défaut par locataire
- 📥 **Date d'encaissement** optionnelle (utile pour les locataires CAF)
- 👥 **Gestion des locataires** : ajout, modification, suppression, référence de bail optionnelle
- 🏠 **Configuration du bailleur** (nom, adresse, ville, signature, email/téléphone optionnels)
- 🔢 **Numérotation automatique** des quittances émises (`Q-YYYYMM-NNN`), incrémentée par mois
- ✏️ **Override mensuel** : modifier ponctuellement le loyer ou les charges pour un mois donné
- 📧 **Préparation d'email** : ouvre votre client mail avec sujet et corps pré-remplis (PDF à attacher manuellement)
- 📋 **Historique des quittances** : journal local de toutes les quittances émises, alerte anti-doublon, regénération à l'identique du PDF, filtres locataire/année, export XLSX
- 💾 **Export / import JSON** : sauvegarde et restauration de toutes vos données (validées par schéma)
- 🔢 **Conversion automatique** du montant en lettres (exigence légale)
- ♿ **Accessible** : navigation clavier WAI-ARIA sur les onglets, modales avec focus trap
- 📱 **Responsive** : utilisable depuis un téléphone, une tablette ou un ordinateur

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

1. Onglet **Configuration** : renseignez vos informations de bailleur (nom, adresse, ville, signature).
2. Onglet **Locataires** : ajoutez vos locataires (nom, adresse du logement, loyer, charges, mode de règlement par défaut).
3. Onglet **Générer** : sélectionnez un locataire, un mois, ajustez la période ou le mode de règlement si besoin, puis cliquez sur « Télécharger la quittance PDF ».

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
- **v1.2** — Mode PWA : installable, fonctionne hors-ligne.
- **v2.0** — Multi-bailleurs et multi-biens.

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
