import { loadWelcomeSeen } from './storage.js';

export const INSTALL_DISMISS_KEY = 'quittance_pwa_install_dismissed';
const INSTALL_BANNER_DELAY_MS = 3000;

export function shouldShowInstallBanner({ standalone, dismissed }) {
  return !standalone && !dismissed;
}

// Safari n'émet pas `beforeinstallprompt` : l'installation passe par un menu natif qu'on ne
// peut qu'expliquer. Renvoie 'ios' (tout navigateur iOS/iPadOS, tous sur WebKit), 'macos'
// (Safari desktop, « Ajouter au Dock » depuis Sonoma) ou null. iPadOS se déclare « Macintosh »
// mais expose des points de contact tactiles.
export function safariInstallPlatform(userAgent = '', maxTouchPoints = 0) {
  const ua = String(userAgent);
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  const isMacSafari =
    /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  if (!isMacSafari) return null;
  return maxTouchPoints > 1 ? 'ios' : 'macos';
}

export const SAFARI_INSTALL_STEPS = {
  ios: 'Bouton Partager, puis « Sur l’écran d’accueil ».',
  macos: 'Menu Fichier, puis « Ajouter au Dock ».',
};

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true;
  return false;
}

function isDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  } catch {
    // localStorage indisponible : on accepte de re-proposer plus tard
  }
}

function buildInstallBanner({ onInstall, onDismiss, description, installLabel = 'Installer' }) {
  const root = document.createElement('div');
  root.id = 'pwa-install-banner';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Installer Quittance');
  root.className =
    'fixed bottom-4 left-4 right-4 z-[1800] rounded-lg border border-apple-border bg-white p-4 shadow-md sm:left-auto sm:right-4 sm:max-w-sm';

  const title = document.createElement('p');
  title.className = 'mb-1 text-sm font-semibold text-apple-text';
  title.textContent = 'Installer Quittance';

  const desc = document.createElement('p');
  desc.className = 'mb-3 text-sm text-apple-muted';
  desc.textContent =
    description || "Ajoutez l'app à votre écran d'accueil pour un accès rapide et hors-ligne.";

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';

  const laterBtn = document.createElement('button');
  laterBtn.type = 'button';
  laterBtn.className =
    'rounded-lg bg-apple-muted px-3 py-1.5 text-sm text-white hover:bg-[#86868b]';
  laterBtn.textContent = 'Plus tard';
  laterBtn.addEventListener('click', onDismiss);

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className =
    'rounded-lg bg-apple-blue px-3 py-1.5 text-sm text-white hover:bg-apple-blue-hover';
  installBtn.textContent = installLabel;
  installBtn.addEventListener('click', onInstall);

  actions.appendChild(laterBtn);
  actions.appendChild(installBtn);
  root.appendChild(title);
  root.appendChild(desc);
  root.appendChild(actions);

  return root;
}

// Pas de bannière d'installation par-dessus l'écran d'accueil de la première visite :
// on attend sa fermeture (événement émis par closeWelcome dans app.js).
function afterWelcome(fn) {
  if (loadWelcomeSeen()) fn();
  else window.addEventListener('quittance:welcome-closed', fn, { once: true });
}

export function setupInstallPrompt() {
  if (typeof window === 'undefined') return;

  const safari = safariInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
  if (safari) {
    if (!shouldShowInstallBanner({ standalone: isStandalone(), dismissed: isDismissed() })) return;
    afterWelcome(() => setTimeout(() => {
      const root = buildInstallBanner({
        description:
          'Safari efface les données des sites non ouverts depuis 7 jours. Installez l’app pour les protéger : ' +
          SAFARI_INSTALL_STEPS[safari],
        installLabel: 'Compris',
        onInstall: () => {
          markDismissed();
          root.remove();
        },
        onDismiss: () => root.remove(),
      });
      document.body.appendChild(root);
    }, INSTALL_BANNER_DELAY_MS));
    return;
  }

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (
      !shouldShowInstallBanner({
        standalone: isStandalone(),
        dismissed: isDismissed(),
      })
    ) {
      return;
    }

    afterWelcome(() => setTimeout(() => {
      if (!deferredPrompt) return;

      const root = buildInstallBanner({
        onInstall: async () => {
          root.remove();
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          deferredPrompt = null;
        },
        onDismiss: () => {
          markDismissed();
          root.remove();
        },
      });

      document.body.appendChild(root);
    }, INSTALL_BANNER_DELAY_MS));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

function buildUpdateToast({ onRefresh }) {
  const root = document.createElement('div');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.className =
    'fixed bottom-4 left-1/2 z-[1900] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-apple-border bg-white px-4 py-3 text-sm text-apple-text shadow-md';

  const msg = document.createElement('span');
  msg.textContent = 'Nouvelle version disponible.';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'rounded-lg bg-apple-blue px-3 py-1 text-sm text-white hover:bg-apple-blue-hover';
  btn.textContent = 'Recharger';
  btn.addEventListener('click', onRefresh);

  root.appendChild(msg);
  root.appendChild(btn);
  return root;
}

export async function setupServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      onNeedRefresh() {
        const toast = buildUpdateToast({
          onRefresh: () => {
            toast.remove();
            updateSW(true);
          },
        });
        document.body.appendChild(toast);
      },
    });
  } catch {
    // SW indisponible (dev, navigateur non supporté) : on ignore
  }
}
