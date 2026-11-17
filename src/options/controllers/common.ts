/**
 * Common Helpers for Options Dashboard
 */

export function $<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function showToast(msg: string, isError = false): void {
  const saveToast = $<HTMLDivElement>('saveToast');
  if (!saveToast) return;
  saveToast.textContent = msg;
  saveToast.style.background = isError ? '#dc2626' : '#10b981';
  saveToast.classList.remove('hidden');
  setTimeout(() => {
    saveToast.classList.add('hidden');
  }, 3000);
}
