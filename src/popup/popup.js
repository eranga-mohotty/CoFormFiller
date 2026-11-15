/**
 * Popup Script for SmartForm AI
 */

function getElements() {
  return {
    profileSelect: /** @type {HTMLSelectElement} */ (document.getElementById('profileSelect')),
    noProfilesNotice: /** @type {HTMLElement} */ (document.getElementById('noProfilesNotice')),
    apiStatusIndicator: /** @type {HTMLElement} */ (document.getElementById('apiStatusIndicator')),
    apiStatusText: /** @type {HTMLElement} */ (document.getElementById('apiStatusText')),
    fieldsCountBadge: /** @type {HTMLElement} */ (document.getElementById('fieldsCountBadge')),
    btnFillPage: /** @type {HTMLButtonElement} */ (document.getElementById('btnFillPage')),
    btnFillText: /** @type {HTMLElement} */ (document.getElementById('btnFillText')),
    btnOpenOptions: /** @type {HTMLButtonElement} */ (document.getElementById('btnOpenOptions')),
    btnManageProfiles: /** @type {HTMLElement} */ (document.getElementById('btnManageProfiles')),
    btnOpenDocs: /** @type {HTMLElement} */ (document.getElementById('btnOpenDocs')),
    linkSetupProfile: /** @type {HTMLElement} */ (document.getElementById('linkSetupProfile')),
    btnPopupLockVault: /** @type {HTMLButtonElement} */ (document.getElementById('btnPopupLockVault')),
    popupVaultLockedCard: /** @type {HTMLElement} */ (document.getElementById('popupVaultLockedCard')),
    popupVaultPinInput: /** @type {HTMLInputElement} */ (document.getElementById('popupVaultPinInput')),
    btnPopupUnlock: /** @type {HTMLButtonElement} */ (document.getElementById('btnPopupUnlock')),
    popupVaultError: /** @type {HTMLElement} */ (document.getElementById('popupVaultError'))
  };
}

function openOptionsTab() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL('src/options/options.html'));
}

function updateVaultLockUi(els, status) {
  const isLocked = Boolean(status.isEncrypted && status.isLocked);
  els.popupVaultLockedCard?.classList.toggle('hidden', !isLocked);
  els.btnPopupLockVault?.classList.toggle('hidden', !status.isEncrypted || isLocked);
  els.profileSelect.disabled = isLocked;
  els.btnFillPage.disabled = isLocked;
  els.btnFillText.textContent = isLocked ? '🔒 Unlock to Fill' : 'Fill Form on Page';
}

function renderProfileOptions(els, status) {
  els.profileSelect.replaceChildren();
  if (status.profiles && status.profiles.length > 0) {
    status.profiles.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (status.activeProfile && status.activeProfile.id === p.id) opt.selected = true;
      els.profileSelect.appendChild(opt);
    });
    els.noProfilesNotice.classList.add('hidden');
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = status.isLocked ? 'Vault Locked' : 'No Profiles Available';
    els.profileSelect.appendChild(opt);
    if (!status.isLocked) els.noProfilesNotice.classList.remove('hidden');
  }
}

function renderApiStatus(els, status) {
  if (status.isLocked) {
    els.apiStatusIndicator.className = 'status-indicator missing';
    els.apiStatusText.textContent = 'Storage Locked';
  } else if (status.hasApiKey) {
    els.apiStatusIndicator.className = 'status-indicator ready';
    els.apiStatusText.textContent = `${status.provider || 'AI'} Ready (${status.model || 'AI Model'})`;
  } else {
    els.apiStatusIndicator.className = 'status-indicator missing';
    els.apiStatusText.textContent = 'API Key Needed';
  }
}

async function inspectActiveTabFields(badge) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, { type: 'SMARTFORM_COUNT_FIELDS' }, (res) => {
      badge.textContent = (!chrome.runtime.lastError && res?.count !== undefined) ? res.count : '?';
    });
  }
}

async function loadPopupStatus(els) {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });
    if (!status?.success) throw new Error('Could not get status');
    updateVaultLockUi(els, status);
    renderProfileOptions(els, status);
    renderApiStatus(els, status);
    await inspectActiveTabFields(els.fieldsCountBadge);
  } catch (_err) {
    els.apiStatusIndicator.className = 'status-indicator missing';
    els.apiStatusText.textContent = 'Service Offline';
  }
}

async function handleUnlockSubmit(els) {
  const pin = els.popupVaultPinInput ? els.popupVaultPinInput.value : '';
  if (!pin) {
    if (els.popupVaultError) {
      els.popupVaultError.textContent = 'Please enter PIN or password.';
      els.popupVaultError.classList.remove('hidden');
    }
    return;
  }

  els.btnPopupUnlock.disabled = true;
  els.btnPopupUnlock.textContent = '...';
  const res = await chrome.runtime.sendMessage({ type: 'SMARTFORM_VAULT_UNLOCK', passphrase: pin });
  els.btnPopupUnlock.disabled = false;
  els.btnPopupUnlock.textContent = 'Unlock';

  if (res?.success) {
    if (els.popupVaultPinInput) els.popupVaultPinInput.value = '';
    els.popupVaultError?.classList.add('hidden');
    await loadPopupStatus(els);
  } else if (els.popupVaultError) {
    els.popupVaultError.textContent = res?.error || 'Incorrect PIN or password.';
    els.popupVaultError.classList.remove('hidden');
  }
}

async function handleFillPage(els) {
  els.btnFillPage.disabled = true;
  els.btnFillText.textContent = 'Triggering Fill...';

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id) {
    chrome.tabs.sendMessage(activeTab.id, { type: 'SMARTFORM_TRIGGER_FILL' }, () => {
      els.btnFillText.textContent = 'Fill In Progress...';
      setTimeout(() => window.close(), 1200);
    });
  } else {
    els.btnFillText.textContent = 'No Active Tab';
    els.btnFillPage.disabled = false;
  }
}

function setupEventListeners(els) {
  els.btnOpenOptions.addEventListener('click', openOptionsTab);
  els.btnManageProfiles?.addEventListener('click', (e) => { e.preventDefault(); openOptionsTab(); });
  els.linkSetupProfile?.addEventListener('click', (e) => { e.preventDefault(); openOptionsTab(); });
  els.btnOpenDocs?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('test-forms/business-directory-form.html') });
  });

  els.btnPopupUnlock?.addEventListener('click', () => handleUnlockSubmit(els));
  els.popupVaultPinInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUnlockSubmit(els); });
  els.btnPopupLockVault?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'SMARTFORM_VAULT_LOCK' });
    await loadPopupStatus(els);
  });

  els.profileSelect.addEventListener('change', () => {
    if (els.profileSelect.value) {
      chrome.runtime.sendMessage({ type: 'SMARTFORM_SWITCH_PROFILE', profileId: els.profileSelect.value });
    }
  });
  els.btnFillPage.addEventListener('click', () => handleFillPage(els));
}

document.addEventListener('DOMContentLoaded', async () => {
  const els = getElements();
  setupEventListeners(els);
  await loadPopupStatus(els);
});
