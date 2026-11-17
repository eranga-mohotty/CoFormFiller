/**
 * Vault UI Rendering & Setup Modal Helpers
 */

import { $ } from './common.js';
import { isVaultEncrypted, isVaultLocked } from '../../services/storage.js';
import { evaluatePassphraseStrength } from '../../services/crypto.js';

function applyBadgeStyle(badge: HTMLElement | null, bg: string, color: string, text: string): void {
  if (!badge) return;
  badge.className = 'badge';
  badge.style.background = bg;
  badge.style.color = color;
  badge.textContent = text;
}

export async function renderVaultStatus(): Promise<void> {
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

export function updateStrengthDisplay(val: string): void {
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

export function showFormError(errEl: HTMLElement | null, msg: string): void {
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

export function setupSetupFormToggles(onToggleMode: (isChanging: boolean) => void): void {
  $('btnShowVaultSetup')?.addEventListener('click', () => {
    onToggleMode(false);
    const title = $('vaultSetupTitle');
    if (title) title.textContent = 'Setup Vault Encryption';
    $('vaultCurrentPasswordGroup')?.classList.add('hidden');
    const newPass = $<HTMLInputElement>('vaultNewPassword');
    const confirmPass = $<HTMLInputElement>('vaultConfirmPassword');
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';
    $('vaultSetupError')?.classList.add('hidden');
    $('vaultSetupForm')?.classList.remove('hidden');
    newPass?.focus();
  });

  $('btnShowChangePassword')?.addEventListener('click', () => {
    onToggleMode(true);
    const title = $('vaultSetupTitle');
    if (title) title.textContent = 'Change Master Password / PIN';
    $('vaultCurrentPasswordGroup')?.classList.remove('hidden');
    const curPass = $<HTMLInputElement>('vaultCurrentPassword');
    const newPass = $<HTMLInputElement>('vaultNewPassword');
    const confirmPass = $<HTMLInputElement>('vaultConfirmPassword');
    if (curPass) curPass.value = '';
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';
    $('vaultSetupError')?.classList.add('hidden');
    $('vaultSetupForm')?.classList.remove('hidden');
    curPass?.focus();
  });

  $('btnCancelVaultSetup')?.addEventListener('click', () => {
    $('vaultSetupForm')?.classList.add('hidden');
  });
}
