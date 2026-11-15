/**
 * Storage Service - Chrome Storage Local & Session wrapper with AES-256-GCM Vault Encryption
 */

import {
  deriveKeyFromPassphrase,
  encryptObject,
  decryptObject,
  createAuthVerifier,
  verifyAuthKey,
  generateSalt,
  exportKeyToBase64,
  importKeyFromBase64
} from './crypto.js';

const STORAGE_KEYS = {
  PROFILES: 'smartform_profiles',
  ACTIVE_PROFILE_ID: 'smartform_active_profile_id',
  SETTINGS: 'smartform_settings',
  LOGS: 'smartform_fill_logs',
  VAULT_META: 'smartform_vault_meta',
  VAULT_DATA: 'smartform_vault_encrypted_data'
};

const SESSION_KEYS = {
  SESSION_KEY: 'smartform_session_key',
  UNLOCKED_AT: 'smartform_unlocked_at'
};

const SENSITIVE_SETTINGS_KEYS = [
  'geminiApiKey',
  'openaiApiKey',
  'claudeApiKey',
  'customHeaders'
];

const DEFAULT_SETTINGS = {
  // Interface Mode: false = Simple Mode (default), true = Advanced Mode
  advancedMode: false,

  // Provider Selection: 'gemini' | 'openai-compatible' | 'claude' | 'custom'
  aiProvider: 'gemini',

  // 1. Google Gemini
  geminiApiKey: '',
  geminiModel: 'gemini-3.1-flash-lite',
  geminiCustomModel: '',

  // 2. OpenAI / OpenAI-Compatible (Ollama, LM Studio, DeepSeek, Groq, OpenAI)
  openaiPreset: 'openai',
  openaiBaseUrl: 'https://api.openai.com/v1/chat/completions',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',

  // 3. Anthropic Claude
  claudeApiKey: '',
  claudeModel: 'claude-3-5-haiku-20241022',
  claudeCustomModel: '',

  // 4. Custom Endpoint / Power User
  customEndpointUrl: '',
  customHeaders: '',
  customBodyTemplate: '{\n  "model": "{{MODEL}}",\n  "prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}",\n  "temperature": {{TEMPERATURE}}\n}',
  customResponsePath: 'choices[0].message.content',
  customModel: '',

  // General Model & Agent Preferences
  temperature: 0.1,
  timeoutSeconds: 90,
  timeoutMs: 90000,
  customPromptInstructions: '',
  domainBlacklist: '',
  showFloatingButton: true,
  floatingButtonPosition: 'bottom-right',
  tier1Enabled: true,
  tier2Enabled: true,
  fillOnlyEmptyFields: true,
  highlightDuration: 2500,
  smartLearningEnabled: true,
  debugLogging: false
};

// Safe storage access (works in Chrome extensions and Node/test environments)
function getStorageBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  // Memory fallback for unit tests or non-extension runtime
  if (!globalThis._mockStorage) {
    globalThis._mockStorage = {};
  }
  return {
    get: (keys, callback) => {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      for (const k of keyList) {
        if (k in globalThis._mockStorage) {
          result[k] = globalThis._mockStorage[k];
        }
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      Object.assign(globalThis._mockStorage, items);
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete globalThis._mockStorage[k];
      }
      if (callback) callback();
      return Promise.resolve();
    },
    clear: (callback) => {
      globalThis._mockStorage = {};
      if (callback) callback();
      return Promise.resolve();
    }
  };
}

// Session storage backend (in-memory for active browser session)
function getSessionBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
    return chrome.storage.session;
  }
  if (!globalThis._mockSessionStorage) {
    globalThis._mockSessionStorage = {};
  }
  return {
    get: (keys, callback) => {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      for (const k of keyList) {
        if (k in globalThis._mockSessionStorage) {
          result[k] = globalThis._mockSessionStorage[k];
        }
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      Object.assign(globalThis._mockSessionStorage, items);
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete globalThis._mockSessionStorage[k];
      }
      if (callback) callback();
      return Promise.resolve();
    },
    clear: (callback) => {
      globalThis._mockSessionStorage = {};
      if (callback) callback();
      return Promise.resolve();
    }
  };
}

/**
 * Vault State & Management
 */
export async function getVaultMeta() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_META], (res) => {
      resolve(res[STORAGE_KEYS.VAULT_META] || null);
    });
  });
}

export async function isVaultEncrypted() {
  const meta = await getVaultMeta();
  return Boolean(meta && meta.isEncrypted);
}

export async function isVaultLocked() {
  const encrypted = await isVaultEncrypted();
  if (!encrypted) return false;
  const key = await getSessionKey();
  return key === null;
}

