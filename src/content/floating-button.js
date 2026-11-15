/**
 * Floating Button UI Controller for Content Script
 * Safely manages button states without innerHTML
 */

let floatingContainer = null;
let buttonEl = null;

function renderButtonIdle() {
  if (!buttonEl) return;
  buttonEl.classList.remove('loading');
  const sparkle = document.createElement('span');
  sparkle.className = 'smartform-btn-sparkle';
  sparkle.textContent = '✨';

  const text = document.createElement('span');
  text.className = 'smartform-btn-text';
  text.textContent = 'AI Fill';

  buttonEl.replaceChildren(sparkle, text);
}

export function setButtonLoading(statusText = 'Scanning...') {
  if (!buttonEl) return;
  buttonEl.classList.add('loading');
  const spinner = document.createElement('span');
  spinner.className = 'smartform-spinner';

  const text = document.createElement('span');
  text.className = 'smartform-btn-text';
  text.textContent = statusText;

  buttonEl.replaceChildren(spinner, text);
}

export function resetFloatingButton() {
  renderButtonIdle();
}

export function removeFloatingButton() {
  if (floatingContainer) {
    floatingContainer.remove();
    floatingContainer = null;
    buttonEl = null;
  }
}

export function ensureFloatingButton(onTrigger, position = 'bottom-right') {
  if (floatingContainer && floatingContainer.isConnected) return;
  if (floatingContainer) floatingContainer.remove();

  floatingContainer = document.createElement('div');
  floatingContainer.id = 'smartform-floating-container';
  floatingContainer.className = `pos-${position}`;

  buttonEl = document.createElement('button');
  buttonEl.className = 'smartform-float-btn';
  renderButtonIdle();

  buttonEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onTrigger) onTrigger();
  });

  floatingContainer.appendChild(buttonEl);
  document.body.appendChild(floatingContainer);
}
