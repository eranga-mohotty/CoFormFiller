/**
 * Chrome Runtime Messaging & Inter-Process Communication (IPC) Type Definitions
 * Discriminated unions for all extension runtime messages and response envelopes.
 */

import type { Profile, LearnedFieldSaveResult } from './domain.js';
import type { FillInstruction, ScannedFieldInfo } from './engine.js';

/** Standard response envelope for all extension runtime messages */
export interface MessageResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/** All 14 canonical extension message actions */
export type MessageAction =
  | 'GET_STATUS'
  | 'GET_ACTIVE_PROFILE'
  | 'SWITCH_PROFILE'
  | 'RUN_AI_FILL'
  | 'TEST_KEY'
  | 'SAVE_LEARNED_FIELDS'
  | 'GET_VAULT_STATUS'
  | 'UNLOCK_VAULT'
  | 'LOCK_VAULT'
  | 'SETUP_VAULT'
  | 'DISABLE_VAULT'
  | 'CHANGE_VAULT_PASSWORD'
  | 'FILL_PAGE'
  | 'COUNT_FIELDS';

// Payload Types
export interface SwitchProfilePayload { readonly profileId: string; }
export interface RunAiFillPayload {
  readonly fields: readonly ScannedFieldInfo[];
  readonly tier1Count?: number;
  readonly url: string;
  readonly domain: string;
}
export interface TestKeyPayload { readonly settings?: Record<string, unknown>; }
export interface SaveLearnedFieldsPayload { readonly key: string; readonly value: string; }
export interface UnlockVaultPayload { readonly passphrase: string; }
export interface SetupVaultPayload {
  readonly passphrase: string;
  readonly options?: { readonly autoLockMinutes?: number };
}
export interface DisableVaultPayload { readonly passphrase: string; }
export interface ChangeVaultPasswordPayload {
  readonly currentPassphrase: string;
  readonly newPassphrase: string;
}

// Response Data Types
export interface StatusProfileSummary { readonly id: string; readonly name: string; }
export interface StatusSettingsSummary {
  readonly showFloatingButton?: boolean;
  readonly floatingButtonPosition?: string;
  readonly tier1Enabled?: boolean;
  readonly tier2Enabled?: boolean;
  readonly fillOnlyEmptyFields?: boolean;
  readonly highlightDuration?: number;
  readonly smartLearningEnabled?: boolean;
}
export interface ExtensionStatusData {
  readonly hasApiKey: boolean;
  readonly isBlacklisted: boolean;
  readonly isEncrypted: boolean;
  readonly isLocked: boolean;
  readonly provider: string;
  readonly model: string;
  readonly activeProfile: StatusProfileSummary | null;
  readonly profiles: readonly StatusProfileSummary[];
  readonly settings: StatusSettingsSummary;
}
export interface SwitchProfileResponseData { readonly activeProfile: StatusProfileSummary; }
export interface RunAiFillResponseData {
  readonly fills: readonly FillInstruction[];
  readonly durationMs: number;
}
export interface TestKeyResponseData {
  readonly durationMs: number;
  readonly result: {
    readonly success: boolean;
    readonly provider: string;
    readonly model: string;
    readonly durationMs: number;
    readonly rawPrompt?: string;
    readonly rawResponse?: string;
  };
}
export interface SaveLearnedFieldsResponseData { readonly result: LearnedFieldSaveResult; }
export interface VaultStatusResponseData {
  readonly isEncrypted: boolean;
  readonly isLocked: boolean;
  readonly autoLockMinutes: number;
}
export interface VaultOperationResponseData { readonly message?: string; }
export interface FillPageResponseData { readonly filledCount?: number; }
export interface CountFieldsResponseData { readonly count: number; }

