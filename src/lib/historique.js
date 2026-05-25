// Fonctions pures pour gérer l'historique des quittances émises.
// Une entrée d'historique est un snapshot complet (bailleur + bien + locataire + montants + période)
// permettant de regénérer le PDF à l'identique, même si la fiche locataire/bien évolue ensuite.

export function generateHistoriqueId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Snapshot bailleur **texte uniquement** : on capture les champs immutables au moment de
// l'émission (nom, adresse, signature texte, toggle). Les images base64 (signatureImage, logo)
// ne sont **pas** snapshottées pour éviter de saturer le localStorage — elles sont relues
// sur le bailleur courant à la réédition via resolveBailleurForRender. Fallback texte gracieux
// si le bailleur a été supprimé entre temps.
function snapshotBailleur(bailleur) {
  return {
    nom: bailleur?.nom || '',
    adresse: bailleur?.adresse || '',
    ville: bailleur?.ville || '',
    signature: bailleur?.signature || '',
    signatureActive:
      typeof bailleur?.signatureActive === 'boolean' ? bailleur.signatureActive : true,
    email: bailleur?.email || '',
    telephone: bailleur?.telephone || '',
  };
}

function snapshotBien(bien) {
  return {
    libelle: bien?.libelle || '',
    adresse: bien?.adresse || '',
    type: bien?.type || '',
    reference: bien?.reference || '',
  };
}

function snapshotLocataire(locataire) {
  return {
    nom: locataire?.nom || '',
    email: locataire?.email || '',
    loyer: Number(locataire?.loyer) || 0,
    charges: Number(locataire?.charges) || 0,
    modeReglement: locataire?.modeReglement || '',
    referenceBail: locataire?.referenceBail || '',
    coOccupants: locataire?.coOccupants || '',
    depotGarantie: Number(locataire?.depotGarantie) || 0,
  };
}

function emptyEntry({ type, bailleur, bien, locataire, numero, dateEmission }) {
  return {
    id: generateHistoriqueId(),
    type,
    numeroQuittance: numero || '',
    dateGeneration: new Date().toISOString(),
    moisNum: '',
    annee: '',
    bailleurId: bailleur?.id || '',
    bailleur: snapshotBailleur(bailleur),
    bien: snapshotBien(bien),
    locataire: snapshotLocataire(locataire),
    loyer: 0,
    charges: 0,
    periodeDebut: '',
    periodeFin: '',
    modeReglement: '',
    dateEncaissement: '',
    dateEmission: dateEmission || '',
    montantInitial: 0,
    montantRestitue: 0,
    retenuesTexte: '',
    dateEvenement: '',
  };
}

export function buildHistoriqueEntry({
  bailleur,
  bien,
  locataire,
  moisNum,
  annee,
  loyer,
  charges,
  periodeDebut,
  periodeFin,
  modeReglement,
  dateEncaissement,
  numeroQuittance = '',
  dateEmission = '',
}) {
  const entry = emptyEntry({
    type: 'quittance',
    bailleur,
    bien,
    locataire,
    numero: numeroQuittance,
    dateEmission,
  });
  entry.moisNum = String(moisNum || '');
  entry.annee = String(annee || '');
  entry.loyer = Number(loyer) || 0;
  entry.charges = Number(charges) || 0;
  entry.periodeDebut = periodeDebut || '';
  entry.periodeFin = periodeFin || '';
  entry.modeReglement = modeReglement || '';
  entry.dateEncaissement = dateEncaissement || '';
  // Date d'émission au format ISO YYYY-MM-DD. Stockée pour permettre la réédition à
  // l'identique (sinon chaque regénération afficherait la date du jour de la regen).
  return entry;
}

// Reçus de dépôt de garantie : entrée (encaissement) et sortie (restitution).
// `sousType` ∈ { 'entree', 'sortie' }. L'année est dérivée de dateEvenement (ISO YYYY-MM-DD).
export function buildHistoriqueRecuEntry({
  sousType,
  bailleur,
  bien,
  locataire,
  montantInitial,
  montantRestitue,
  retenuesTexte,
  dateEvenement,
  numeroRecu = '',
  dateEmission = '',
}) {
  if (sousType !== 'entree' && sousType !== 'sortie') {
    throw new Error(`sousType invalide : ${sousType}`);
  }
  const type = sousType === 'entree' ? 'recu_dg_entree' : 'recu_dg_sortie';
  const entry = emptyEntry({
    type,
    bailleur,
    bien,
    locataire,
    numero: numeroRecu,
    dateEmission,
  });
  // L'année facilite les filtres et le tri ; dérivée de dateEvenement (ou aujourd'hui si vide).
  const evt = dateEvenement || new Date().toISOString().slice(0, 10);
  entry.annee = evt.slice(0, 4);
  entry.dateEvenement = evt;
  entry.montantInitial = Number(montantInitial) || 0;
  entry.montantRestitue = Number(montantRestitue) || 0;
  entry.retenuesTexte = retenuesTexte || '';
  return entry;
}

