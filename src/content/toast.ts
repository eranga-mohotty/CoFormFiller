/**
 * Toast Notification Helper for Content Script
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function getOrCreateToast(): HTMLDivElement {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'smartform-toast';
    document.body.appendChild(toastEl);
  }
  return toastEl;
}

export function showToast(message: string, type: ToastType = 'info', duration = 3500): void {
  const toast = getOrCreateToast();
  toast.textContent = message;
  toast.className = `show ${type}`;

  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = '';
    toastTimer = null;
  }, duration);
}
