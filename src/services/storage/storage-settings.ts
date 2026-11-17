/**
 * Settings Storage & Sensitive Key Management
 */

import {
  STORAGE_KEYS,
  SENSITIVE_SETTINGS_KEYS,
  DEFAULT_SETTINGS,
  getStorageBackend
} from './storage-base.js';

import {
  isVaultEncrypted,
  isVaultLocked,
  readDecryptedVaultData,
  writeEncryptedVaultData
} from './storage-vault.js';

import type { AppSettings, VaultData } from '../../types/storage.js';

function mergeVaultCredentials(rawSettings: AppSettings, vaultData?: VaultData | null): void {
  if (vaultData?.credentials) {
    for (const k of SENSITIVE_SETTINGS_KEYS) {
      if (vaultData.credentials[k] !== undefined) {
        rawSettings[k] = vaultData.credentials[k]!;
      }
    }
  }
}

function maskSensitiveCredentials(settings: AppSettings): AppSettings {
  const masked: AppSettings = { ...settings };
  for (const k of SENSITIVE_SETTINGS_KEYS) {
    masked[k] = '';
  }
  return masked;
}

export async function getSettings(): Promise<AppSettings> {
  const storage = getStorageBackend();
  const rawSettings = await new Promise<AppSettings>((resolve) => {
    storage.get([STORAGE_KEYS.SETTINGS], (res) => {
      const stored = (res?.[STORAGE_KEYS.SETTINGS] as Partial<AppSettings> | undefined) ?? {};
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });

  const validGeminiModels: readonly string[] = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-4-hydrogen'];
  if (!validGeminiModels.includes(rawSettings.geminiModel)) {
    rawSettings.geminiModel = 'gemini-3.1-flash-lite';
  }

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data = await readDecryptedVaultData();
      mergeVaultCredentials(rawSettings, data);
    } else {
      for (const k of SENSITIVE_SETTINGS_KEYS) {
        rawSettings[k] = '';
      }
    }
  }

  return rawSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const storage = getStorageBackend();
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...settings };

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data: VaultData = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      if (!data.credentials) data.credentials = {};
      for (const k of SENSITIVE_SETTINGS_KEYS) {
        if (updated[k] !== undefined) data.credentials[k] = updated[k];
      }
      await writeEncryptedVaultData(data);
    }

    const diskSettings = maskSensitiveCredentials(updated);
    return new Promise<AppSettings>((resolve) => {
      storage.set({ [STORAGE_KEYS.SETTINGS]: diskSettings as unknown as Record<string, unknown> }, () => resolve(updated));
    });
  }

  return new Promise<AppSettings>((resolve) => {
    storage.set({ [STORAGE_KEYS.SETTINGS]: updated as unknown as Record<string, unknown> }, () => resolve(updated));
  });
}
