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
  getSessionBackend
} from './storage-base.js';

import { getVaultMeta } from './storage-vault.js';

async function cacheSessionKey(key) {
  const keyB64 = await exportKeyToBase64(key);
  const session = getSessionBackend();
  return new Promise((resolve) => {
    session.set({
      [SESSION_KEYS.SESSION_KEY]: keyB64,
      [SESSION_KEYS.UNLOCKED_AT]: Date.now()
    }, () => resolve(true));
  });
}

async function fetchPlaintextStorageData(storage) {
  return Promise.all([
    new Promise((res) => storage.get([STORAGE_KEYS.PROFILES], (r) => res(r[STORAGE_KEYS.PROFILES] || []))),
    new Promise((res) => storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (r) => res(r[STORAGE_KEYS.ACTIVE_PROFILE_ID] || null))),
    new Promise((res) => storage.get([STORAGE_KEYS.SETTINGS], (r) => res(r[STORAGE_KEYS.SETTINGS] || {}))),
    new Promise((res) => storage.get([STORAGE_KEYS.LOGS], (r) => res(r[STORAGE_KEYS.LOGS] || [])))
  ]);
}

function extractSensitiveCredentials(settings) {
  const credentials = {};
  const sanitized = { ...settings };
  for (const k of SENSITIVE_SETTINGS_KEYS) {
    if (settings[k]) credentials[k] = settings[k];
    sanitized[k] = '';
  }
  return { credentials, sanitized };
}

export async function setupVaultEncryption(passphrase, { autoLockMinutes = 0 } = {}) {
  if (!passphrase) throw new Error('Passphrase or PIN cannot be empty.');

  const storage = getStorageBackend();
  const [profiles, activeProfileId, settings, logs] = await fetchPlaintextStorageData(storage);
  const { credentials, sanitized } = extractSensitiveCredentials(settings);

  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt, 600000);
  const verifier = await createAuthVerifier(key);

  const encryptedEnvelope = await encryptObject({ profiles, activeProfileId, credentials, logs }, key);
  const vaultMeta = {
    isEncrypted: true,
    salt,
    iterations: 600000,
    authVerifier: verifier,
    autoLockMinutes,
    createdAt: Date.now()
  };

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: vaultMeta,
      [STORAGE_KEYS.VAULT_DATA]: encryptedEnvelope,
      [STORAGE_KEYS.SETTINGS]: sanitized
    }, () => {
      storage.remove([STORAGE_KEYS.PROFILES, STORAGE_KEYS.LOGS], () => resolve(true));
    });
  });

  await cacheSessionKey(key);
  return { success: true };
}

export async function disableVaultEncryption(passphrase) {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return { success: true, message: 'Vault is already unencrypted.' };

  const key = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(key, meta.authVerifier);
  if (!valid) throw new Error('Incorrect passphrase or PIN.');

  const storage = getStorageBackend();
  const envelope = await new Promise((res) => storage.get([STORAGE_KEYS.VAULT_DATA], (r) => res(r[STORAGE_KEYS.VAULT_DATA])));
  if (!envelope) throw new Error('Encrypted vault data missing.');

  const decrypted = await decryptObject(envelope, key);
  const currentSettings = await new Promise((res) => storage.get([STORAGE_KEYS.SETTINGS], (r) => res(r[STORAGE_KEYS.SETTINGS] || {})));
  const mergedSettings = { ...currentSettings, ...(decrypted.credentials || {}) };

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.PROFILES]: decrypted.profiles || [],
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]: decrypted.activeProfileId || null,
      [STORAGE_KEYS.SETTINGS]: mergedSettings,
      [STORAGE_KEYS.LOGS]: decrypted.logs || []
    }, () => {
      storage.remove([STORAGE_KEYS.VAULT_META, STORAGE_KEYS.VAULT_DATA], () => resolve(true));
    });
  });

  const session = getSessionBackend();
  await new Promise((res) => session.remove([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT], () => res(true)));
  return { success: true };
}

export async function changeVaultPassphrase(currentPassphrase, newPassphrase) {
  if (!newPassphrase) throw new Error('New passphrase or PIN cannot be empty.');
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) throw new Error('Vault is not encrypted.');

  const oldKey = await deriveKeyFromPassphrase(currentPassphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(oldKey, meta.authVerifier);
  if (!valid) throw new Error('Current passphrase or PIN is incorrect.');

  const storage = getStorageBackend();
  const envelope = await new Promise((res) => storage.get([STORAGE_KEYS.VAULT_DATA], (r) => res(r[STORAGE_KEYS.VAULT_DATA])));
  const decrypted = await decryptObject(envelope, oldKey);

  const newSalt = generateSalt();
  const newKey = await deriveKeyFromPassphrase(newPassphrase, newSalt, 600000);
  const newVerifier = await createAuthVerifier(newKey);
  const newEnvelope = await encryptObject(decrypted, newKey);

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: { ...meta, salt: newSalt, iterations: 600000, authVerifier: newVerifier, updatedAt: Date.now() },
      [STORAGE_KEYS.VAULT_DATA]: newEnvelope
    }, () => resolve(true));
  });

  await cacheSessionKey(newKey);
  return { success: true };
}
