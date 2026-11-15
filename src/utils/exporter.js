/**
 * Configuration Exporter for SmartForm AI
 */

import {
  getProfiles,
  getActiveProfileId,
  getSettings
} from '../services/storage.js';

import { encryptExportPayload } from '../services/crypto.js';

export async function exportConfiguration({ includeApiKey = false, encrypt = false, passphrase = '' } = {}) {
  const [profiles, activeProfileId, settings] = await Promise.all([
    getProfiles(),
    getActiveProfileId(),
    getSettings()
  ]);

  const sanitizedSettings = { ...settings };
  if (!includeApiKey) {
    sanitizedSettings.geminiApiKey = '';
    sanitizedSettings.openaiApiKey = '';
    sanitizedSettings.claudeApiKey = '';
    sanitizedSettings.customHeaders = '';
  }

  const payload = {
    smartform_version: '1.0.0',
    exportedAt: new Date().toISOString(),
    activeProfileId,
    profiles,
    settings: sanitizedSettings
  };

  if (encrypt && passphrase) {
    return encryptExportPayload(payload, passphrase);
  }

  return payload;
}
