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

import type { LogEntry, LogEntryInput, VaultData } from '../../types/storage.js';

export async function recordFillLog(logEntry: LogEntryInput): Promise<LogEntry> {
  const entry: LogEntry = {
    id: logEntry.id ?? ('log_' + Date.now().toString(36)),
    timestamp: logEntry.timestamp ?? Date.now(),
    url: logEntry.url,
    domain: logEntry.domain,
    totalFields: logEntry.totalFields,
    tier1Count: logEntry.tier1Count,
    tier2Count: logEntry.tier2Count,
    durationMs: logEntry.durationMs,
    lastPrompt: logEntry.lastPrompt,
    lastResponse: logEntry.lastResponse
  };

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data: VaultData = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      if (!Array.isArray(data.logs)) data.logs = [];
      data.logs.unshift(entry);
      data.logs = data.logs.slice(0, 30);
      await writeEncryptedVaultData(data);
    }
    return entry;
  }

  const storage = getStorageBackend();
  return new Promise<LogEntry>((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      const logs = (res?.[STORAGE_KEYS.LOGS] as LogEntry[] | undefined) || [];
      logs.unshift(entry);
      const trimmed = logs.slice(0, 30);
      storage.set({ [STORAGE_KEYS.LOGS]: trimmed as unknown as Record<string, unknown> }, () => resolve(entry));
    });
  });
}

export async function getFillLogs(): Promise<LogEntry[]> {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) return [];
    const data = await readDecryptedVaultData();
    return data ? (data.logs || []) : [];
  }

  const storage = getStorageBackend();
  return new Promise<LogEntry[]>((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      resolve((res?.[STORAGE_KEYS.LOGS] as LogEntry[] | undefined) || []);
    });
  });
}

export async function clearFillLogs(): Promise<boolean> {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data: VaultData = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      data.logs = [];
      await writeEncryptedVaultData(data);
    }
    return true;
  }

  const storage = getStorageBackend();
  return new Promise<boolean>((resolve) => {
    storage.set({ [STORAGE_KEYS.LOGS]: [] }, () => resolve(true));
  });
}
