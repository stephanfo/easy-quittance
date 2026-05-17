# PRD — Générateur de Quittances de Loyer

> Document de cadrage produit. Voir aussi : [README.md](../README.md) (doc utilisateur).
> Statut : v1.1 livrée ; roadmap v1.2+ à planifier.

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

## État actuel — v1.1

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

## Roadmap

### v1.2 — PWA / mode offline

**Objectif** : installable sur mobile/desktop, fonctionne sans connexion.

- **Manifest** + **Service Worker** pour cache-first.
- Icônes PWA (192px, 512px).
- Bannière d'installation discrète sur mobile.

### v2.0 — Multi-bailleurs / multi-biens

**Objectif** : couvrir le cas réaliste où un même utilisateur gère plusieurs biens ou plusieurs SCI.

Refonte du modèle de données :

```
bailleurs[]
  └── biens[]
        └── locataires[]
              └── historique[]
```

- **Sélecteur de bailleur** dans l'onglet « Générer ».
- **Migration automatique** depuis le schéma v1.x : l'unique bailleur existant devient `bailleurs[0]`, ses locataires sont rattachés à `biens[0]`.
- **Gestion des colocations** : possibilité d'avoir plusieurs noms sur une même quittance.

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
| PDF | jsPDF (embarqué via npm, pas de CDN) |
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
