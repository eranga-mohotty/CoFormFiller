/**
 * Base Storage Layer and Mock Backends
 */

import type { AppSettings, SensitiveSettingsKey } from '../../types/storage.js';

export const STORAGE_KEYS = {
  PROFILES: 'smartform_profiles',
  ACTIVE_PROFILE_ID: 'smartform_active_profile_id',
  SETTINGS: 'smartform_settings',
  LOGS: 'smartform_fill_logs',
  VAULT_META: 'smartform_vault_meta',
  VAULT_DATA: 'smartform_vault_encrypted_data'
} as const;

export const SESSION_KEYS = {
  SESSION_KEY: 'smartform_session_key',
  UNLOCKED_AT: 'smartform_unlocked_at'
} as const;

export const SENSITIVE_SETTINGS_KEYS: readonly SensitiveSettingsKey[] = [
  'geminiApiKey',
  'openaiApiKey',
  'claudeApiKey',
  'customHeaders'
] as const;

export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
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

export interface StorageBackend {
  get(
    keys?: string | string[] | Record<string, unknown> | null,
    callback?: (items: Record<string, unknown>) => void
  ): Promise<Record<string, unknown>>;
  set(
    items: Record<string, unknown>,
    callback?: () => void
  ): Promise<void>;
  remove(
    keys: string | string[],
    callback?: () => void
  ): Promise<void>;
  clear(
    callback?: () => void
  ): Promise<void>;
}

function normalizeLookupKeys(keys?: string | string[] | Record<string, unknown> | null): string[] {
  if (Array.isArray(keys)) return keys;
  if (typeof keys === 'string') return [keys];
  return Object.keys(keys ?? {});
}

function createMemoryStorage(globalKey: string): StorageBackend {
  const globalStore = globalThis as unknown as Record<string, Record<string, unknown> | undefined>;
  if (!globalStore[globalKey]) {
    globalStore[globalKey] = {};
  }
  const storage = globalStore[globalKey]!;

  return {
    get: (keys, callback) => {
      const result: Record<string, unknown> = {};
      const keyList = normalizeLookupKeys(keys);
      for (const k of keyList) {
        if (k in storage) {
          result[k] = storage[k];
        }
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      Object.assign(storage, items);
      if (callback) callback();
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        delete storage[k];
      }
      if (callback) callback();
      return Promise.resolve();
    },
    clear: (callback) => {
      globalStore[globalKey] = {};
      if (callback) callback();
      return Promise.resolve();
    }
  };
}

export function getStorageBackend(): StorageBackend {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local as unknown as StorageBackend;
  }
  return createMemoryStorage('_mockStorage');
}

export function getSessionBackend(): StorageBackend {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
    return chrome.storage.session as unknown as StorageBackend;
  }
  return createMemoryStorage('_mockSessionStorage');
}
