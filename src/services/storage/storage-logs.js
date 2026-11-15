/**
 * Fill Logs Storage and Retrieval
 */

import {
  STORAGE_KEYS,
  getStorageBackend
} from './storage-base.js';

import {
  isVaultEncrypted,
  isVaultLocked,
  readDecryptedVaultData,
  writeEncryptedVaultData
} from './storage-vault.js';

export async function recordFillLog(logEntry) {
  const entry = {
    id: 'log_' + Date.now().toString(36),
    timestamp: Date.now(),
    ...logEntry
  };

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      if (!Array.isArray(data.logs)) data.logs = [];
      data.logs.unshift(entry);
      data.logs = data.logs.slice(0, 30);
      await writeEncryptedVaultData(data);
    }
    return entry;
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      const logs = res[STORAGE_KEYS.LOGS] || [];
      logs.unshift(entry);
      const trimmed = logs.slice(0, 30);
      storage.set({ [STORAGE_KEYS.LOGS]: trimmed }, () => resolve(entry));
    });
  });
}

export async function getFillLogs() {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) return [];
    const data = await readDecryptedVaultData();
    return data ? (data.logs || []) : [];
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      resolve(res[STORAGE_KEYS.LOGS] || []);
    });
  });
}

export async function clearFillLogs() {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      data.logs = [];
      await writeEncryptedVaultData(data);
    }
    return true;
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.LOGS]: [] }, () => resolve(true));
  });
}
