/**
 * SmartForm AI - Action Popup Main Controller
 * Coordinates UI rendering, user events, and IPC lifecycle.
 */

import {
  getPopupElements,
  updateVaultLockUi,
  renderProfileOptions,
  renderApiStatus,
  setVaultErrorMessage,
  setServiceOfflineUi,
  type PopupElements
} from './popup-ui.js';
import {
  getExtensionStatus,
  unlockVaultPassphrase,
  lockVaultNow,
  switchProfile,
  getActiveTabFieldCount,
  triggerTabFill,
  openOptionsTab,
  openTestFormsTab
} from './popup-ipc.js';

async function loadPopupStatus(els: PopupElements): Promise<void> {
  try {
    const status = await getExtensionStatus();
    updateVaultLockUi(els, status.isEncrypted, status.isLocked);
    renderProfileOptions(els, status.profiles, status.activeProfile?.id, status.isLocked);
    renderApiStatus(els, status.isLocked, status.hasApiKey, status.provider, status.model);
    const count = await getActiveTabFieldCount();
    els.fieldsCountBadge.textContent = count !== null ? String(count) : '?';
  } catch (_err) {
    setServiceOfflineUi(els);
  }
}

async function handleUnlockSubmit(els: PopupElements): Promise<void> {
  const pin = els.popupVaultPinInput?.value.trim() ?? '';
  if (!pin) {
    setVaultErrorMessage(els, 'Please enter PIN or password.');
    return;
  }

  if (els.btnPopupUnlock) {
    els.btnPopupUnlock.disabled = true;
    els.btnPopupUnlock.textContent = '...';
  }

  try {
    const res = await unlockVaultPassphrase(pin);
    if (res?.success) {
      if (els.popupVaultPinInput) els.popupVaultPinInput.value = '';
      setVaultErrorMessage(els);
      await loadPopupStatus(els);
    } else {
      setVaultErrorMessage(els, res?.error || 'Incorrect PIN or password.');
    }
  } finally {
    if (els.btnPopupUnlock) {
      els.btnPopupUnlock.disabled = false;
      els.btnPopupUnlock.textContent = 'Unlock';
    }
  }
}

async function handleFillPage(els: PopupElements): Promise<void> {
  els.btnFillPage.disabled = true;
  els.btnFillText.textContent = 'Triggering Fill...';

  const success = await triggerTabFill();
  if (success) {
    els.btnFillText.textContent = 'Fill In Progress...';
    setTimeout(() => window.close(), 1200);
  } else {
    els.btnFillText.textContent = 'No Active Tab';
    els.btnFillPage.disabled = false;
  }
}

function setupEventListeners(els: PopupElements): void {
  els.btnOpenOptions.addEventListener('click', openOptionsTab);
  els.btnManageProfiles?.addEventListener('click', (e) => { e.preventDefault(); openOptionsTab(); });
  els.linkSetupProfile?.addEventListener('click', (e) => { e.preventDefault(); openOptionsTab(); });
  els.btnOpenDocs?.addEventListener('click', (e) => { e.preventDefault(); openTestFormsTab(); });

  els.btnPopupUnlock?.addEventListener('click', () => { void handleUnlockSubmit(els); });
  els.popupVaultPinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void handleUnlockSubmit(els);
  });
  els.btnPopupLockVault?.addEventListener('click', async () => {
    await lockVaultNow();
    await loadPopupStatus(els);
  });

  els.profileSelect.addEventListener('change', () => {
    if (els.profileSelect.value) void switchProfile(els.profileSelect.value);
  });
  els.btnFillPage.addEventListener('click', () => { void handleFillPage(els); });
}

document.addEventListener('DOMContentLoaded', async () => {
  const els = getPopupElements();
  setupEventListeners(els);
  await loadPopupStatus(els);
});
