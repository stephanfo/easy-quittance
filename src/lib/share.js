/**
 * Web Share API : partage natif d'un PDF.
 *
 * Retourne true si le partage a abouti OU a été annulé par l'utilisateur
 * (dans les deux cas on évite le fallback `doc.save()` côté appelant — l'utilisateur
 * a vu la feuille de partage).
 * Retourne false si l'API n'est pas supportée ou si une erreur autre qu'AbortError
 * est levée — l'appelant doit alors retomber sur le téléchargement classique.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {object} [nav=globalThis.navigator] Injecté pour les tests.
 * @returns {Promise<boolean>}
 */
export async function sharePDFIfPossible(blob, filename, nav = globalThis.navigator) {
  if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function') {
    return false;
  }
  const FileCtor = globalThis.File;
  if (typeof FileCtor !== 'function') return false;
  const file = new FileCtor([blob], filename, { type: 'application/pdf' });
  if (!nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title: filename });
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return true;
    return false;
  }
}
