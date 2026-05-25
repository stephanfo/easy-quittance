import { describe, it, expect, vi } from 'vitest';
import { validateImageFile, readImageAsDataUrl, IMAGE_UPLOAD_MAX_BYTES } from '../lib/image-upload.js';

function makeFile({ type = 'image/png', size = 1000 } = {}) {
  return { type, size };
}

describe('validateImageFile', () => {
  it('refuse un fichier manquant', () => {
    expect(validateImageFile(null)).toEqual({ ok: false, reason: 'missing' });
    expect(validateImageFile(undefined)).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuse un type non image', () => {
    expect(validateImageFile(makeFile({ type: 'application/pdf' }))).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('accepte PNG, JPEG, JPG (case-insensitive)', () => {
    expect(validateImageFile(makeFile({ type: 'image/png' })).ok).toBe(true);
    expect(validateImageFile(makeFile({ type: 'image/jpeg' })).ok).toBe(true);
    expect(validateImageFile(makeFile({ type: 'image/jpg' })).ok).toBe(true);
    expect(validateImageFile(makeFile({ type: 'IMAGE/PNG' })).ok).toBe(true);
  });

  it('refuse les fichiers > 500 Ko', () => {
    expect(validateImageFile(makeFile({ size: IMAGE_UPLOAD_MAX_BYTES + 1 }))).toEqual({
      ok: false,
      reason: 'size',
    });
  });

  it('accepte exactement à la limite', () => {
    expect(validateImageFile(makeFile({ size: IMAGE_UPLOAD_MAX_BYTES })).ok).toBe(true);
  });
});

describe('readImageAsDataUrl', () => {
  it('retourne null et appelle onError(reason) si fichier invalide', async () => {
    const onError = vi.fn();
    const result = await readImageAsDataUrl(null, onError);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith('missing');
  });

  it("appelle onError('type') pour un fichier non image", async () => {
    const onError = vi.fn();
    await readImageAsDataUrl(makeFile({ type: 'video/mp4' }), onError);
    expect(onError).toHaveBeenCalledWith('type');
  });

  it("appelle onError('size') pour un fichier trop gros", async () => {
    const onError = vi.fn();
    await readImageAsDataUrl(makeFile({ size: IMAGE_UPLOAD_MAX_BYTES + 1 }), onError);
    expect(onError).toHaveBeenCalledWith('size');
  });
});