// Numéro de quittance : séquence par (bailleur, mois). Chaque bailleur a sa propre numérotation
// comptable, indépendante des autres.
export function nextNumeroQuittance(historique, bailleurId, moisNum, annee) {
  const moisPad = String(moisNum || '').padStart(2, '0');
  const prefix = `Q-${annee}${moisPad}-`;
  let maxSeq = 0;
  if (Array.isArray(historique)) {
    for (const h of historique) {
      if (h?.bailleurId !== bailleurId) continue;
      if (typeof h?.numeroQuittance === 'string' && h.numeroQuittance.startsWith(prefix)) {
        const n = parseInt(h.numeroQuittance.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// Scope obligatoire par bailleur : deux bailleurs peuvent avoir un locataire homonyme,
// le doublon est local au comptable d'un bailleur.
// Limité aux quittances (les reçus DG ont leur propre détection via findDoublonsRecu).
export function findDoublons(historique, bailleurId, locataireNom, moisNum, annee) {
  if (!Array.isArray(historique)) return [];
  return historique.filter(
    (h) =>
      (h.type || 'quittance') === 'quittance' &&
      h.bailleurId === bailleurId &&
      h.locataire?.nom === locataireNom &&
      h.moisNum === String(moisNum) &&
      h.annee === String(annee),
  );
}

// Numéro de reçu DG : séquence par (bailleur, année, sousType).
// Préfixe DG-E-YYYY-NNN pour les entrées, DG-S-YYYY-NNN pour les sorties.
export function nextNumeroRecu(historique, bailleurId, annee, sousType) {
  const tag = sousType === 'sortie' ? 'S' : 'E';
  const typeAttendu = sousType === 'sortie' ? 'recu_dg_sortie' : 'recu_dg_entree';
  const prefix = `DG-${tag}-${annee}-`;
  let maxSeq = 0;
  if (Array.isArray(historique)) {
    for (const h of historique) {
      if (h?.bailleurId !== bailleurId) continue;
      if (h?.type !== typeAttendu) continue;
      if (typeof h?.numeroQuittance === 'string' && h.numeroQuittance.startsWith(prefix)) {
        const n = parseInt(h.numeroQuittance.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// Un seul reçu d'entrée et un seul reçu de sortie par (bailleurId, locataire.nom).
// Pas de scope mois/année : un DG est un événement de début ou fin de bail, pas mensuel.
export function findDoublonsRecu(historique, bailleurId, locataireNom, sousType) {
  if (!Array.isArray(historique)) return [];
  const typeAttendu = sousType === 'sortie' ? 'recu_dg_sortie' : 'recu_dg_entree';
  return historique.filter(
    (h) =>
      h.type === typeAttendu &&
      h.bailleurId === bailleurId &&
      h.locataire?.nom === locataireNom,
  );
}

// Résout les champs visuels (image signature, logo, toggle) en privilégiant le bailleur courant.
// Permet de réutiliser la dernière image uploadée plutôt que de dupliquer en base64 dans chaque
// snapshot d'historique. Fallback gracieux si le bailleur a été supprimé : on prend
// signatureActive du snapshot et aucune image.
export function resolveBailleurForRender(entry, bailleursCourants) {
  const courant = Array.isArray(bailleursCourants)
    ? bailleursCourants.find((b) => b?.id === entry?.bailleurId)
    : null;
  if (courant) {
    return {
      signatureActive:
        typeof courant.signatureActive === 'boolean' ? courant.signatureActive : true,
      signatureImage: courant.signatureImage || '',
      logo: courant.logo || '',
    };
  }
  return {
    signatureActive:
      typeof entry?.bailleur?.signatureActive === 'boolean'
        ? entry.bailleur.signatureActive
        : true,
    signatureImage: '',
    logo: '',
  };
}

export function filterAndSort(
  historique,
  { locataireNom = '', annee = '', bailleurId = '', bienLibelle = '', type = '' } = {},
) {
  if (!Array.isArray(historique)) return [];
  const filtered = historique.filter((h) => {
    if (type && (h.type || 'quittance') !== type) return false;
    if (locataireNom && h.locataire?.nom !== locataireNom) return false;
    if (annee && h.annee !== String(annee)) return false;
    if (bailleurId && h.bailleurId !== bailleurId) return false;
    if (bienLibelle && (h.bien?.libelle || '') !== bienLibelle) return false;
    return true;
  });
  return filtered.slice().sort((a, b) => {
    // Tri desc par dateGeneration (ISO string → tri lexicographique correct).
    if (a.dateGeneration > b.dateGeneration) return -1;
    if (a.dateGeneration < b.dateGeneration) return 1;
    return 0;
  });
}

export function listeFiltreLocataires(historique) {
  if (!Array.isArray(historique)) return [];
  const set = new Set();
  for (const h of historique) {
    if (h.locataire?.nom) set.add(h.locataire.nom);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function listeFiltreAnnees(historique) {
  if (!Array.isArray(historique)) return [];
  const set = new Set();
  for (const h of historique) {
    if (h.annee) set.add(String(h.annee));
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

// Liste des libellés de bien présents dans l'historique (pour le sélecteur de filtre).
export function listeFiltreBiens(historique) {
  if (!Array.isArray(historique)) return [];
  const set = new Set();
  for (const h of historique) {
    if (h.bien?.libelle) set.add(h.bien.libelle);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
}
