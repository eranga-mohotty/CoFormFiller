/**
 * Background Service Worker for SmartForm AI
 * Coordinates Gemini API requests, settings, and messaging.
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

// Message types
const MSG = {
  GET_STATUS: 'SMARTFORM_GET_STATUS',
  RUN_AI_FILL: 'SMARTFORM_RUN_AI_FILL',
  TEST_KEY: 'SMARTFORM_TEST_KEY',
  SWITCH_PROFILE: 'SMARTFORM_SWITCH_PROFILE',
  LEARN_FIELD: 'SMARTFORM_LEARN_FIELD',
  // Vault & Security
  VAULT_STATUS: 'SMARTFORM_VAULT_STATUS',
  VAULT_UNLOCK: 'SMARTFORM_VAULT_UNLOCK',
  VAULT_LOCK: 'SMARTFORM_VAULT_LOCK',
  VAULT_SETUP: 'SMARTFORM_VAULT_SETUP',
  VAULT_DISABLE: 'SMARTFORM_VAULT_DISABLE',
  VAULT_CHANGE_PASSWORD: 'SMARTFORM_VAULT_CHANGE_PASSWORD'
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('SmartForm AI installed successfully.');
  }
});

// Central message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    try {
      switch (message.type) {
        case MSG.GET_STATUS: {
          const [settings, activeProfile, profiles, isEncrypted, isLocked] = await Promise.all([
            getSettings(),
            getActiveProfile(),
            getProfiles(),
            isVaultEncrypted(),
            isVaultLocked()
          ]);

          const provider = settings.aiProvider || 'gemini';
          const isLocalProvider = provider === 'openai-compatible' && (settings.openaiBaseUrl || '').includes('localhost');
          const hasApiKey = Boolean(
            (provider === 'gemini' && settings.geminiApiKey) ||
            (provider === 'openai-compatible' && (settings.openaiApiKey || isLocalProvider)) ||
            (provider === 'claude' && settings.claudeApiKey) ||
            (provider === 'custom' && settings.customEndpointUrl)
          );

          const senderUrl = sender?.tab?.url || sender?.url || '';
          let isBlacklisted = false;
          if (senderUrl && settings.domainBlacklist) {
            try {
              const host = new URL(senderUrl).hostname.toLowerCase();
              const patterns = settings.domainBlacklist
                .split(/[\n,]/)
                .map((p) => p.trim().toLowerCase())
                .filter(Boolean);
              isBlacklisted = patterns.some((p) => host === p || host.endsWith('.' + p));
            } catch (e) {}
          }

          return {
            success: true,
            hasApiKey,
            isBlacklisted,
            isEncrypted,
            isLocked,
            provider,
            model: provider === 'openai-compatible'
              ? settings.openaiModel
              : (provider === 'claude'
                  ? ((settings.claudeCustomModel || '').trim() || settings.claudeModel)
                  : ((settings.geminiCustomModel || '').trim() || settings.geminiModel)),
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

        case MSG.LEARN_FIELD: {
          const { key, value } = message;
          const result = await saveLearnedFieldToActiveProfile(key, value);
          return { success: true, result };
        }

        case MSG.SWITCH_PROFILE: {
          if (!message.profileId) throw new Error('profileId required');
          await setActiveProfileId(message.profileId);
          const active = await getActiveProfile();
          return { success: true, activeProfile: { id: active.id, name: active.name } };
        }

        case MSG.TEST_KEY: {
          const customSettings = message.settings || {};
          const currentSettings = await getSettings();
          const merged = { ...currentSettings, ...customSettings };
          const result = await testAiConnection(merged);

          // Record test in logs so it is visible in the Logs & AI Inspector tab
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

        case MSG.RUN_AI_FILL: {
          const locked = await isVaultLocked();
          if (locked) {
            throw new Error('SmartForm AI Vault is locked. Please enter your Master Password/PIN to unlock.');
          }

          const { fields, url, domain } = message;
          const [settings, activeProfile] = await Promise.all([
            getSettings(),
            getActiveProfile()
          ]);

          if (settings.domainBlacklist && (domain || url)) {
            try {
              const testHost = (domain || new URL(url).hostname || '').toLowerCase();
              const patterns = settings.domainBlacklist
                .split(/[\n,]/)
                .map((p) => p.trim().toLowerCase())
                .filter(Boolean);
              if (patterns.some((p) => testHost === p || testHost.endsWith('.' + p))) {
                throw new Error(`Form filling is disabled on blacklisted domain: "${testHost}"`);
              }
            } catch (e) {
              if (e.message.includes('disabled on blacklisted domain')) throw e;
            }
          }

          if (!activeProfile) {
            throw new Error('No active profile found. Please create or import a profile in Settings.');
          }

          // Build prompt
          const payload = buildPromptPayload(fields, activeProfile, settings);

          // Call selected AI Provider
          const aiResult = await callAiProvider(payload, settings);

          // Tag fills with tier: 'tier2'
          const formattedFills = (aiResult.fills || []).map((f) => ({
            ...f,
            tier: 'tier2'
          }));

          // Sanitize URL to strip sensitive query parameters and hash fragments
          const sanitizedUrl = url ? url.split('?')[0].split('#')[0] : '';

          // Record log (only persist full prompt and response if debug logging is explicitly enabled)
          await recordFillLog({
            url: sanitizedUrl,
            domain: domain || '',
            totalFields: fields.length,
            tier1Count: message.tier1Count || 0,
            tier2Count: formattedFills.length,
            durationMs: aiResult.durationMs,
            lastPrompt: settings.debugLogging ? payload.userPrompt : null,
            lastResponse: settings.debugLogging ? aiResult.rawResponse : null
          });

          return {
            success: true,
            fills: formattedFills,
            durationMs: aiResult.durationMs
          };
        }

        case MSG.VAULT_STATUS: {
          const [isEncrypted, isLocked, meta] = await Promise.all([
            isVaultEncrypted(),
            isVaultLocked(),
            getVaultMeta()
          ]);
          return {
            success: true,
            isEncrypted,
            isLocked,
            autoLockMinutes: meta ? meta.autoLockMinutes : 0
          };
        }

        case MSG.VAULT_UNLOCK: {
          const res = await unlockVault(message.passphrase);
          return res;
        }

        case MSG.VAULT_LOCK: {
          const res = await lockVault();
          return res;
        }

        case MSG.VAULT_SETUP: {
          const res = await setupVaultEncryption(message.passphrase, message.options);
          return res;
        }

        case MSG.VAULT_DISABLE: {
          const res = await disableVaultEncryption(message.passphrase);
          return res;
        }

        case MSG.VAULT_CHANGE_PASSWORD: {
          const res = await changeVaultPassphrase(message.currentPassphrase, message.newPassphrase);
          return res;
        }

        default:
          return { success: false, error: 'Unknown message type: ' + message.type };
      }
    } catch (err) {
      console.error('SmartForm AI Service Worker Error:', err);
      return { success: false, error: err.message };
    }
  };

  handleAsync().then(sendResponse);
  return true; // Keep message channel open for async response
});
