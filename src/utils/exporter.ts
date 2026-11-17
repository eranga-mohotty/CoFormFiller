/**
 * Configuration Exporter for SmartForm AI
 * Pure TypeScript implementation with zero external runtime dependencies.
 */

import {
  getProfiles,
  getActiveProfileId,
  getSettings
} from '../services/storage.js';

import { encryptExportPayload } from '../services/crypto.js';
import type { AppSettings, ExportPayload, PlaintextExportPayload } from '../types/storage.js';

export interface ExportConfigurationOptions {
  includeApiKey?: boolean;
  encrypt?: boolean;
  passphrase?: string;
}

function sanitizeExportSettings(settings: AppSettings, includeApiKey: boolean): AppSettings {
  const sanitized: AppSettings = { ...settings };
  if (!includeApiKey) {
    sanitized.geminiApiKey = '';
    sanitized.openaiApiKey = '';
    sanitized.claudeApiKey = '';
    sanitized.customHeaders = '';
  }
  return sanitized;
}

export async function exportConfiguration(options: ExportConfigurationOptions = {}): Promise<ExportPayload> {
  const { includeApiKey = false, encrypt = false, passphrase = '' } = options;
  const [profiles, activeProfileId, settings] = await Promise.all([
    getProfiles(),
    getActiveProfileId(),
    getSettings()
  ]);

  const sanitizedSettings = sanitizeExportSettings(settings, includeApiKey);
  const payload: PlaintextExportPayload = {
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
