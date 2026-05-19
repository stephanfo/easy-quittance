import { describe, it, expect } from 'vitest';
import { shouldShowInstallBanner, INSTALL_DISMISS_KEY } from '../lib/pwa.js';

describe('shouldShowInstallBanner', () => {
  it('renvoie true si pas en standalone et pas dismissed', () => {
    expect(shouldShowInstallBanner({ standalone: false, dismissed: false })).toBe(true);
  });

  it('renvoie false si déjà en mode standalone', () => {
    expect(shouldShowInstallBanner({ standalone: true, dismissed: false })).toBe(false);
  });

  it("renvoie false si l'utilisateur a déjà rejeté la bannière", () => {
    expect(shouldShowInstallBanner({ standalone: false, dismissed: true })).toBe(false);
  });

  it('renvoie false dans tous les autres cas (standalone OU dismissed)', () => {
    expect(shouldShowInstallBanner({ standalone: true, dismissed: true })).toBe(false);
  });
});

describe('INSTALL_DISMISS_KEY', () => {
  it('utilise une clé localStorage namespacée et stable', () => {
    expect(INSTALL_DISMISS_KEY).toBe('quittance_pwa_install_dismissed');
  });
});
