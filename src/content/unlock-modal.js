/**
 * Vault Unlock Modal UI for Content Script
 * Safely constructs DOM nodes without innerHTML
 */

let unlockPromptEl = null;

function createModalActions(onClose, onSubmit, input, errorEl) {
  const actions = document.createElement('div');
  actions.className = 'smartform-unlock-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'smartform-unlock-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', onClose);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'smartform-unlock-submit-btn';
  submitBtn.textContent = 'Unlock & Fill';
  submitBtn.addEventListener('click', () => onSubmit(input, errorEl, submitBtn));

  actions.append(cancelBtn, submitBtn);
  return { actions, submitBtn };
}

function createModalCard(onClose, onSubmit) {
  const card = document.createElement('div');
  card.className = 'smartform-unlock-card';

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

  const desc = document.createElement('p');
  desc.className = 'smartform-unlock-desc';
  desc.textContent = 'Enter your Master PIN or Password to unlock your knowledge profile and fill this form:';

  const body = document.createElement('div');
  body.className = 'smartform-unlock-body';
  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'smartform-unlock-input';
  input.placeholder = 'PIN or Password';
  const errorEl = document.createElement('div');
  errorEl.className = 'smartform-unlock-error hidden';
  body.append(input, errorEl);

  const { actions, submitBtn } = createModalActions(onClose, onSubmit, input, errorEl);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSubmit(input, errorEl, submitBtn);
    if (e.key === 'Escape') onClose();
  });

  card.append(header, desc, body, actions);
  return { card, input };
}

async function handleUnlockSubmission(input, errorEl, submitBtn, onUnlocked, closeModal) {
  const pin = input.value;
  if (!pin) {
    errorEl.textContent = 'Please enter PIN or password.';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'SMARTFORM_VAULT_UNLOCK',
      passphrase: pin
    });

    if (res && res.success) {
      closeModal();
      if (onUnlocked) onUnlocked();
    } else {
      errorEl.textContent = res?.error || 'Incorrect PIN or password.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock & Fill';
    }
  } catch (err) {
    errorEl.textContent = 'Error: ' + err.message;
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Unlock & Fill';
  }
}

export function showVaultUnlockPrompt(onUnlocked, onCancel) {
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
    (inp, errEl, sBtn) => handleUnlockSubmission(inp, errEl, sBtn, onUnlocked, closeModal)
  );

  unlockPromptEl.appendChild(card);
  document.body.appendChild(unlockPromptEl);
  setTimeout(() => input.focus(), 50);
}
