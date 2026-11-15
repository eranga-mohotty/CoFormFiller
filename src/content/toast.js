/**
 * Toast Notification Helper for Content Script
 */

let toastEl = null;

function getOrCreateToast() {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'smartform-toast';
    document.body.appendChild(toastEl);
  }
  return toastEl;
}

export function showToast(message, type = 'info', duration = 3500) {
  const toast = getOrCreateToast();
  toast.textContent = message;
  toast.className = `show ${type}`;

  const t = /** @type {any} */ (toast);
  if (t._timer) clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    toast.className = '';
  }, duration);
}
