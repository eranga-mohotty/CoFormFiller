/**
 * Vault Encryption & Security Controller for Options Dashboard
 */

import { $, showToast } from './common.js';
import {
  unlockVault,
  lockVault,
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase
} from '../../services/storage.js';
import {
  renderVaultStatus,
  updateStrengthDisplay,
  showFormError,
  setupSetupFormToggles
} from './vault-ui.js';

export { renderVaultStatus } from './vault-ui.js';

let isChangingPassword = false;

async function handleSetupSubmit(onStateChange?: () => Promise<void> | void): Promise<void> {
  const newPass = $<HTMLInputElement>('vaultNewPassword')?.value || '';
  const confirmPass = $<HTMLInputElement>('vaultConfirmPassword')?.value || '';
  const errEl = $('vaultSetupError');

  if (!newPass) return showFormError(errEl, 'Please enter a PIN or Password.');
  if (newPass !== confirmPass) return showFormError(errEl, 'Passwords do not match. Please re-enter.');

  const btn = $<HTMLButtonElement>('btnConfirmVaultSetup');
  if (btn) { btn.disabled = true; btn.textContent = 'Encrypting...'; }

  try {
    if (isChangingPassword) {
      const curPass = $<HTMLInputElement>('vaultCurrentPassword')?.value || '';
      await changeVaultPassphrase(curPass, newPass);
      showToast('Master Password successfully changed!');
    } else {
      await setupVaultEncryption(newPass);
      showToast('Vault Encryption successfully enabled!');
    }
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
  } catch (err: unknown) {
    showFormError(errEl, err instanceof Error ? err.message : String(err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save & Encrypt'; }
  }
}

async function handleUnlockSubmit(onStateChange?: () => Promise<void> | void): Promise<void> {
  const input = $<HTMLInputElement>('vaultUnlockInput');
  const pass = input?.value || '';
  const errEl = $('vaultUnlockError');
  if (!pass) return showFormError(errEl, 'Please enter your Master PIN or Password.');

  const btn = $<HTMLButtonElement>('btnUnlockVaultNow');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
  const res = await unlockVault(pass);
  if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }

  if (res.success) {
    if (input) input.value = '';
    errEl?.classList.add('hidden');
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
    showToast('Vault unlocked successfully!');
  } else if (errEl) {
    errEl.textContent = res.error || 'Incorrect PIN or Password.';
    errEl.classList.remove('hidden');
  }
}

async function handleDisableSubmit(onStateChange?: () => Promise<void> | void): Promise<void> {
  const pass = $<HTMLInputElement>('vaultDisablePassword')?.value || '';
  const errEl = $('vaultDisableError');
  if (!pass) return showFormError(errEl, 'Please enter your current Master PIN or Password.');

  const btn = $<HTMLButtonElement>('btnConfirmDisableVault');
  if (btn) { btn.disabled = true; btn.textContent = 'Decrypting...'; }
  try {
    await disableVaultEncryption(pass);
    showToast('Vault encryption disabled. All data stored in standard storage.');
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
  } catch (err: unknown) {
    showFormError(errEl, err instanceof Error ? err.message : String(err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Disable Encryption'; }
  }
}

export function initVaultController(onStateChange?: () => Promise<void> | void): void {
  $<HTMLInputElement>('vaultNewPassword')?.addEventListener('input', (e: Event) => {
    updateStrengthDisplay((e.target as HTMLInputElement).value);
  });
  setupSetupFormToggles((mode) => { isChangingPassword = mode; });

  $('btnConfirmVaultSetup')?.addEventListener('click', () => { void handleSetupSubmit(onStateChange); });
  $('btnLockVaultNow')?.addEventListener('click', async () => {
    await lockVault();
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
    showToast('Vault locked.');
  });

  $('btnUnlockVaultNow')?.addEventListener('click', () => { void handleUnlockSubmit(onStateChange); });
  $('vaultUnlockInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') void handleUnlockSubmit(onStateChange);
  });

  $('btnShowDisableVault')?.addEventListener('click', () => {
    const input = $<HTMLInputElement>('vaultDisablePassword');
    if (input) input.value = '';
    $('vaultDisableError')?.classList.add('hidden');
    $('vaultDisableForm')?.classList.remove('hidden');
    input?.focus();
  });
  $('btnCancelDisableVault')?.addEventListener('click', () => { $('vaultDisableForm')?.classList.add('hidden'); });
  $('btnConfirmDisableVault')?.addEventListener('click', () => { void handleDisableSubmit(onStateChange); });
}