export async function getSessionKey() {
  const session = getSessionBackend();
  return new Promise((resolve) => {
    session.get([SESSION_KEYS.SESSION_KEY], async (res) => {
      const b64 = res[SESSION_KEYS.SESSION_KEY];
      if (!b64) return resolve(null);
      try {
        const key = await importKeyFromBase64(b64);
        resolve(key);
      } catch (err) {
        resolve(null);
      }
    });
  });
}

export async function unlockVault(passphrase) {
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
    await new Promise((resolve) => {
      session.set({
        [SESSION_KEYS.SESSION_KEY]: keyB64,
        [SESSION_KEYS.UNLOCKED_AT]: Date.now()
      }, resolve);
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function lockVault() {
  const session = getSessionBackend();
  await new Promise((resolve) => {
    session.remove([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT], resolve);
  });
  return { success: true };
}

async function readDecryptedVaultData() {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return null;

  const key = await getSessionKey();
  if (!key) return null; // Locked

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_DATA], async (res) => {
      const envelope = res[STORAGE_KEYS.VAULT_DATA];
      if (!envelope) {
        return resolve({ profiles: [], credentials: {}, logs: [] });
      }
      try {
        const decrypted = await decryptObject(envelope, key);
        resolve(decrypted);
      } catch (err) {
        console.error('Decryption of vault data failed:', err);
        resolve(null);
      }
    });
  });
}

async function writeEncryptedVaultData(vaultData) {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) return;

  const key = await getSessionKey();
  if (!key) {
    throw new Error('Cannot write encrypted data: SmartForm AI vault is locked.');
  }

  const envelope = await encryptObject(vaultData, key);
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.VAULT_DATA]: envelope }, () => resolve());
  });
}

export async function setupVaultEncryption(passphrase, { autoLockMinutes = 0 } = {}) {
  if (!passphrase) {
    throw new Error('Passphrase or PIN cannot be empty.');
  }

  const storage = getStorageBackend();
  const [plaintextProfiles, activeProfileId, plaintextSettings, plaintextLogs] = await Promise.all([
    new Promise((resolve) => storage.get([STORAGE_KEYS.PROFILES], (r) => resolve(r[STORAGE_KEYS.PROFILES] || []))),
    new Promise((resolve) => storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (r) => resolve(r[STORAGE_KEYS.ACTIVE_PROFILE_ID] || null))),
    new Promise((resolve) => storage.get([STORAGE_KEYS.SETTINGS], (r) => resolve(r[STORAGE_KEYS.SETTINGS] || {}))),
    new Promise((resolve) => storage.get([STORAGE_KEYS.LOGS], (r) => resolve(r[STORAGE_KEYS.LOGS] || [])))
  ]);

  const credentials = {};
  for (const k of SENSITIVE_SETTINGS_KEYS) {
    if (plaintextSettings[k]) {
      credentials[k] = plaintextSettings[k];
    }
  }

  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt, 600000);
  const verifier = await createAuthVerifier(key);

  const vaultData = {
    profiles: plaintextProfiles,
    activeProfileId,
    credentials,
    logs: plaintextLogs
  };

  const encryptedEnvelope = await encryptObject(vaultData, key);

  const vaultMeta = {
    isEncrypted: true,
    salt,
    iterations: 600000,
    authVerifier: verifier,
    autoLockMinutes,
    createdAt: Date.now()
  };

  const sanitizedSettings = { ...plaintextSettings };
  for (const k of SENSITIVE_SETTINGS_KEYS) {
    sanitizedSettings[k] = '';
  }

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: vaultMeta,
      [STORAGE_KEYS.VAULT_DATA]: encryptedEnvelope,
      [STORAGE_KEYS.SETTINGS]: sanitizedSettings
    }, () => {
      storage.remove([STORAGE_KEYS.PROFILES, STORAGE_KEYS.LOGS], resolve);
    });
  });

  const keyB64 = await exportKeyToBase64(key);
  const session = getSessionBackend();
  await new Promise((resolve) => {
    session.set({
      [SESSION_KEYS.SESSION_KEY]: keyB64,
      [SESSION_KEYS.UNLOCKED_AT]: Date.now()
    }, resolve);
  });

  return { success: true };
}