// Discriminated Extension Message Definitions
export interface GetStatusMessage { readonly action: 'GET_STATUS'; readonly payload?: undefined; readonly type?: string; }
export interface GetActiveProfileMessage { readonly action: 'GET_ACTIVE_PROFILE'; readonly payload?: { readonly profileId?: string }; readonly type?: string; }
export interface SwitchProfileMessage { readonly action: 'SWITCH_PROFILE'; readonly payload: SwitchProfilePayload; readonly profileId?: string; readonly type?: string; }
export interface RunAiFillMessage { readonly action: 'RUN_AI_FILL'; readonly payload: RunAiFillPayload; readonly type?: string; }
export interface TestKeyMessage { readonly action: 'TEST_KEY'; readonly payload?: TestKeyPayload; readonly settings?: Record<string, unknown>; readonly type?: string; }
export interface SaveLearnedFieldsMessage { readonly action: 'SAVE_LEARNED_FIELDS'; readonly payload: SaveLearnedFieldsPayload; readonly key?: string; readonly value?: string; readonly type?: string; }
export interface GetVaultStatusMessage { readonly action: 'GET_VAULT_STATUS'; readonly payload?: undefined; readonly type?: string; }
export interface UnlockVaultMessage { readonly action: 'UNLOCK_VAULT'; readonly payload: UnlockVaultPayload; readonly passphrase?: string; readonly type?: string; }
export interface LockVaultMessage { readonly action: 'LOCK_VAULT'; readonly payload?: undefined; readonly type?: string; }
export interface SetupVaultMessage { readonly action: 'SETUP_VAULT'; readonly payload: SetupVaultPayload; readonly passphrase?: string; readonly options?: { readonly autoLockMinutes?: number }; readonly type?: string; }
export interface DisableVaultMessage { readonly action: 'DISABLE_VAULT'; readonly payload: DisableVaultPayload; readonly passphrase?: string; readonly type?: string; }
export interface ChangeVaultPasswordMessage { readonly action: 'CHANGE_VAULT_PASSWORD'; readonly payload: ChangeVaultPasswordPayload; readonly currentPassphrase?: string; readonly newPassphrase?: string; readonly type?: string; }
export interface FillPageMessage { readonly action: 'FILL_PAGE'; readonly payload?: undefined; readonly type?: string; }
export interface CountFieldsMessage { readonly action: 'COUNT_FIELDS'; readonly payload?: undefined; readonly type?: string; }

/** Discriminated union of all 14 extension runtime messages */
export type ExtensionMessage =
  | GetStatusMessage
  | GetActiveProfileMessage
  | SwitchProfileMessage
  | RunAiFillMessage
  | TestKeyMessage
  | SaveLearnedFieldsMessage
  | GetVaultStatusMessage
  | UnlockVaultMessage
  | LockVaultMessage
  | SetupVaultMessage
  | DisableVaultMessage
  | ChangeVaultPasswordMessage
  | FillPageMessage
  | CountFieldsMessage;

/** Action to response data type mapping */
export interface MessageResponseMap {
  GET_STATUS: ExtensionStatusData;
  GET_ACTIVE_PROFILE: Profile | null;
  SWITCH_PROFILE: SwitchProfileResponseData;
  RUN_AI_FILL: RunAiFillResponseData;
  TEST_KEY: TestKeyResponseData;
  SAVE_LEARNED_FIELDS: SaveLearnedFieldsResponseData;
  GET_VAULT_STATUS: VaultStatusResponseData;
  UNLOCK_VAULT: VaultOperationResponseData;
  LOCK_VAULT: VaultOperationResponseData;
  SETUP_VAULT: VaultOperationResponseData;
  DISABLE_VAULT: VaultOperationResponseData;
  CHANGE_VAULT_PASSWORD: VaultOperationResponseData;
  FILL_PAGE: FillPageResponseData;
  COUNT_FIELDS: CountFieldsResponseData;
}

/** Strongly typed response envelope for a specific action */
export type ActionResponse<A extends MessageAction> = MessageResponse<MessageResponseMap[A]>;

/** Extracts the strongly typed payload for an action */
export type MessagePayload<A extends MessageAction> =
  Extract<ExtensionMessage, { action: A }> extends { payload: infer P }
    ? P
    : Extract<ExtensionMessage, { action: A }> extends { payload?: infer P }
      ? P | undefined
      : void;

/** Type guard to test if an arbitrary object is an ExtensionMessage */
export function isExtensionMessage(val: unknown): val is ExtensionMessage {
  if (typeof val !== 'object' || val === null) return false;
  const msg = val as Record<string, unknown>;
  return typeof msg.action === 'string';
}
