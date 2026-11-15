/**
 * Storage Service Facade - Re-exports all storage and vault capabilities
 */

export {
  STORAGE_KEYS
} from './storage/storage-base.js';

export {
  getVaultMeta,
  isVaultEncrypted,
  isVaultLocked,
  unlockVault,
  lockVault
} from './storage/storage-vault.js';

export {
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase
} from './storage/storage-vault-setup.js';

export {
  getSettings,
  saveSettings
} from './storage/storage-settings.js';

export {
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getActiveProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  saveLearnedFieldToActiveProfile
} from './storage/storage-profiles.js';

export {
  recordFillLog,
  getFillLogs,
  clearFillLogs
} from './storage/storage-logs.js';

export {
  generateEmptyProfileTemplate
} from './storage/storage-template.js';
