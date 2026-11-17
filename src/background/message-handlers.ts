/**
 * Background Service Worker Message Handlers
 * Coordinates API requests, storage, vault operations, and AI form filling.
 */

import {
  getSettings, getActiveProfile, getProfiles, setActiveProfileId,
  recordFillLog, saveLearnedFieldToActiveProfile, isVaultEncrypted, isVaultLocked
} from '../services/storage.js';

import { callAiProvider, buildPromptPayload, testAiConnection } from '../engine/ai-agent.js';
import type { AppSettings } from '../types/storage.js';
import type { Profile } from '../types/domain.js';
import type { ScannedFormField } from '../types/engine.js';
import type {
  MessageResponse, ExtensionStatusData, StatusSettingsSummary,
  SwitchProfileResponseData, RunAiFillResponseData,
  TestKeyResponseData, SaveLearnedFieldsResponseData
} from '../types/messages.js';

export { handleVaultMessage } from './vault-handlers.js';

export const MSG = {
  GET_STATUS: 'SMARTFORM_GET_STATUS',
  GET_ACTIVE_PROFILE: 'SMARTFORM_GET_ACTIVE_PROFILE',
  RUN_AI_FILL: 'SMARTFORM_RUN_AI_FILL',
  TEST_KEY: 'SMARTFORM_TEST_KEY',
  SWITCH_PROFILE: 'SMARTFORM_SWITCH_PROFILE',
  LEARN_FIELD: 'SMARTFORM_LEARN_FIELD',
  VAULT_STATUS: 'SMARTFORM_VAULT_STATUS',
  VAULT_UNLOCK: 'SMARTFORM_VAULT_UNLOCK',
  VAULT_LOCK: 'SMARTFORM_VAULT_LOCK',
  VAULT_SETUP: 'SMARTFORM_VAULT_SETUP',
  VAULT_DISABLE: 'SMARTFORM_VAULT_DISABLE',
  VAULT_CHANGE_PASSWORD: 'SMARTFORM_VAULT_CHANGE_PASSWORD'
} as const;

