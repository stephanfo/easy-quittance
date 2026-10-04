import { describe, it, expect } from 'vitest';
import { shouldShowInstallBanner, INSTALL_DISMISS_KEY, safariInstallPlatform } from '../lib/pwa.js';

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

describe('safariInstallPlatform', () => {
  const UA = {
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    iphoneChrome:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
    macSafari:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    macChrome:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
    windowsChrome:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  };

  it('iOS (tout navigateur) → ios', () => {
    expect(safariInstallPlatform(UA.iphone)).toBe('ios');
    expect(safariInstallPlatform(UA.iphoneChrome)).toBe('ios');
  });

  it('iPadOS (UA Macintosh + tactile) → ios', () => {
    expect(safariInstallPlatform(UA.macSafari, 5)).toBe('ios');
  });

  it('Safari macOS → macos', () => {
    expect(safariInstallPlatform(UA.macSafari, 0)).toBe('macos');
  });

  it('autres navigateurs desktop → null', () => {
    expect(safariInstallPlatform(UA.macChrome)).toBeNull();
    expect(safariInstallPlatform(UA.macFirefox)).toBeNull();
    expect(safariInstallPlatform(UA.windowsChrome)).toBeNull();
    expect(safariInstallPlatform('')).toBeNull();
  });
});
