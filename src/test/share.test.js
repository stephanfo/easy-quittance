import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sharePDFIfPossible } from '../lib/share.js';

const fakeBlob = { size: 10, type: 'application/pdf' };

class FakeFile {
  constructor(parts, name, opts) {
    this.parts = parts;
    this.name = name;
    this.type = opts?.type;
  }
}

describe('sharePDFIfPossible', () => {
  beforeEach(() => {
    vi.stubGlobal('File', FakeFile);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retourne false si navigator est absent', async () => {
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', undefined)).toBe(false);
  });

  it("retourne false si navigator.canShare n'existe pas", async () => {
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', {})).toBe(false);
  });

  it('retourne false si navigator.share est absent', async () => {
    expect(
      await sharePDFIfPossible(fakeBlob, 'q.pdf', { canShare: () => true }),
    ).toBe(false);
  });

  it("retourne false si File n'est pas dispo dans l'environnement", async () => {
    vi.stubGlobal('File', undefined);
    const nav = { canShare: () => true, share: vi.fn() };
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', nav)).toBe(false);
    expect(nav.share).not.toHaveBeenCalled();
  });

  it("retourne false si canShare({files}) refuse l'envoi", async () => {
    const nav = { canShare: () => false, share: vi.fn() };
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', nav)).toBe(false);
    expect(nav.share).not.toHaveBeenCalled();
  });

  it('appelle share et retourne true en cas de succès', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { canShare: () => true, share };
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', nav)).toBe(true);
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0][0];
    expect(arg.title).toBe('q.pdf');
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe('q.pdf');
    expect(arg.files[0].type).toBe('application/pdf');
  });

  it("retourne true quand l'utilisateur annule (AbortError) — pas de fallback download", async () => {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(err) };
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', nav)).toBe(true);
  });

  it("retourne false sur erreur autre qu'AbortError", async () => {
    const err = new Error('boom');
    err.name = 'NotAllowedError';
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(err) };
    expect(await sharePDFIfPossible(fakeBlob, 'q.pdf', nav)).toBe(false);
  });
});
