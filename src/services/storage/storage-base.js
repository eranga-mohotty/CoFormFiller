/**
 * Base Storage Layer and Mock Backends
 */

export const STORAGE_KEYS = {
  PROFILES: 'smartform_profiles',
  ACTIVE_PROFILE_ID: 'smartform_active_profile_id',
  SETTINGS: 'smartform_settings',
  LOGS: 'smartform_fill_logs',
  VAULT_META: 'smartform_vault_meta',
  VAULT_DATA: 'smartform_vault_encrypted_data'
};

export const SESSION_KEYS = {
  SESSION_KEY: 'smartform_session_key',
  UNLOCKED_AT: 'smartform_unlocked_at'
};

export const SENSITIVE_SETTINGS_KEYS = [
  'geminiApiKey',
  'openaiApiKey',
  'claudeApiKey',
  'customHeaders'
];

export const DEFAULT_SETTINGS = {
  advancedMode: false,
  aiProvider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-3.1-flash-lite',
  geminiCustomModel: '',
  openaiPreset: 'openai',
  openaiBaseUrl: 'https://api.openai.com/v1/chat/completions',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  claudeApiKey: '',
  claudeModel: 'claude-3-5-haiku-20241022',
  claudeCustomModel: '',
  customEndpointUrl: '',
  customHeaders: '',
  customBodyTemplate: '{\n  "model": "{{MODEL}}",\n  "prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}",\n  "temperature": {{TEMPERATURE}}\n}',
  customResponsePath: 'choices[0].message.content',
  customModel: '',
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

function createMemoryStorage(globalKey) {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = {};
  }
  return {
    get: (keys, callback) => {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      for (const k of keyList) {
        if (k in globalThis[globalKey]) {
          result[k] = globalThis[globalKey][k];
        }
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      Object.assign(globalThis[globalKey], items);
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete globalThis[globalKey][k];
      }
      if (callback) callback();
      return Promise.resolve();
    },
    clear: (callback) => {
      globalThis[globalKey] = {};
      if (callback) callback();
      return Promise.resolve();
    }
  };
}

export function getStorageBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return createMemoryStorage('_mockStorage');
}

export function getSessionBackend() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
    return chrome.storage.session;
  }
  return createMemoryStorage('_mockSessionStorage');
}
