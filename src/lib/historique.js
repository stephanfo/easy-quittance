// Fonctions pures pour gérer l'historique des quittances émises.
// Une entrée d'historique est un snapshot complet (bailleur + locataire + montants + période)
// permettant de regénérer le PDF à l'identique, même si la fiche locataire évolue ensuite.

export function generateHistoriqueId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildHistoriqueEntry({
  bailleur,
  locataire,
  moisNum,
  annee,
  loyer,
  charges,
  periodeDebut,
  periodeFin,
  modeReglement,
  dateEncaissement,
}) {
  return {
    id: generateHistoriqueId(),
    dateGeneration: new Date().toISOString(),
    moisNum: String(moisNum || ''),
    annee: String(annee || ''),
    bailleur: {
      nom: bailleur?.nom || '',
      adresse: bailleur?.adresse || '',
      ville: bailleur?.ville || '',
      signature: bailleur?.signature || '',
    },
    locataire: {
      nom: locataire?.nom || '',
      email: locataire?.email || '',
      adresse: locataire?.adresse || '',
      loyer: Number(locataire?.loyer) || 0,
      charges: Number(locataire?.charges) || 0,
      modeReglement: locataire?.modeReglement || '',
    },
    loyer: Number(loyer) || 0,
    charges: Number(charges) || 0,
    periodeDebut: periodeDebut || '',
    periodeFin: periodeFin || '',
    modeReglement: modeReglement || '',
    dateEncaissement: dateEncaissement || '',
  };
}

export function findDoublons(historique, locataireNom, moisNum, annee) {
  if (!Array.isArray(historique)) return [];
  return historique.filter(
    (h) =>
      h.locataire?.nom === locataireNom &&
      h.moisNum === String(moisNum) &&
      h.annee === String(annee),
  );
}

export function filterAndSort(historique, { locataireNom = '', annee = '' } = {}) {
  if (!Array.isArray(historique)) return [];
  const filtered = historique.filter((h) => {
    if (locataireNom && h.locataire?.nom !== locataireNom) return false;
    if (annee && h.annee !== String(annee)) return false;
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
