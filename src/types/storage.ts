/**
 * Storage Schemas, Vault Metadata & Backup Envelopes for SmartForm AI
 * Pure TypeScript definitions with zero external runtime dependencies.
 */

import type { Profile } from './domain.js';
import type { AiProvider } from './engine.js';

export type OpenAiPreset = 'ollama-local' | 'lmstudio-local' | 'deepseek' | 'groq' | 'openai';
export type FloatingButtonPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type GeminiModel = 'gemini-3.1-flash-lite' | 'gemini-3.8-flash' | 'gemini-4-hydrogen' | (string & {});

export interface AppSettings {
  advancedMode: boolean;
  aiProvider: AiProvider;
  geminiApiKey: string;
  geminiModel: GeminiModel;
  geminiCustomModel: string;
  openaiPreset: OpenAiPreset | string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  claudeCustomModel: string;
  customEndpointUrl: string;
  customHeaders: string;
  customBodyTemplate: string;
  customResponsePath: string;
  customModel: string;
  temperature: number;
  timeoutSeconds: number;
  timeoutMs: number;
  customPromptInstructions: string;
  domainBlacklist: string;
  showFloatingButton: boolean;
  floatingButtonPosition: FloatingButtonPosition;
  tier1Enabled: boolean;
  tier2Enabled: boolean;
  fillOnlyEmptyFields: boolean;
  highlightDuration: number;
  smartLearningEnabled: boolean;
  debugLogging: boolean;
}

export type SensitiveSettingsKey = 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey' | 'customHeaders';
export type SensitiveCredentials = Record<SensitiveSettingsKey, string> & Record<string, string>;

export interface LogEntry {
  id: string;
  timestamp: number;
  url: string;
  domain: string;
  totalFields: number;
  tier1Count: number;
  tier2Count: number;
  durationMs?: number;
  lastPrompt?: string | null;
  lastResponse?: string | null;
}

export type LogEntryInput = Omit<LogEntry, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: number;
};

export interface EncryptedVaultEnvelope {
  iv: string;
  ciphertext: string;
}

export interface VaultMeta {
  isEncrypted: boolean;
  salt: string;
  iterations: number;
  authVerifier: EncryptedVaultEnvelope;
  autoLockMinutes: number;
  createdAt: number;
  updatedAt?: number;
}

export interface VaultData {
  profiles: Profile[];
  activeProfileId?: string | null;
  credentials: Record<string, string>;
  logs: LogEntry[];
}

export interface VaultStatus {
  isEncrypted: boolean;
  isLocked: boolean;
  autoLockMinutes: number;
}

export interface VaultOperationResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface StorageLocalSchema {
  smartform_profiles?: Profile[];
  smartform_active_profile_id?: string | null;
  smartform_settings?: Partial<AppSettings>;
  smartform_fill_logs?: LogEntry[];
  smartform_vault_meta?: VaultMeta | null;
  smartform_vault_encrypted_data?: EncryptedVaultEnvelope | null;
  [key: string]: unknown;
}

export interface StorageSessionSchema {
  smartform_session_key?: string | null;
  smartform_unlocked_at?: number | null;
  [key: string]: unknown;
}

export interface KdfParams {
  name: string;
  hash: string;
  iterations: number;
  salt: string;
}

export interface PlaintextExportPayload {
  smartform_version: string;
  exportedAt: string;
  activeProfileId: string | null;
  profiles: Profile[];
  settings: AppSettings;
}

export interface EncryptedExportPayload {
  smartformVersion: string;
  format: 'smartform-encrypted-vault';
  exportDate: string;
  kdf: KdfParams;
  iv: string;
  ciphertext: string;
  authVerifier: EncryptedVaultEnvelope;
}

export type ExportPayload = PlaintextExportPayload | EncryptedExportPayload;

export type ImportFormat =
  | 'encrypted-vault'
  | 'legacy-extension'
  | 'smartform-native'
  | 'array-of-profiles'
  | 'generic-json'
  | 'unknown';

export type ImportMode = 'replace' | 'merge';

export interface ImportOptions {
  passphrase?: string;
}

export interface ImportResult {
  success: boolean;
  formatDetected?: ImportFormat;
  modeApplied?: ImportMode;
  profilesImported?: number;
  activeProfileName?: string;
  apiKeyDetected?: boolean;
  message?: string;
  needsPassword?: boolean;
  error?: string;
}

export function isEncryptedExport(obj: unknown): obj is EncryptedExportPayload {
  if (typeof obj !== 'object' || obj === null) return false;
  const target = obj as Record<string, unknown>;
  const kdf = target.kdf as Record<string, unknown> | undefined;
  return (
    (target.format === 'smartform-encrypted-vault' || Boolean(target.kdf)) &&
    typeof kdf?.salt === 'string' &&
    typeof target.iv === 'string' &&
    typeof target.ciphertext === 'string'
  );
}

export function isEncryptedVaultEnvelope(obj: unknown): obj is EncryptedVaultEnvelope {
  if (typeof obj !== 'object' || obj === null) return false;
  const target = obj as Record<string, unknown>;
  return typeof target.iv === 'string' && typeof target.ciphertext === 'string';
}
