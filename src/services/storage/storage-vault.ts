/**
 * Vault Session, Locking, and Cryptographic Data Access
 */

import {
  deriveKeyFromPassphrase,
  verifyAuthKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptObject,
  decryptObject
} from '../crypto.js';

import {
  STORAGE_KEYS,
  SESSION_KEYS,
  getStorageBackend,
  getSessionBackend
} from './storage-base.js';

import type { VaultMeta, VaultData, VaultOperationResult, EncryptedVaultEnvelope } from '../../types/storage.js';

export async function getVaultMeta(): Promise<VaultMeta | null> {
  const storage = getStorageBackend();
  return new Promise<VaultMeta | null>((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_META], (res) => {
      resolve((res?.[STORAGE_KEYS.VAULT_META] as VaultMeta | undefined) ?? null);
    });
  });
}

export async function isVaultEncrypted(): Promise<boolean> {
  const meta = await getVaultMeta();
  return Boolean(meta && meta.isEncrypted);
}

function getSessionKey(): Promise<CryptoKey | null> {
  const session = getSessionBackend();
  return new Promise<CryptoKey | null>((resolve) => {
    session.get([SESSION_KEYS.SESSION_KEY], async (res) => {
      const b64 = res?.[SESSION_KEYS.SESSION_KEY] as string | undefined;
      if (!b64) return resolve(null);
      try {
        const key = await importKeyFromBase64(b64);
        resolve(key);
      } catch (_err) {
        resolve(null);
      }
    });
  });
}

export async function isVaultLocked(): Promise<boolean> {
  const encrypted = await isVaultEncrypted();
  if (!encrypted) return false;
  const key = await getSessionKey();
  return key === null;
}

export async function unlockVault(passphrase: string): Promise<VaultOperationResult> {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) {
    return { success: true, message: 'Vault is not encrypted.' };
  }

  try {
    const key = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations);
    const valid = await verifyAuthKey(key, meta.authVerifier);
    if (!valid) {
      return { success: false, error: 'Incorrect Master PIN or Password.' };
    }

    const keyB64 = await exportKeyToBase64(key);
    const session = getSessionBackend();
    await new Promise<boolean>((resolve) => {
      session.set({
        [SESSION_KEYS.SESSION_KEY]: keyB64,
        [SESSION_KEYS.UNLOCKED_AT]: Date.now()
      }, () => resolve(true));
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function lockVault(): Promise<VaultOperationResult> {
  const session = getSessionBackend();
  await new Promise<boolean>((resolve) => {
    session.remove([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT], () => resolve(true));
  });
  return { success: true };
}

export async function readDecryptedVaultData(): Promise<VaultData | null> {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return null;

  const key = await getSessionKey();
  if (!key) return null;

  const storage = getStorageBackend();
  return new Promise<VaultData | null>((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_DATA], async (res) => {
      const envelope = res?.[STORAGE_KEYS.VAULT_DATA] as EncryptedVaultEnvelope | undefined;
      if (!envelope) {
        return resolve({ profiles: [], credentials: {}, logs: [] });
      }
      try {
        const decrypted = await decryptObject<VaultData>(envelope, key);
        resolve(decrypted);
      } catch (err) {
        console.error('Decryption of vault data failed:', err);
        resolve(null);
      }
    });
  });
}

export async function writeEncryptedVaultData(vaultData: VaultData): Promise<boolean> {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return true;

  const key = await getSessionKey();
  if (!key) {
    throw new Error('Cannot write encrypted data: SmartForm AI vault is locked.');
  }

  const envelope = await encryptObject(vaultData, key);
  const storage = getStorageBackend();
  return new Promise<boolean>((resolve) => {
    storage.set({ [STORAGE_KEYS.VAULT_DATA]: envelope as unknown as Record<string, unknown> }, () => resolve(true));
  });
}
