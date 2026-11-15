/**
 * Background Service Worker Message Handlers
 */

import {
  getSettings,
  getActiveProfile,
  getProfiles,
  setActiveProfileId,
  recordFillLog,
  saveLearnedFieldToActiveProfile,
  isVaultEncrypted,
  isVaultLocked,
  unlockVault,
  lockVault,
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase,
  getVaultMeta
} from '../services/storage.js';

import { callAiProvider, buildPromptPayload, testAiConnection } from '../engine/ai-agent.js';

export const MSG = {
  GET_STATUS: 'SMARTFORM_GET_STATUS',
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
};

function checkIsBlacklisted(senderUrl, blacklist) {
  if (!senderUrl || !blacklist) return false;
  try {
    const host = new URL(senderUrl).hostname.toLowerCase();
    const patterns = blacklist.split(/[\n,]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    return patterns.some((p) => host === p || host.endsWith('.' + p));
  } catch (_e) {
    return false;
  }
}

function resolveModelName(provider, settings) {
  if (provider === 'openai-compatible') return settings.openaiModel;
  if (provider === 'claude') return (settings.claudeCustomModel || '').trim() || settings.claudeModel;
  return (settings.geminiCustomModel || '').trim() || settings.geminiModel;
}

export async function handleGetStatus(sender) {
  const [settings, activeProfile, profiles, isEncrypted, isLocked] = await Promise.all([
    getSettings(),
    getActiveProfile(),
    getProfiles(),
    isVaultEncrypted(),
    isVaultLocked()
  ]);

  const provider = settings.aiProvider || 'gemini';
  const isLocal = provider === 'openai-compatible' && (settings.openaiBaseUrl || '').includes('localhost');
  const hasApiKey = Boolean(
    (provider === 'gemini' && settings.geminiApiKey) ||
    (provider === 'openai-compatible' && (settings.openaiApiKey || isLocal)) ||
    (provider === 'claude' && settings.claudeApiKey) ||
    (provider === 'custom' && settings.customEndpointUrl)
  );

  const senderUrl = sender?.tab?.url || sender?.url || '';
  const isBlacklisted = checkIsBlacklisted(senderUrl, settings.domainBlacklist);

  return {
    success: true,
    hasApiKey,
    isBlacklisted,
    isEncrypted,
    isLocked,
    provider,
    model: resolveModelName(provider, settings),
    activeProfile: activeProfile ? { id: activeProfile.id, name: activeProfile.name } : null,
    profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    settings: {
      showFloatingButton: settings.showFloatingButton,
      floatingButtonPosition: settings.floatingButtonPosition,
      tier1Enabled: settings.tier1Enabled,
      tier2Enabled: settings.tier2Enabled,
      fillOnlyEmptyFields: settings.fillOnlyEmptyFields,
      highlightDuration: settings.highlightDuration,
      smartLearningEnabled: settings.smartLearningEnabled !== false
    }
  };
}

export async function handleLearnField(message) {
  const { key, value } = message;
  const result = await saveLearnedFieldToActiveProfile(key, value);
  return { success: true, result };
}

export async function handleSwitchProfile(message) {
  if (!message.profileId) throw new Error('profileId required');
  await setActiveProfileId(message.profileId);
  const active = await getActiveProfile();
  return { success: true, activeProfile: { id: active.id, name: active.name } };
}

export async function handleTestKey(message) {
  const customSettings = message.settings || {};
  const currentSettings = await getSettings();
  const merged = { ...currentSettings, ...customSettings };
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

  return { success: true, durationMs: result.durationMs, result };
}

function verifyBlacklist(settings, domain, url) {
  if (!settings.domainBlacklist || (!domain && !url)) return;
  const testHost = (domain || new URL(url).hostname || '').toLowerCase();
  const patterns = settings.domainBlacklist.split(/[\n,]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (patterns.some((p) => testHost === p || testHost.endsWith('.' + p))) {
    throw new Error(`Form filling is disabled on blacklisted domain: "${testHost}"`);
  }
}

export async function handleRunAiFill(message) {
  if (await isVaultLocked()) {
    throw new Error('SmartForm AI Vault is locked. Please enter your Master Password/PIN to unlock.');
  }

  const { fields, url, domain, tier1Count } = message;
  const [settings, activeProfile] = await Promise.all([getSettings(), getActiveProfile()]);
  verifyBlacklist(settings, domain, url);

  if (!activeProfile) throw new Error('No active profile found. Please create or import a profile in Settings.');

  const payload = buildPromptPayload(fields, activeProfile, settings);
  const aiResult = await callAiProvider(payload, settings);
  const formattedFills = (aiResult.fills || []).map((f) => ({ ...f, tier: 'tier2' }));
  const sanitizedUrl = url ? url.split('?')[0].split('#')[0] : '';

  await recordFillLog({
    url: sanitizedUrl,
    domain: domain || '',
    totalFields: fields.length,
    tier1Count: tier1Count || 0,
    tier2Count: formattedFills.length,
    durationMs: aiResult.durationMs,
    lastPrompt: settings.debugLogging ? payload.userPrompt : null,
    lastResponse: settings.debugLogging ? aiResult.rawResponse : null
  });

  return { success: true, fills: formattedFills, durationMs: aiResult.durationMs };
}

export async function handleVaultMessage(type, message) {
  switch (type) {
    case MSG.VAULT_STATUS: {
      const [isEncrypted, isLocked, meta] = await Promise.all([isVaultEncrypted(), isVaultLocked(), getVaultMeta()]);
      return { success: true, isEncrypted, isLocked, autoLockMinutes: meta ? meta.autoLockMinutes : 0 };
    }
    case MSG.VAULT_UNLOCK: return unlockVault(message.passphrase);
    case MSG.VAULT_LOCK: return lockVault();
    case MSG.VAULT_SETUP: return setupVaultEncryption(message.passphrase, message.options);
    case MSG.VAULT_DISABLE: return disableVaultEncryption(message.passphrase);
    case MSG.VAULT_CHANGE_PASSWORD: return changeVaultPassphrase(message.currentPassphrase, message.newPassphrase);
    default: return { success: false, error: 'Unknown vault message' };
  }
}
