// Helper de substitution pour les templates d'email personnalisables.
// Format de placeholder : {nomDeVariable}. Une variable inconnue est remplacée par '' (silencieuse).
// La substitution n'est pas récursive : `{a}` où `vars.a = '{b}'` produit `{b}`, pas une 2e passe.

export const AVAILABLE_PLACEHOLDERS = [
  { key: 'locataire', label: 'Nom du locataire' },
  { key: 'mois', label: 'Mois (texte)' },
  { key: 'annee', label: 'Année' },
  { key: 'bailleur', label: 'Nom du bailleur' },
  { key: 'signature', label: 'Signature (texte du bailleur)' },
];

export function renderTemplate(str, vars) {
  if (typeof str !== 'string' || !str) return '';
  const v = vars || {};
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    const val = v[key];
    return val == null ? '' : String(val);
  });
}
