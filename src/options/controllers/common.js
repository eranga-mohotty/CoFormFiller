/**
 * Common Helpers for Options Dashboard
 */

export const $ = (id) => /** @type {any} */ (document.getElementById(id));

export function showToast(msg, isError = false) {
  const saveToast = $('saveToast');
  if (!saveToast) return;
  saveToast.textContent = msg;
  saveToast.style.background = isError ? '#dc2626' : '#10b981';
  saveToast.classList.remove('hidden');
  setTimeout(() => {
    saveToast.classList.add('hidden');
  }, 3000);
}
