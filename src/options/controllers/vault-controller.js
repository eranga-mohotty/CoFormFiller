/**
 * Vault Encryption & Security Controller for Options Dashboard
 */

import { $, showToast } from './common.js';
import {
  isVaultEncrypted,
  isVaultLocked,
  unlockVault,
  lockVault,
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase
} from '../../services/storage.js';

import { evaluatePassphraseStrength } from '../../services/crypto.js';

let isChangingPassword = false;

function applyBadgeStyle(badge, bg, color, text) {
  if (!badge) return;
  badge.className = 'badge';
  badge.style.background = bg;
  badge.style.color = color;
  badge.textContent = text;
}

export async function renderVaultStatus() {
  const isEncrypted = await isVaultEncrypted();
  const isLocked = await isVaultLocked();
  const badge = $('vaultStatusBadge');

  if (!isEncrypted) {
    applyBadgeStyle(badge, '#eab308', '#000000', '⚠️ Unencrypted');
    $('vaultUnencryptedBox')?.classList.remove('hidden');
    $('vaultUnlockedBox')?.classList.add('hidden');
    $('vaultLockedBox')?.classList.add('hidden');
  } else if (isLocked) {
    applyBadgeStyle(badge, '#ef4444', '#ffffff', '🔒 Locked');
    $('vaultUnencryptedBox')?.classList.add('hidden');
    $('vaultUnlockedBox')?.classList.add('hidden');
    $('vaultLockedBox')?.classList.remove('hidden');
  } else {
    applyBadgeStyle(badge, '#10b981', '#ffffff', '🔓 Unlocked (AES-256-GCM)');
    $('vaultUnencryptedBox')?.classList.add('hidden');
    $('vaultUnlockedBox')?.classList.remove('hidden');
    $('vaultLockedBox')?.classList.add('hidden');
  }
  $('vaultSetupForm')?.classList.add('hidden');
  $('vaultDisableForm')?.classList.add('hidden');
}

function updateStrengthDisplay(val) {
  const ind = $('vaultStrengthIndicator');
  if (!ind) return;
  const strength = evaluatePassphraseStrength(val);
  if (!val) {
    ind.textContent = 'Tip: You can use a convenient 4-digit PIN for personal laptops, or a strong passphrase for shared computers.';
    ind.style.color = '#94a3b8';
  } else if (strength.level === 'pin') {
    ind.textContent = '⚡ Fast PIN (Convenient for personal devices — protected by salt & 600,000 PBKDF2 iterations)';
    ind.style.color = '#38bdf8';
  } else {
    ind.textContent = strength.level === 'good' ? '🛡️ Standard Password' : '🏰 Strong High-Entropy Passphrase';
    ind.style.color = strength.level === 'good' ? '#a3e635' : '#4ade80';
  }
}

async function handleSetupSubmit(onStateChange) {
  const newPass = $('vaultNewPassword')?.value || '';
  const confirmPass = $('vaultConfirmPassword')?.value || '';
  const errEl = $('vaultSetupError');

  if (!newPass) return showSetupError(errEl, 'Please enter a PIN or Password.');
  if (newPass !== confirmPass) return showSetupError(errEl, 'Passwords do not match. Please re-enter.');

  $('btnConfirmVaultSetup').disabled = true;
  $('btnConfirmVaultSetup').textContent = 'Encrypting...';

  try {
    if (isChangingPassword) {
      await changeVaultPassphrase($('vaultCurrentPassword')?.value || '', newPass);
      showToast('Master Password successfully changed!');
    } else {
      await setupVaultEncryption(newPass);
      showToast('Vault Encryption successfully enabled!');
    }
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
  } catch (err) {
    showSetupError(errEl, err.message);
  } finally {
    $('btnConfirmVaultSetup').disabled = false;
    $('btnConfirmVaultSetup').textContent = 'Save & Encrypt';
  }
}

