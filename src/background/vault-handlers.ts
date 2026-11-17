/**
 * Vault Operations Message Handlers
 * Coordinates vault status, unlock, lock, setup, disable, and password changes.
 */

import {
  isVaultEncrypted,
  isVaultLocked,
  unlockVault,
  lockVault,
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase,
  getVaultMeta
} from '../services/storage.js';

import type { VaultMeta, VaultOperationResult } from '../types/storage.js';
import type {
  MessageResponse,
  VaultStatusResponseData,
  VaultOperationResponseData
} from '../types/messages.js';

async function executeVaultOp(op: Promise<VaultOperationResult>): Promise<MessageResponse<VaultOperationResponseData>> {
  const res = await op;
  return { ...res, data: res.success ? { message: res.message } : undefined };
}

export async function handleVaultMessage(
  type: string,
  message: Record<string, unknown>
): Promise<MessageResponse<VaultStatusResponseData | VaultOperationResponseData>> {
  const payload = (message.payload as Record<string, unknown> | undefined) ?? message;
  switch (type) {
    case 'SMARTFORM_VAULT_STATUS':
    case 'GET_VAULT_STATUS': {
      const [isEncrypted, isLocked, meta] = await Promise.all([isVaultEncrypted(), isVaultLocked(), getVaultMeta()]);
      const statusData: VaultStatusResponseData = {
        isEncrypted,
        isLocked,
        autoLockMinutes: (meta as VaultMeta | null)?.autoLockMinutes ?? 0
      };
      return { success: true, data: statusData, ...statusData };
    }
    case 'SMARTFORM_VAULT_UNLOCK':
    case 'UNLOCK_VAULT':
      return executeVaultOp(unlockVault(String(payload.passphrase ?? '')));
    case 'SMARTFORM_VAULT_LOCK':
    case 'LOCK_VAULT':
      return executeVaultOp(lockVault());
    case 'SMARTFORM_VAULT_SETUP':
    case 'SETUP_VAULT':
      return executeVaultOp(setupVaultEncryption(String(payload.passphrase ?? ''), payload.options as { autoLockMinutes?: number } | undefined));
    case 'SMARTFORM_VAULT_DISABLE':
    case 'DISABLE_VAULT':
      return executeVaultOp(disableVaultEncryption(String(payload.passphrase ?? '')));
    case 'SMARTFORM_VAULT_CHANGE_PASSWORD':
    case 'CHANGE_VAULT_PASSWORD':
      return executeVaultOp(changeVaultPassphrase(String(payload.currentPassphrase ?? ''), String(payload.newPassphrase ?? '')));
    default:
      return { success: false, error: 'Unknown vault message: ' + type };
  }
}
