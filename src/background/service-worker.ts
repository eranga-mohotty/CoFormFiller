/**
 * Background Service Worker for SmartForm AI
 * Coordinates extension lifecycle, alarms, action badge, and runtime messaging.
 */

import type { MessageResponse } from '../types/messages.js';
import {
  MSG, handleGetStatus, handleGetActiveProfile, handleLearnField,
  handleSwitchProfile, handleTestKey, handleRunAiFill, handleVaultMessage
} from './message-handlers.js';
import {
  isVaultEncrypted, isVaultLocked, lockVault, getSettings
} from '../services/storage.js';

export const ALARM_VAULT_AUTOLOCK = 'smartform_vault_autolock';
const BADGE_COLOR_LOCKED = '#E53E3E';
const BADGE_COLOR_DEFAULT = '#3B82F6';

function isVaultAction(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  const act = typeof msg.action === 'string' ? msg.action : typeof msg.type === 'string' ? msg.type : '';
  return act.toUpperCase().includes('VAULT');
}

export async function setActionBadge(
  text: string,
  color: string = BADGE_COLOR_DEFAULT,
  title: string = 'SmartForm AI',
  tabId?: number
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  try {
    const textDetails = tabId !== undefined ? { text, tabId } : { text };
    await chrome.action.setBadgeText(textDetails);
    if (text) {
      const colorDetails = tabId !== undefined ? { color, tabId } : { color };
      await chrome.action.setBadgeBackgroundColor(colorDetails);
    }
    const titleDetails = tabId !== undefined ? { title, tabId } : { title };
    await chrome.action.setTitle(titleDetails);
  } catch (err) {
    console.warn('SmartForm AI: Failed to set action badge:', err);
  }
}

export async function updateActionBadge(tabId?: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  try {
    const encrypted = await isVaultEncrypted();
    if (encrypted && (await isVaultLocked())) {
      await setActionBadge('🔒', BADGE_COLOR_LOCKED, 'SmartForm AI (Vault Locked)', tabId);
      return;
    }
    await setActionBadge('', BADGE_COLOR_DEFAULT, 'SmartForm AI', tabId);
  } catch (err) {
    console.warn('SmartForm AI: Failed to update action badge state:', err);
  }
}

export function scheduleVaultAutoLock(delayInMinutes: number): void {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  if (delayInMinutes > 0) chrome.alarms.create(ALARM_VAULT_AUTOLOCK, { delayInMinutes });
  else chrome.alarms.clear(ALARM_VAULT_AUTOLOCK);
}

export function cancelVaultAutoLock(): void {
  if (typeof chrome === 'undefined' || !chrome.alarms) return;
  chrome.alarms.clear(ALARM_VAULT_AUTOLOCK);
}

export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name === ALARM_VAULT_AUTOLOCK) {
    console.log('SmartForm AI: Vault auto-lock alarm fired.');
    try {
      await lockVault();
      await updateActionBadge();
    } catch (err) {
      console.error('SmartForm AI: Auto-lock execution failed:', err);
    }
  }
}

export async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason === 'install') {
    console.log('SmartForm AI installed successfully.');
    try {
      await getSettings();
    } catch (err) {
      console.warn('SmartForm AI: Failed to initialize default settings:', err);
    }
  } else if (details.reason === 'update') {
    console.log(`SmartForm AI updated from version ${details.previousVersion ?? 'unknown'}.`);
  }
  await updateActionBadge();
}

export async function handleStartup(): Promise<void> {
  console.log('SmartForm AI browser startup detected.');
  try {
    await updateActionBadge();
  } catch (err) {
    console.warn('SmartForm AI: Startup badge check failed:', err);
  }
}

export async function routeMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse<unknown>> {
  if (typeof message !== 'object' || message === null) {
    return { success: false, error: 'Invalid message payload' };
  }
  const msg = message as Record<string, unknown>;
  const action = String(msg.action || msg.type || '');
  try {
    if (action === MSG.GET_STATUS || action === 'GET_STATUS') return await handleGetStatus(sender);
    if (action === MSG.GET_ACTIVE_PROFILE || action === 'GET_ACTIVE_PROFILE') return await handleGetActiveProfile();
    if (action === MSG.LEARN_FIELD || action === 'SAVE_LEARNED_FIELDS') return await handleLearnField(msg);
    if (action === MSG.SWITCH_PROFILE || action === 'SWITCH_PROFILE') return await handleSwitchProfile(msg);
    if (action === MSG.TEST_KEY || action === 'TEST_KEY') return await handleTestKey(msg);
    if (action === MSG.RUN_AI_FILL || action === 'RUN_AI_FILL') return await handleRunAiFill(msg);
    if (isVaultAction(msg)) return await handleVaultMessage(action, msg);
    return { success: false, error: 'Unknown action: ' + action };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    return { success: false, error };
  }
}

export function handleRuntimeMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse<unknown>) => void
): boolean {
  routeMessage(message, sender)
    .then((response: MessageResponse<unknown>) => {
      try {
        sendResponse(response);
      } catch (_err) {
        // Channel closed if sender navigated away
      }
      if (isVaultAction(message)) {
        void updateActionBadge();
      }
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err ?? 'Unknown internal error');
      console.error('SmartForm AI Service Worker Error:', err);
      try {
        sendResponse({ success: false, error });
      } catch (_err) {
        // Channel closed
      }
    });
  return true;
}

export function initServiceWorkerListeners(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener((d) => { void handleInstalled(d); });
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { void handleStartup(); });
  if (chrome.runtime.onMessage) chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  if (chrome.alarms?.onAlarm) chrome.alarms.onAlarm.addListener((a) => { void handleAlarm(a); });
  void updateActionBadge();
}

initServiceWorkerListeners();
