/**
 * Vault Encryption Setup, Teardown, and Key Rotation
 */

import {
  deriveKeyFromPassphrase,
  encryptObject,
  decryptObject,
  createAuthVerifier,
  verifyAuthKey,
  generateSalt,
  exportKeyToBase64
} from '../crypto.js';

import {
  STORAGE_KEYS,
  SESSION_KEYS,
  SENSITIVE_SETTINGS_KEYS,
  getStorageBackend,
  getSessionBackend,
  type StorageBackend
} from './storage-base.js';

import { getVaultMeta } from './storage-vault.js';
import type { VaultMeta, VaultData, VaultOperationResult, EncryptedVaultEnvelope, AppSettings, LogEntry } from '../../types/storage.js';
import type { Profile } from '../../types/domain.js';

async function cacheSessionKey(key: CryptoKey): Promise<boolean> {
  const keyB64 = await exportKeyToBase64(key);
  const session = getSessionBackend();
  return new Promise<boolean>((resolve) => {
    session.set({
      [SESSION_KEYS.SESSION_KEY]: keyB64,
      [SESSION_KEYS.UNLOCKED_AT]: Date.now()
    }, () => resolve(true));
  });
}

async function fetchPlaintextStorageData(storage: StorageBackend): Promise<[Profile[], string | null, AppSettings, LogEntry[]]> {
  return Promise.all([
    new Promise<Profile[]>((res) => storage.get([STORAGE_KEYS.PROFILES], (r) => res((r?.[STORAGE_KEYS.PROFILES] as Profile[] | undefined) || []))),
    new Promise<string | null>((res) => storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (r) => res((r?.[STORAGE_KEYS.ACTIVE_PROFILE_ID] as string | undefined) ?? null))),
    new Promise<AppSettings>((res) => storage.get([STORAGE_KEYS.SETTINGS], (r) => res((r?.[STORAGE_KEYS.SETTINGS] as AppSettings | undefined) ?? ({} as AppSettings)))),
    new Promise<LogEntry[]>((res) => storage.get([STORAGE_KEYS.LOGS], (r) => res((r?.[STORAGE_KEYS.LOGS] as LogEntry[] | undefined) || [])))
  ]);
}

function extractSensitiveCredentials(settings: AppSettings): { credentials: Record<string, string>; sanitized: AppSettings } {
  const credentials: Record<string, string> = {};
  const sanitized: AppSettings = { ...settings };
  for (const k of SENSITIVE_SETTINGS_KEYS) {
    if (settings[k]) credentials[k] = settings[k];
    sanitized[k] = '';
  }
  return { credentials, sanitized };
}

export async function setupVaultEncryption(
  passphrase: string,
  { autoLockMinutes = 0 }: { autoLockMinutes?: number } = {}
): Promise<VaultOperationResult> {
  if (!passphrase) throw new Error('Passphrase or PIN cannot be empty.');

  const storage = getStorageBackend();
  const [profiles, activeProfileId, settings, logs] = await fetchPlaintextStorageData(storage);
  const { credentials, sanitized } = extractSensitiveCredentials(settings);

  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt, 600000);
  const verifier = await createAuthVerifier(key);

  const vaultData: VaultData = { profiles, activeProfileId, credentials, logs };
  const encryptedEnvelope = await encryptObject(vaultData, key);
  const vaultMeta: VaultMeta = {
    isEncrypted: true,
    salt,
    iterations: 600000,
    authVerifier: verifier,
    autoLockMinutes,
    createdAt: Date.now()
  };

  await new Promise<boolean>((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: vaultMeta as unknown as Record<string, unknown>,
      [STORAGE_KEYS.VAULT_DATA]: encryptedEnvelope as unknown as Record<string, unknown>,
      [STORAGE_KEYS.SETTINGS]: sanitized as unknown as Record<string, unknown>
    }, () => {
      storage.remove([STORAGE_KEYS.PROFILES, STORAGE_KEYS.LOGS], () => resolve(true));
    });
  });

  await cacheSessionKey(key);
  return { success: true };
}

export async function disableVaultEncryption(passphrase: string): Promise<VaultOperationResult> {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return { success: true, message: 'Vault is already unencrypted.' };

  const key = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(key, meta.authVerifier);
  if (!valid) throw new Error('Incorrect passphrase or PIN.');

  const storage = getStorageBackend();
  const envelope = await new Promise<EncryptedVaultEnvelope | undefined>((res) =>
    storage.get([STORAGE_KEYS.VAULT_DATA], (r) => res(r?.[STORAGE_KEYS.VAULT_DATA] as EncryptedVaultEnvelope | undefined))
  );
  if (!envelope) throw new Error('Encrypted vault data missing.');

  const decrypted = await decryptObject<VaultData>(envelope, key);
  const currentSettings = await new Promise<Record<string, unknown>>((res) =>
    storage.get([STORAGE_KEYS.SETTINGS], (r) => res((r?.[STORAGE_KEYS.SETTINGS] as Record<string, unknown> | undefined) || {}))
  );
  const mergedSettings = { ...currentSettings, ...(decrypted.credentials || {}) };

  await new Promise<boolean>((resolve) => {
    storage.set({
      [STORAGE_KEYS.PROFILES]: (decrypted.profiles || []) as unknown as Record<string, unknown>,
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]: (decrypted.activeProfileId || null) as unknown as Record<string, unknown>,
      [STORAGE_KEYS.SETTINGS]: mergedSettings,
      [STORAGE_KEYS.LOGS]: (decrypted.logs || []) as unknown as Record<string, unknown>
    }, () => {
      storage.remove([STORAGE_KEYS.VAULT_META, STORAGE_KEYS.VAULT_DATA], () => resolve(true));
    });
  });

  const session = getSessionBackend();
  await new Promise<boolean>((res) => session.remove([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT], () => res(true)));
  return { success: true };
}

export async function changeVaultPassphrase(currentPassphrase: string, newPassphrase: string): Promise<VaultOperationResult> {
  if (!newPassphrase) throw new Error('New passphrase or PIN cannot be empty.');
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) throw new Error('Vault is not encrypted.');

  const oldKey = await deriveKeyFromPassphrase(currentPassphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(oldKey, meta.authVerifier);
  if (!valid) throw new Error('Current passphrase or PIN is incorrect.');

  const storage = getStorageBackend();
  const envelope = await new Promise<EncryptedVaultEnvelope | undefined>((res) =>
    storage.get([STORAGE_KEYS.VAULT_DATA], (r) => res(r?.[STORAGE_KEYS.VAULT_DATA] as EncryptedVaultEnvelope | undefined))
  );
  if (!envelope) throw new Error('Encrypted vault data missing.');
  const decrypted = await decryptObject<VaultData>(envelope, oldKey);

  const newSalt = generateSalt();
  const newKey = await deriveKeyFromPassphrase(newPassphrase, newSalt, 600000);
  const newVerifier = await createAuthVerifier(newKey);
  const newEnvelope = await encryptObject(decrypted, newKey);

  await new Promise<boolean>((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: { ...meta, salt: newSalt, iterations: 600000, authVerifier: newVerifier, updatedAt: Date.now() } as unknown as Record<string, unknown>,
      [STORAGE_KEYS.VAULT_DATA]: newEnvelope as unknown as Record<string, unknown>
    }, () => resolve(true));
  });

  await cacheSessionKey(newKey);
  return { success: true };
}