function showSetupError(errEl, msg) {
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

async function handleUnlockSubmit(onStateChange) {
  const pass = $('vaultUnlockInput')?.value || '';
  const errEl = $('vaultUnlockError');
  if (!pass) {
    if (errEl) { errEl.textContent = 'Please enter your Master PIN or Password.'; errEl.classList.remove('hidden'); }
    return;
  }

  $('btnUnlockVaultNow').disabled = true;
  $('btnUnlockVaultNow').textContent = 'Verifying...';
  const res = await unlockVault(pass);
  $('btnUnlockVaultNow').disabled = false;
  $('btnUnlockVaultNow').textContent = 'Unlock';

  if (res.success) {
    $('vaultUnlockInput').value = '';
    errEl?.classList.add('hidden');
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
    showToast('Vault unlocked successfully!');
  } else if (errEl) {
    errEl.textContent = res.error || 'Incorrect PIN or Password.';
    errEl.classList.remove('hidden');
  }
}

async function handleDisableSubmit(onStateChange) {
  const pass = $('vaultDisablePassword')?.value || '';
  const errEl = $('vaultDisableError');
  if (!pass) return showSetupError(errEl, 'Please enter your current Master PIN or Password.');

  $('btnConfirmDisableVault').disabled = true;
  $('btnConfirmDisableVault').textContent = 'Decrypting...';
  try {
    await disableVaultEncryption(pass);
    showToast('Vault encryption disabled. All data stored in standard storage.');
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    $('btnConfirmDisableVault').disabled = false;
    $('btnConfirmDisableVault').textContent = 'Disable Encryption';
  }
}

function setupSetupFormToggles() {
  $('btnShowVaultSetup')?.addEventListener('click', () => {
    isChangingPassword = false;
    if ($('vaultSetupTitle')) $('vaultSetupTitle').textContent = 'Setup Vault Encryption';
    $('vaultCurrentPasswordGroup')?.classList.add('hidden');
    if ($('vaultNewPassword')) $('vaultNewPassword').value = '';
    if ($('vaultConfirmPassword')) $('vaultConfirmPassword').value = '';
    $('vaultSetupError')?.classList.add('hidden');
    $('vaultSetupForm')?.classList.remove('hidden');
    $('vaultNewPassword')?.focus();
  });

  $('btnShowChangePassword')?.addEventListener('click', () => {
    isChangingPassword = true;
    if ($('vaultSetupTitle')) $('vaultSetupTitle').textContent = 'Change Master Password / PIN';
    $('vaultCurrentPasswordGroup')?.classList.remove('hidden');
    if ($('vaultCurrentPassword')) $('vaultCurrentPassword').value = '';
    if ($('vaultNewPassword')) $('vaultNewPassword').value = '';
    if ($('vaultConfirmPassword')) $('vaultConfirmPassword').value = '';
    $('vaultSetupError')?.classList.add('hidden');
    $('vaultSetupForm')?.classList.remove('hidden');
    $('vaultCurrentPassword')?.focus();
  });

  $('btnCancelVaultSetup')?.addEventListener('click', () => $('vaultSetupForm')?.classList.add('hidden'));
}

export function initVaultController(onStateChange) {
  $('vaultNewPassword')?.addEventListener('input', () => updateStrengthDisplay($('vaultNewPassword').value));
  setupSetupFormToggles();

  $('btnConfirmVaultSetup')?.addEventListener('click', () => handleSetupSubmit(onStateChange));
  $('btnLockVaultNow')?.addEventListener('click', async () => {
    await lockVault();
    await renderVaultStatus();
    if (onStateChange) await onStateChange();
    showToast('Vault locked.');
  });

  $('btnUnlockVaultNow')?.addEventListener('click', () => handleUnlockSubmit(onStateChange));
  $('vaultUnlockInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUnlockSubmit(onStateChange); });

  $('btnShowDisableVault')?.addEventListener('click', () => {
    if ($('vaultDisablePassword')) $('vaultDisablePassword').value = '';
    $('vaultDisableError')?.classList.add('hidden');
    $('vaultDisableForm')?.classList.remove('hidden');
    $('vaultDisablePassword')?.focus();
  });
  $('btnCancelDisableVault')?.addEventListener('click', () => $('vaultDisableForm')?.classList.add('hidden'));
  $('btnConfirmDisableVault')?.addEventListener('click', () => handleDisableSubmit(onStateChange));
}
