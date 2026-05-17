let toastContainer = null;
let modalRoot = null;

function ensureContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.setAttribute('role', 'status');
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.className =
    'fixed top-4 right-4 z-[2000] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto pointer-events-none';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

const variants = {
  success: 'bg-apple-success-bg text-[#00783e] border-apple-success',
  error: 'bg-[#ffe5e5] text-[#d32f2f] border-apple-danger',
  warning: 'bg-[#fff4e5] text-[#f57c00] border-apple-warning',
  info: 'bg-apple-bg text-apple-text border-apple-border',
};

export function toast(message, variant = 'info', durationMs = 3500) {
  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = `pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-md transition-opacity duration-300 ${variants[variant] || variants.info}`;
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement('div');
  modalRoot.id = 'confirm-modal-root';
  document.body.appendChild(modalRoot);
  return modalRoot;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(container, previousActive) {
  function onKey(e) {
    if (e.key === 'Tab') {
      const focusables = container.querySelectorAll(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  container.addEventListener('keydown', onKey);
  return () => {
    container.removeEventListener('keydown', onKey);
    if (previousActive && typeof previousActive.focus === 'function') {
      previousActive.focus();
    }
  };
}

export function confirmDialog({
  title = 'Confirmation',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
} = {}) {
  const root = ensureModalRoot();
  const previousActive = document.activeElement;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className =
      'fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-title');

    overlay.innerHTML = `
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="confirm-title" class="mb-3 text-xl font-semibold text-apple-text"></h2>
        <p class="mb-5 text-sm text-apple-muted whitespace-pre-wrap"></p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-action="cancel"
            class="rounded-lg bg-apple-muted px-4 py-2 text-white hover:bg-[#86868b]"></button>
          <button type="button" data-action="confirm"
            class="rounded-lg px-4 py-2 text-white"></button>
        </div>
      </div>`;

    overlay.querySelector('#confirm-title').textContent = title;
    overlay.querySelector('p').textContent = message;
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    cancelBtn.textContent = cancelLabel;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className += danger
      ? ' bg-apple-danger hover:bg-apple-danger-hover'
      : ' bg-apple-blue hover:bg-apple-blue-hover';

    root.appendChild(overlay);

    const releaseTrap = trapFocus(overlay, previousActive);

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    }

    function cleanup(result) {
      document.removeEventListener('keydown', onKey);
      releaseTrap();
      overlay.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    document.addEventListener('keydown', onKey);

    // Sur action destructive on focuse l'annulation par défaut (évite la validation réflexe par Entrée).
    setTimeout(() => (danger ? cancelBtn : confirmBtn).focus(), 0);
  });
}