export async function disableVaultEncryption(passphrase) {
  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) {
    return { success: true, message: 'Vault is already unencrypted.' };
  }

  const key = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(key, meta.authVerifier);
  if (!valid) {
    throw new Error('Incorrect passphrase or PIN.');
  }

  const storage = getStorageBackend();
  const envelope = await new Promise((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_DATA], (r) => resolve(r[STORAGE_KEYS.VAULT_DATA]));
  });

  if (!envelope) {
    throw new Error('Encrypted vault data missing.');
  }

  const decrypted = await decryptObject(envelope, key);
  const currentSettings = await new Promise((resolve) => {
    storage.get([STORAGE_KEYS.SETTINGS], (r) => resolve(r[STORAGE_KEYS.SETTINGS] || {}));
  });

  const mergedSettings = { ...currentSettings, ...(decrypted.credentials || {}) };

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.PROFILES]: decrypted.profiles || [],
      [STORAGE_KEYS.ACTIVE_PROFILE_ID]: decrypted.activeProfileId || null,
      [STORAGE_KEYS.SETTINGS]: mergedSettings,
      [STORAGE_KEYS.LOGS]: decrypted.logs || []
    }, () => {
      storage.remove([STORAGE_KEYS.VAULT_META, STORAGE_KEYS.VAULT_DATA], resolve);
    });
  });

  const session = getSessionBackend();
  await new Promise((resolve) => {
    session.remove([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT], resolve);
  });

  return { success: true };
}

export async function changeVaultPassphrase(currentPassphrase, newPassphrase) {
  if (!newPassphrase) {
    throw new Error('New passphrase or PIN cannot be empty.');
  }

  const meta = await getVaultMeta();
  if (!meta || !meta.isEncrypted) {
    throw new Error('Vault is not encrypted.');
  }

  const oldKey = await deriveKeyFromPassphrase(currentPassphrase, meta.salt, meta.iterations);
  const valid = await verifyAuthKey(oldKey, meta.authVerifier);
  if (!valid) {
    throw new Error('Current passphrase or PIN is incorrect.');
  }

  const storage = getStorageBackend();
  const envelope = await new Promise((resolve) => {
    storage.get([STORAGE_KEYS.VAULT_DATA], (r) => resolve(r[STORAGE_KEYS.VAULT_DATA]));
  });

  const decrypted = await decryptObject(envelope, oldKey);

  const newSalt = generateSalt();
  const newKey = await deriveKeyFromPassphrase(newPassphrase, newSalt, 600000);
  const newVerifier = await createAuthVerifier(newKey);
  const newEnvelope = await encryptObject(decrypted, newKey);

  const updatedMeta = {
    ...meta,
    salt: newSalt,
    iterations: 600000,
    authVerifier: newVerifier,
    updatedAt: Date.now()
  };

  await new Promise((resolve) => {
    storage.set({
      [STORAGE_KEYS.VAULT_META]: updatedMeta,
      [STORAGE_KEYS.VAULT_DATA]: newEnvelope
    }, resolve);
  });

  const keyB64 = await exportKeyToBase64(newKey);
  const session = getSessionBackend();
  await new Promise((resolve) => {
    session.set({
      [SESSION_KEYS.SESSION_KEY]: keyB64,
      [SESSION_KEYS.UNLOCKED_AT]: Date.now()
    }, resolve);
  });

  return { success: true };
}

export async function getSettings() {
  const storage = getStorageBackend();
  const rawSettings = await new Promise((resolve) => {
    storage.get([STORAGE_KEYS.SETTINGS], (res) => {
      resolve({ ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] || {}) });
    });
  });

  const validGeminiModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-4-hydrogen'];
  if (!validGeminiModels.includes(rawSettings.geminiModel)) {
    rawSettings.geminiModel = 'gemini-3.1-flash-lite';
  }

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      const data = await readDecryptedVaultData();
      if (data && data.credentials) {
        for (const k of SENSITIVE_SETTINGS_KEYS) {
          if (data.credentials[k] !== undefined) {
            rawSettings[k] = data.credentials[k];
          }
        }
      }
    } else {
      // Locked: mask sensitive credentials so they are not leaked
      for (const k of SENSITIVE_SETTINGS_KEYS) {
        rawSettings[k] = '';
      }
    }
  }

  return rawSettings;
}

export async function saveSettings(settings) {
  const storage = getStorageBackend();
  const current = await getSettings();
  const updated = { ...current, ...settings };

  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (!isLocked) {
      // Save credentials into encrypted vault
      const data = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
      if (!data.credentials) data.credentials = {};
      for (const k of SENSITIVE_SETTINGS_KEYS) {
        if (updated[k] !== undefined) {
          data.credentials[k] = updated[k];
        }
      }
      await writeEncryptedVaultData(data);
    }

    // Disk storage gets non-sensitive settings, with credentials cleared
    const diskSettings = { ...updated };
    for (const k of SENSITIVE_SETTINGS_KEYS) {
      diskSettings[k] = '';
    }
    return new Promise((resolve) => {
      storage.set({ [STORAGE_KEYS.SETTINGS]: diskSettings }, () => resolve(updated));
    });
  }

  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.SETTINGS]: updated }, () => resolve(updated));
  });
}

export async function getProfiles() {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) {
      return []; // Locked: return empty
    }
    const data = await readDecryptedVaultData();
    return data ? (data.profiles || []) : [];
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.PROFILES], (res) => {
      resolve(res[STORAGE_KEYS.PROFILES] || []);
    });
  });
}