function checkIsBlacklisted(senderUrl?: string, blacklist?: string): boolean {
  if (!senderUrl || !blacklist) return false;
  try {
    const host = new URL(senderUrl).hostname.toLowerCase();
    const patterns = blacklist.split(/[\n,]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    return patterns.some((p) => host === p || host.endsWith('.' + p));
  } catch (_e) {
    return false;
  }
}

function resolveModelName(provider: string, settings: AppSettings): string {
  if (provider === 'openai-compatible') return settings.openaiModel || 'gpt-4o';
  if (provider === 'claude') return (settings.claudeCustomModel || '').trim() || settings.claudeModel || 'claude-3-5-sonnet';
  return (settings.geminiCustomModel || '').trim() || settings.geminiModel || 'gemini-3.1-flash-lite';
}

function resolveApiKeyPresence(provider: string, settings: AppSettings): boolean {
  const isLocal = provider === 'openai-compatible' && (settings.openaiBaseUrl || '').includes('localhost');
  return Boolean(
    (provider === 'gemini' && settings.geminiApiKey) ||
    (provider === 'openai-compatible' && (settings.openaiApiKey || isLocal)) ||
    (provider === 'claude' && settings.claudeApiKey) ||
    (provider === 'custom' && settings.customEndpointUrl)
  );
}

function buildStatusSettings(settings: AppSettings): StatusSettingsSummary {
  return {
    showFloatingButton: settings.showFloatingButton,
    floatingButtonPosition: settings.floatingButtonPosition,
    tier1Enabled: settings.tier1Enabled,
    tier2Enabled: settings.tier2Enabled,
    fillOnlyEmptyFields: settings.fillOnlyEmptyFields,
    highlightDuration: settings.highlightDuration,
    smartLearningEnabled: settings.smartLearningEnabled !== false
  };
}

export async function handleGetStatus(sender?: chrome.runtime.MessageSender): Promise<MessageResponse<ExtensionStatusData>> {
  const [settings, activeProfile, profiles, isEncrypted, isLocked] = await Promise.all([
    getSettings(), getActiveProfile(), getProfiles(), isVaultEncrypted(), isVaultLocked()
  ]);

  const provider = settings.aiProvider || 'gemini';
  const senderUrl = sender?.tab?.url || sender?.url || '';
  const statusData: ExtensionStatusData = {
    hasApiKey: resolveApiKeyPresence(provider, settings),
    isBlacklisted: checkIsBlacklisted(senderUrl, settings.domainBlacklist),
    isEncrypted,
    isLocked,
    provider,
    model: resolveModelName(provider, settings),
    activeProfile: activeProfile ? { id: activeProfile.id, name: activeProfile.name } : null,
    profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    settings: buildStatusSettings(settings)
  };

  return { success: true, data: statusData, ...statusData };
}

export async function handleGetActiveProfile(): Promise<MessageResponse<Profile | null>> {
  const profile = await getActiveProfile();
  return { success: true, data: profile, ...(profile ? { profile } : { profile: null }) };
}

export async function handleLearnField(message: Record<string, unknown>): Promise<MessageResponse<SaveLearnedFieldsResponseData>> {
  const payload = (message.payload as Record<string, unknown> | undefined) ?? message;
  const key = String(payload.key ?? '');
  const value = String(payload.value ?? '');
  const result = await saveLearnedFieldToActiveProfile(key, value);
  const responseData: SaveLearnedFieldsResponseData = { result };
  return { success: true, data: responseData, ...responseData };
}

export async function handleSwitchProfile(message: Record<string, unknown>): Promise<MessageResponse<SwitchProfileResponseData>> {
  const payload = (message.payload as Record<string, unknown> | undefined) ?? message;
  const profileId = String(payload.profileId ?? '');
  if (!profileId) throw new Error('profileId required');
  await setActiveProfileId(profileId);
  const active = await getActiveProfile();
  if (!active || active.id !== profileId) throw new Error(`Profile not found for ID: ${profileId}`);
  const activeProfile = { id: active.id, name: active.name };
  const responseData: SwitchProfileResponseData = { activeProfile };
  return { success: true, data: responseData, ...responseData };
}

export async function handleTestKey(message: Record<string, unknown>): Promise<MessageResponse<TestKeyResponseData>> {
  const payload = (message.payload as Record<string, unknown> | undefined) ?? message;
  const customSettings = (payload.settings as Record<string, unknown> | undefined) || {};
  const currentSettings = await getSettings();
  const merged = { ...currentSettings, ...customSettings } as AppSettings;
  const result = await testAiConnection(merged);

  await recordFillLog({
    url: 'Settings > Test Connection',
    domain: `Test Ping: ${result.provider} (${result.model})`,
    totalFields: 0,
    tier1Count: 0,
    tier2Count: 0,
    durationMs: result.durationMs,
    lastPrompt: result.rawPrompt,
    lastResponse: result.rawResponse
  });

  const responseData: TestKeyResponseData = { durationMs: result.durationMs, result };
  return { success: true, data: responseData, ...responseData };
}

function verifyBlacklist(settings: AppSettings, domain?: string, url?: string): void {
  if (!settings.domainBlacklist || (!domain && !url)) return;
  let testHost = (domain || '').toLowerCase();
  if (!testHost && url) {
    try {
      testHost = new URL(url).hostname.toLowerCase();
    } catch (_e) {
      testHost = '';
    }
  }
  const patterns = settings.domainBlacklist.split(/[\n,]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (patterns.some((p) => testHost === p || testHost.endsWith('.' + p))) {
    throw new Error(`Form filling is disabled on blacklisted domain: "${testHost}"`);
  }
}

export async function handleRunAiFill(message: Record<string, unknown>): Promise<MessageResponse<RunAiFillResponseData>> {
  if (await isVaultLocked()) {
    throw new Error('SmartForm AI Vault is locked. Please enter your Master Password/PIN to unlock.');
  }

  const payload = (message.payload as Record<string, unknown> | undefined) ?? message;
  const rawFields = Array.isArray(payload.fields) ? (payload.fields as readonly ScannedFormField[]) : [];
  const url = String(payload.url ?? '');
  const domain = String(payload.domain ?? '');
  const tier1Count = Number(payload.tier1Count ?? 0);

  const [settings, activeProfile] = await Promise.all([getSettings(), getActiveProfile()]);
  verifyBlacklist(settings, domain, url);
  if (!activeProfile) throw new Error('No active profile found. Please create or import a profile in Settings.');

  const promptPayload = buildPromptPayload(rawFields, activeProfile, settings);
  const aiResult = await callAiProvider(promptPayload, settings);
  const formattedFills = (aiResult.fills || []).map((f) => ({ ...f, tier: 'tier2' as const }));
  const sanitizedUrl = url ? url.split('?')[0].split('#')[0] : '';

  await recordFillLog({
    url: sanitizedUrl,
    domain: domain || '',
    totalFields: rawFields.length,
    tier1Count,
    tier2Count: formattedFills.length,
    durationMs: aiResult.durationMs,
    lastPrompt: settings.debugLogging ? promptPayload.userPrompt : null,
    lastResponse: settings.debugLogging ? aiResult.rawResponse : null
  });

  const responseData: RunAiFillResponseData = { fills: formattedFills, durationMs: aiResult.durationMs };
  return { success: true, data: responseData, ...responseData };
}
