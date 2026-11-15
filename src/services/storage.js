/**
 * Storage Service - Chrome Storage Local wrapper with state management
 */

const STORAGE_KEYS = {
  PROFILES: 'smartform_profiles',
  ACTIVE_PROFILE_ID: 'smartform_active_profile_id',
  SETTINGS: 'smartform_settings',
  LOGS: 'smartform_fill_logs'
};

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

export async function getSettings() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.SETTINGS], (res) => {
      const settings = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] || {}) };
      const validGeminiModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-4-hydrogen'];
      if (!validGeminiModels.includes(settings.geminiModel)) {
        settings.geminiModel = 'gemini-3.1-flash-lite';
      }
      resolve(settings);
    });
  });
}

export async function saveSettings(settings) {
  const storage = getStorageBackend();
  const current = await getSettings();
  const updated = { ...current, ...settings };
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.SETTINGS]: updated }, () => resolve(updated));
  });
}

export async function getProfiles() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.PROFILES], (res) => {
      resolve(res[STORAGE_KEYS.PROFILES] || []);
    });
  });
}

export async function saveProfiles(profiles) {
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
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      const logs = res[STORAGE_KEYS.LOGS] || [];
      const entry = {
        id: 'log_' + Date.now().toString(36),
        timestamp: Date.now(),
        ...logEntry
      };
      logs.unshift(entry);
      // Keep recent 30 logs
      const trimmed = logs.slice(0, 30);
      storage.set({ [STORAGE_KEYS.LOGS]: trimmed }, () => resolve(entry));
    });
  });
}

export async function getFillLogs() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.LOGS], (res) => {
      resolve(res[STORAGE_KEYS.LOGS] || []);
    });
  });
}

export async function clearFillLogs() {
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

export { STORAGE_KEYS, DEFAULT_SETTINGS };
