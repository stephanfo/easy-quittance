export function formatMontant(nombre) {
  return Number(nombre).toFixed(2).replace('.', ',');
}

export function formatDateFR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const MOIS_NOMS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function moisNom(moisNum) {
  const idx = parseInt(moisNum, 10) - 1;
  return MOIS_NOMS[idx] || '';
}

export function moisTexte(moisNum, annee) {
  const nom = moisNom(moisNum);
  return nom ? `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}` : '';
}
