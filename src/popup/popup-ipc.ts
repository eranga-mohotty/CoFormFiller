/**
 * SmartForm AI - Action Popup IPC Client Module
 * Type-safe communication with Service Worker and Content Scripts.
 */

import type {
  ExtensionStatusData,
  MessageResponse,
  VaultOperationResponseData,
  SwitchProfileResponseData
} from '../types/messages.js';

export async function getExtensionStatus(): Promise<ExtensionStatusData> {
  const res = (await chrome.runtime.sendMessage({
    action: 'GET_STATUS',
    type: 'SMARTFORM_GET_STATUS'
  })) as (MessageResponse<ExtensionStatusData> & ExtensionStatusData) | undefined;

  if (!res?.success) throw new Error(res?.error || 'Could not get status');
  return res.data ?? res;
}

export async function unlockVaultPassphrase(passphrase: string): Promise<MessageResponse<VaultOperationResponseData>> {
  return (await chrome.runtime.sendMessage({
    action: 'UNLOCK_VAULT',
    type: 'SMARTFORM_VAULT_UNLOCK',
    payload: { passphrase },
    passphrase
  })) as MessageResponse<VaultOperationResponseData>;
}

export async function lockVaultNow(): Promise<MessageResponse<VaultOperationResponseData>> {
  return (await chrome.runtime.sendMessage({
    action: 'LOCK_VAULT',
    type: 'SMARTFORM_VAULT_LOCK'
  })) as MessageResponse<VaultOperationResponseData>;
}

export async function switchProfile(profileId: string): Promise<MessageResponse<SwitchProfileResponseData>> {
  return (await chrome.runtime.sendMessage({
    action: 'SWITCH_PROFILE',
    type: 'SMARTFORM_SWITCH_PROFILE',
    payload: { profileId },
    profileId
  })) as MessageResponse<SwitchProfileResponseData>;
}

export async function getActiveTabFieldCount(): Promise<number | null> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = activeTab?.id;
  if (tabId === undefined) return null;

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: 'COUNT_FIELDS', type: 'SMARTFORM_COUNT_FIELDS' },
      (res: { count?: number } | undefined) => {
        if (chrome.runtime.lastError || res?.count === undefined) {
          resolve(null);
        } else {
          resolve(res.count);
        }
      }
    );
  });
}

export async function triggerTabFill(): Promise<boolean> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = activeTab?.id;
  if (tabId === undefined) return false;

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: 'FILL_PAGE', type: 'SMARTFORM_TRIGGER_FILL' },
      () => {
        resolve(!chrome.runtime.lastError);
      }
    );
  });
}

export function openOptionsTab(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('src/options/options.html'));
  }
}

export function openTestFormsTab(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('test-forms/business-directory-form.html') });
}
