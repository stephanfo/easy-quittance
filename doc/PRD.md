# PRD — Générateur de Quittances de Loyer

> Document de cadrage produit. Voir aussi : [README.md](../README.md) (doc utilisateur).
> Statut : v2.0 livrée · v2.1 en cours.

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

**v2.1 — Personnalisation PDF et robustesse données** *(en cours)*

- 🚧 **Signature image** du bailleur (upload local, base64, affichée sur la quittance à la place du nom en texte)
- 🚧 **Logo bailleur** optionnel dans l'en-tête PDF (utile SCI / société civile)
- 🚧 **Reçu de dépôt de garantie** : génération d'un document distinct + champ `depotGarantie` (montant) sur la fiche locataire
- 🚧 **Contraste accessibilité renforcé** : textes mutés passés de ~4.1:1 à ~5.5:1 (WCAG AAA pour le corps de texte)
- 🚧 **Détection localStorage saturé** : alerte utilisateur quand l'espace de stockage approche la limite (~5 Mo) + proposition d'archivage (export JSON + purge entrées >2 ans)

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
| Tests | Vitest pour les fonctions pures (`nombreEnLettres`, période, schéma, historique) |
| Stockage | `localStorage` (clé `quittances_data`) |

Le tout reste **100% client-side**, build produit du HTML/CSS/JS statique déployable n'importe où.

## Métriques de succès

Le projet étant local-first et sans backend, **on n'instrumente rien**. Les seuls signaux disponibles sont :

- ⭐ Stars GitHub (intérêt communautaire)
- 🐛 Issues ouvertes (besoins non couverts, bugs réels)
- 🔁 Pull requests (santé contributive)

Pas de tracking, pas d'analytics — c'est cohérent avec le principe local-first.
