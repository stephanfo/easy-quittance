// Fonctions pures pour gérer l'historique des quittances émises.
// Une entrée d'historique est un snapshot complet (bailleur + bien + locataire + montants + période)
// permettant de regénérer le PDF à l'identique, même si la fiche locataire/bien évolue ensuite.

export function generateHistoriqueId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  return {
    id: generateHistoriqueId(),
    numeroQuittance: numeroQuittance || '',
    dateGeneration: new Date().toISOString(),
    moisNum: String(moisNum || ''),
    annee: String(annee || ''),
    bailleurId: bailleur?.id || '',
    bailleur: {
      nom: bailleur?.nom || '',
      adresse: bailleur?.adresse || '',
      ville: bailleur?.ville || '',
      signature: bailleur?.signature || '',
      email: bailleur?.email || '',
      telephone: bailleur?.telephone || '',
    },
    bien: {
      libelle: bien?.libelle || '',
      adresse: bien?.adresse || '',
      type: bien?.type || '',
      reference: bien?.reference || '',
    },
    locataire: {
      nom: locataire?.nom || '',
      email: locataire?.email || '',
      loyer: Number(locataire?.loyer) || 0,
      charges: Number(locataire?.charges) || 0,
      modeReglement: locataire?.modeReglement || '',
      referenceBail: locataire?.referenceBail || '',
      coOccupants: locataire?.coOccupants || '',
    },
    loyer: Number(loyer) || 0,
    charges: Number(charges) || 0,
    periodeDebut: periodeDebut || '',
    periodeFin: periodeFin || '',
    modeReglement: modeReglement || '',
    dateEncaissement: dateEncaissement || '',
    // Date d'émission au format ISO YYYY-MM-DD. Stockée pour permettre la réédition à
    // l'identique (sinon chaque regénération afficherait la date du jour de la regen).
    dateEmission: dateEmission || '',
  };
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
export function findDoublons(historique, bailleurId, locataireNom, moisNum, annee) {
  if (!Array.isArray(historique)) return [];
  return historique.filter(
    (h) =>
      h.bailleurId === bailleurId &&
      h.locataire?.nom === locataireNom &&
      h.moisNum === String(moisNum) &&
      h.annee === String(annee),
  );
}

export function filterAndSort(
  historique,
  { locataireNom = '', annee = '', bailleurId = '', bienLibelle = '' } = {},
) {
  if (!Array.isArray(historique)) return [];
  const filtered = historique.filter((h) => {
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
