// Montant français : 1234.5 → "1234,50". Renvoie "0,00" pour NaN/undefined/Infinity
// (les callers attendent toujours une chaîne affichable).
export function formatMontant(nombre) {
  const n = Number(nombre);
  if (!Number.isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

// Date ISO YYYY-MM-DD → DD/MM/YYYY. Valide strictement le format en entrée
// (sinon "abc" devenait "undefined/undefined/abc"). Renvoie '' si format invalide.
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function formatDateFR(dateStr) {
  if (!dateStr) return '';
  const m = ISO_DATE_RE.exec(String(dateStr));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const MOIS_NOMS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function moisNom(moisNum) {
  const idx = parseInt(moisNum, 10) - 1;
  return MOIS_NOMS[idx] || '';
}

// Nom du mois capitalisé, sans année (ex: "Juin"). Pour le placeholder {mois}
// des templates email, où {annee} est un placeholder distinct.
export function moisCapitalise(moisNum) {
  const nom = moisNom(moisNum);
  return nom ? `${nom.charAt(0).toUpperCase()}${nom.slice(1)}` : '';
}

export function moisTexte(moisNum, annee) {
  const nom = moisNom(moisNum);
  return nom ? `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${annee}` : '';
}
