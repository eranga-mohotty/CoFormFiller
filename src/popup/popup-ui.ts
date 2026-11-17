/**
 * SmartForm AI - Action Popup UI & DOM View Module
 * Clean DOM bindings, safe DOM rendering, zero unsanitized HTML.
 */

import type { StatusProfileSummary } from '../types/messages.js';

export interface PopupElements {
  readonly profileSelect: HTMLSelectElement;
  readonly noProfilesNotice: HTMLElement;
  readonly apiStatusIndicator: HTMLElement;
  readonly apiStatusText: HTMLElement;
  readonly fieldsCountBadge: HTMLElement;
  readonly btnFillPage: HTMLButtonElement;
  readonly btnFillText: HTMLElement;
  readonly btnOpenOptions: HTMLButtonElement;
  readonly btnManageProfiles: HTMLElement | null;
  readonly btnOpenDocs: HTMLElement | null;
  readonly linkSetupProfile: HTMLElement | null;
  readonly btnPopupLockVault: HTMLButtonElement | null;
  readonly popupVaultLockedCard: HTMLElement | null;
  readonly popupVaultPinInput: HTMLInputElement | null;
  readonly btnPopupUnlock: HTMLButtonElement | null;
  readonly popupVaultError: HTMLElement | null;
}

export function getPopupElements(): PopupElements {
  return {
    profileSelect: document.getElementById('profileSelect') as HTMLSelectElement,
    noProfilesNotice: document.getElementById('noProfilesNotice') as HTMLElement,
    apiStatusIndicator: document.getElementById('apiStatusIndicator') as HTMLElement,
    apiStatusText: document.getElementById('apiStatusText') as HTMLElement,
    fieldsCountBadge: document.getElementById('fieldsCountBadge') as HTMLElement,
    btnFillPage: document.getElementById('btnFillPage') as HTMLButtonElement,
    btnFillText: document.getElementById('btnFillText') as HTMLElement,
    btnOpenOptions: document.getElementById('btnOpenOptions') as HTMLButtonElement,
    btnManageProfiles: document.getElementById('btnManageProfiles'),
    btnOpenDocs: document.getElementById('btnOpenDocs'),
    linkSetupProfile: document.getElementById('linkSetupProfile'),
    btnPopupLockVault: document.getElementById('btnPopupLockVault') as HTMLButtonElement | null,
    popupVaultLockedCard: document.getElementById('popupVaultLockedCard'),
    popupVaultPinInput: document.getElementById('popupVaultPinInput') as HTMLInputElement | null,
    btnPopupUnlock: document.getElementById('btnPopupUnlock') as HTMLButtonElement | null,
    popupVaultError: document.getElementById('popupVaultError')
  };
}

export function updateVaultLockUi(els: PopupElements, isEncrypted: boolean, isLocked: boolean): void {
  const locked = Boolean(isEncrypted && isLocked);
  els.popupVaultLockedCard?.classList.toggle('hidden', !locked);
  els.btnPopupLockVault?.classList.toggle('hidden', !isEncrypted || locked);
  els.profileSelect.disabled = locked;
  els.btnFillPage.disabled = locked;
  els.btnFillText.textContent = locked ? '🔒 Unlock to Fill' : 'Fill Form on Page';
}

export function renderProfileOptions(
  els: PopupElements,
  profiles?: readonly StatusProfileSummary[],
  activeProfileId?: string,
  isLocked?: boolean
): void {
  els.profileSelect.replaceChildren();
  if (profiles && profiles.length > 0) {
    for (const p of profiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (activeProfileId === p.id) opt.selected = true;
      els.profileSelect.appendChild(opt);
    }
    els.noProfilesNotice.classList.add('hidden');
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = isLocked ? 'Vault Locked' : 'No Profiles Available';
    els.profileSelect.appendChild(opt);
    if (!isLocked) els.noProfilesNotice.classList.remove('hidden');
  }
}

export function renderApiStatus(
  els: PopupElements,
  isLocked: boolean,
  hasApiKey: boolean,
  provider?: string,
  model?: string
): void {
  if (isLocked) {
    els.apiStatusIndicator.className = 'status-indicator missing';
    els.apiStatusText.textContent = 'Storage Locked';
  } else if (hasApiKey) {
    els.apiStatusIndicator.className = 'status-indicator ready';
    els.apiStatusText.textContent = `${provider || 'AI'} Ready (${model || 'AI Model'})`;
  } else {
    els.apiStatusIndicator.className = 'status-indicator missing';
    els.apiStatusText.textContent = 'API Key Needed';
  }
}

export function setVaultErrorMessage(els: PopupElements, message?: string): void {
  if (!els.popupVaultError) return;
  if (message) {
    els.popupVaultError.textContent = message;
    els.popupVaultError.classList.remove('hidden');
  } else {
    els.popupVaultError.textContent = '';
    els.popupVaultError.classList.add('hidden');
  }
}

export function setServiceOfflineUi(els: PopupElements): void {
  els.apiStatusIndicator.className = 'status-indicator missing';
  els.apiStatusText.textContent = 'Service Offline';
}
