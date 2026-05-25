// Helpers de lecture d'images depuis un <input type="file"> vers une dataURL base64.
// Utilisés pour la signature et le logo des bailleurs. Limite stricte 500 Ko avant base64
// (le localStorage est plafonné ~5 Mo, plusieurs bailleurs × image peuvent vite saturer).

const MAX_IMAGE_BYTES = 500 * 1024;
const ACCEPTED_IMAGE_TYPES = /^image\/(png|jpeg|jpg)$/i;

// Validation pure d'un fichier. Renvoie { ok: true } ou { ok: false, reason }
// où reason ∈ 'missing' | 'type' | 'size'.
export function validateImageFile(file) {
  if (!file) return { ok: false, reason: 'missing' };
  if (!ACCEPTED_IMAGE_TYPES.test(file.type)) return { ok: false, reason: 'type' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

// Lit un File en dataURL (PNG/JPEG ≤ 500 Ko). Renvoie la dataURL ou null si invalide.
// `onError(reason)` est appelé en cas d'échec pour permettre au caller de toaster.
export async function readImageAsDataUrl(file, onError) {
  const check = validateImageFile(file);
  if (!check.ok) {
    if (onError) onError(check.reason);
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => {
      if (onError) onError('read');
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

export const IMAGE_UPLOAD_MAX_BYTES = MAX_IMAGE_BYTES;
