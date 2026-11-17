/**
 * Vault Unlock Modal UI for Content Script
 * Safely constructs DOM nodes without innerHTML
 */

import type { MessageResponse, VaultOperationResponseData } from '../types/index.js';

let unlockPromptEl: HTMLDivElement | null = null;

function createModalHeader(onClose: () => void): HTMLDivElement {
  const header = document.createElement('div');
  header.className = 'smartform-unlock-header';

  const title = document.createElement('span');
  title.className = 'smartform-unlock-title';
  title.textContent = '🔒 SmartForm AI Vault is Locked';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'smartform-unlock-close';
  closeBtn.title = 'Cancel';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', onClose);

  header.append(title, closeBtn);
  return header;
}

function createModalBody(): { body: HTMLDivElement; input: HTMLInputElement; errorEl: HTMLDivElement } {
  const body = document.createElement('div');
  body.className = 'smartform-unlock-body';

  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'smartform-unlock-input';
  input.placeholder = 'PIN or Password';

  const errorEl = document.createElement('div');
  errorEl.className = 'smartform-unlock-error hidden';

  body.append(input, errorEl);
  return { body, input, errorEl };
}

function createModalActions(
  onClose: () => void,
  onSubmit: () => void
): { actions: HTMLDivElement; submitBtn: HTMLButtonElement } {
  const actions = document.createElement('div');
  actions.className = 'smartform-unlock-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'smartform-unlock-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', onClose);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'smartform-unlock-submit-btn';
  submitBtn.textContent = 'Unlock & Fill';
  submitBtn.addEventListener('click', onSubmit);

  actions.append(cancelBtn, submitBtn);
  return { actions, submitBtn };
}

function createModalCard(
  onClose: () => void,
  onTriggerSubmit: (input: HTMLInputElement, errorEl: HTMLDivElement, submitBtn: HTMLButtonElement) => void
): { card: HTMLDivElement; input: HTMLInputElement } {
  const card = document.createElement('div');
  card.className = 'smartform-unlock-card';

  const desc = document.createElement('p');
  desc.className = 'smartform-unlock-desc';
  desc.textContent = 'Enter your Master PIN or Password to unlock your knowledge profile and fill this form:';

  const { body, input, errorEl } = createModalBody();
  const { actions, submitBtn } = createModalActions(onClose, () => onTriggerSubmit(input, errorEl, submitBtn));

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') onTriggerSubmit(input, errorEl, submitBtn);
    if (e.key === 'Escape') onClose();
  });

  card.append(createModalHeader(onClose), desc, body, actions);
  return { card, input };
}

async function handleUnlockSubmission(
  input: HTMLInputElement,
  errorEl: HTMLDivElement,
  submitBtn: HTMLButtonElement,
  onUnlocked?: () => void,
  closeModal?: () => void
): Promise<void> {
  const pin = input.value;
  if (!pin) {
    errorEl.textContent = 'Please enter PIN or password.';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    const res = (await chrome.runtime.sendMessage({
      action: 'UNLOCK_VAULT',
      type: 'SMARTFORM_VAULT_UNLOCK',
      payload: { passphrase: pin },
      passphrase: pin
    })) as MessageResponse<VaultOperationResponseData> | undefined;

    if (res?.success) {
      if (closeModal) closeModal();
      if (onUnlocked) onUnlocked();
    } else {
      errorEl.textContent = res?.error || 'Incorrect PIN or password.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock & Fill';
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorEl.textContent = 'Error: ' + msg;
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Unlock & Fill';
  }
}

export function showVaultUnlockPrompt(onUnlocked?: () => void, onCancel?: () => void): void {
  if (unlockPromptEl) unlockPromptEl.remove();

  unlockPromptEl = document.createElement('div');
  unlockPromptEl.id = 'smartform-unlock-modal';

  const closeModal = () => {
    if (unlockPromptEl) {
      unlockPromptEl.remove();
      unlockPromptEl = null;
    }
    if (onCancel) onCancel();
  };

  const { card, input } = createModalCard(
    closeModal,
    (inp, errEl, sBtn) => { void handleUnlockSubmission(inp, errEl, sBtn, onUnlocked, closeModal); }
  );

  unlockPromptEl.appendChild(card);
  document.body.appendChild(unlockPromptEl);
  setTimeout(() => input.focus(), 50);
}