export async function saveProfiles(profiles) {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) {
      throw new Error('Cannot save profiles: SmartForm AI vault is locked.');
    }
    const data = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
    data.profiles = profiles;
    await writeEncryptedVaultData(data);
    return profiles;
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.PROFILES]: profiles }, () => resolve(profiles));
  });
}

export async function getActiveProfileId() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (res) => {
      resolve(res[STORAGE_KEYS.ACTIVE_PROFILE_ID] || null);
    });
  });
}

export async function setActiveProfileId(profileId) {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId }, () => resolve(profileId));
  });
}

export async function getActiveProfile() {
  const [profiles, activeId] = await Promise.all([getProfiles(), getActiveProfileId()]);
  if (!profiles || profiles.length === 0) return null;
  const found = profiles.find((p) => p.id === activeId);
  return found || profiles[0];
}

export async function createProfile(name = 'New Profile', initialData = {}) {
  const profiles = await getProfiles();
  const newProfile = {
    id: 'prof_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim() || 'Untitled Profile',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: initialData
  };
  profiles.push(newProfile);
  await saveProfiles(profiles);
  await setActiveProfileId(newProfile.id);
  return newProfile;
}

export async function updateProfile(profileId, updates) {
  const profiles = await getProfiles();
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) return null;

  profiles[index] = {
    ...profiles[index],
    ...updates,
    updatedAt: Date.now()
  };
  await saveProfiles(profiles);
  return profiles[index];
}

export async function deleteProfile(profileId) {
  let profiles = await getProfiles();
  profiles = profiles.filter((p) => p.id !== profileId);
  await saveProfiles(profiles);

  const activeId = await getActiveProfileId();
  if (activeId === profileId) {
    const nextId = profiles.length > 0 ? profiles[0].id : null;
    await setActiveProfileId(nextId);
  }
  return profiles;
}

export async function duplicateProfile(profileId) {
  const profiles = await getProfiles();
  const target = profiles.find((p) => p.id === profileId);
  if (!target) return null;

  const clone = {
    ...JSON.parse(JSON.stringify(target)),
    id: 'prof_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    name: `${target.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  profiles.push(clone);
  await saveProfiles(profiles);
  return clone;
}

/**
 * Save or update a newly learned field into the active profile's customFields
 */
export async function saveLearnedFieldToActiveProfile(key, value) {
  if (!key || typeof key !== 'string' || !key.trim()) {
    throw new Error('Valid field key is required');
  }
  if (value === undefined || value === null) {
    throw new Error('Field value is required');
  }

  const active = await getActiveProfile();
  if (!active) {
    throw new Error('No active profile to update');
  }

  const profileData = active.data || {};
  if (!Array.isArray(profileData.customFields)) {
    profileData.customFields = [];
  }

  const trimmedKey = key.trim();
  const trimmedVal = typeof value === 'string' ? value.trim() : String(value);

  // Check if a custom field with the same key already exists (case-insensitive)
  const existingIdx = profileData.customFields.findIndex(
    (cf) => cf && typeof cf.key === 'string' && cf.key.trim().toLowerCase() === trimmedKey.toLowerCase()
  );

  if (existingIdx !== -1) {
    profileData.customFields[existingIdx] = {
      ...profileData.customFields[existingIdx],
      value: trimmedVal,
      updatedAt: Date.now()
    };
  } else {
    profileData.customFields.push({
      key: trimmedKey,
      value: trimmedVal,
      category: 'learned',
      createdAt: Date.now()
    });
  }

  active.data = profileData;
  active.updatedAt = Date.now();

  await updateProfile(active.id, active);
  return {
    success: true,
    profileId: active.id,
    profileName: active.name,
    key: trimmedKey,
    value: trimmedVal
  };
}

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

export function generateEmptyProfileTemplate(name = 'New Business Profile') {
  return {
    id: 'prof_' + Date.now().toString(36),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      businessName: '',
      tradingName: '',
      contactName: '',
      email: '',
      phone: '',
      mobile: '',
      website: '',
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      },
      services: [],
      openingHours: {
        monday: { open: '08:00', close: '17:00', closed: false },
        tuesday: { open: '08:00', close: '17:00', closed: false },
        wednesday: { open: '08:00', close: '17:00', closed: false },
        thursday: { open: '08:00', close: '17:00', closed: false },
        friday: { open: '08:00', close: '17:00', closed: false },
        saturday: { open: '09:00', close: '15:00', closed: false },
        sunday: { open: '09:00', close: '15:00', closed: true },
        alwaysOpen: false,
        notes: ''
      },
      descriptions: {
        short: '',
        full: '',
        tagline: ''
      },
      faqs: [],
      customFields: []
    }
  };
}

export { STORAGE_KEYS, SESSION_KEYS, DEFAULT_SETTINGS };
