/**
 * SmartForm AI - Engine & AI Types
 * Central type definitions for DOM scanning, heuristic matching, and multi-provider AI transports.
 */

export interface ScannedFieldOption {
  readonly value: string;
  readonly text: string;
  readonly selected?: boolean;
  readonly checked?: boolean;
}

export interface RadioGroupMetadata {
  readonly name: string;
  readonly options: readonly ScannedFieldOption[];
}

export interface FieldMetadata {
  readonly uid: string;
  readonly tag: string;
  readonly type: string;
  readonly label: string;
  readonly name?: string;
  readonly id?: string;
  readonly groupContext?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly maxLength?: number | null;
  readonly options?: readonly ScannedFieldOption[];
  readonly radioOptions?: readonly ScannedFieldOption[];
  readonly valueAttr?: string;
}

export interface ScannedFormField extends FieldMetadata {
  readonly currentValue: string | boolean;
  readonly checked?: boolean;
  readonly radioGroup?: RadioGroupMetadata;
}

export type ScannedFieldInfo = ScannedFormField;

export interface ScannedElementEntry<TElement = HTMLElement> {
  readonly info: ScannedFormField;
  readonly element?: TElement;
}

export interface ScanFormOptions {
  readonly fillOnlyEmptyFields?: boolean;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type FillTier = 'tier1' | 'tier2';

export type HeuristicCategory =
  | 'email' | 'phone' | 'firstName' | 'lastName' | 'contactName' | 'businessName'
  | 'website' | 'street' | 'city' | 'state' | 'postalCode' | 'country' | string;

export interface FillInstruction {
  readonly uid: string;
  readonly value?: string | number | boolean | null;
  readonly checked?: boolean;
  readonly tier?: FillTier;
  readonly matchedCategory?: string;
  readonly confidence?: ConfidenceLevel | number;
  readonly reasoning?: string;
  readonly fieldInfo?: ScannedFormField;
  readonly element?: HTMLElement;
}

export interface MatcherResult {
  readonly matchedFills: FillInstruction[];
  readonly remainingFields: ScannedElementEntry[];
}

export interface PatternRule {
  readonly category: string;
  readonly test: (info: ScannedFormField) => boolean;
  readonly extract: (data: Record<string, unknown>) => unknown;
}

export interface ApplyFillsOptions {
  readonly highlightDuration?: number;
}

export type AiProvider = 'gemini' | 'openai' | 'claude' | 'ollama' | 'custom' | 'openai-compatible';

export interface GeminiProviderConfig {
  readonly provider: 'gemini';
  readonly apiKey: string;
  readonly model?: string;
  readonly customModel?: string;
  readonly temperature?: number;
}

export interface OpenAiProviderConfig {
  readonly provider: 'openai';
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
}

export interface OllamaProviderConfig {
  readonly provider: 'ollama';
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
}

export interface ClaudeProviderConfig {
  readonly provider: 'claude';
  readonly apiKey: string;
  readonly model?: string;
  readonly customModel?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface CustomProviderConfig {
  readonly provider: 'custom';
  readonly endpointUrl: string;
  readonly headers?: string | Record<string, string>;
  readonly bodyTemplate?: string;
  readonly responsePath?: string;
  readonly model?: string;
  readonly temperature?: number;
}

export interface OpenAiCompatibleProviderConfig {
  readonly provider: 'openai-compatible';
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly temperature?: number;
}

export type AiProviderConfig =
  | GeminiProviderConfig
  | OpenAiProviderConfig
  | OllamaProviderConfig
  | ClaudeProviderConfig
  | CustomProviderConfig
  | OpenAiCompatibleProviderConfig;

export interface AiPromptPayload {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly simplifiedFields?: readonly FieldMetadata[];
  readonly fields?: readonly (FieldMetadata | ScannedFormField)[];
}

export interface AiRequestOptions {
  readonly aiProvider?: AiProvider;
  readonly geminiApiKey?: string;
  readonly geminiModel?: string;
  readonly geminiCustomModel?: string;
  readonly openaiPreset?: string;
  readonly openaiBaseUrl?: string;
  readonly openaiApiKey?: string;
  readonly openaiModel?: string;
  readonly claudeApiKey?: string;
  readonly claudeModel?: string;
  readonly claudeCustomModel?: string;
  readonly customEndpointUrl?: string;
  readonly customHeaders?: string;
  readonly customBodyTemplate?: string;
  readonly customResponsePath?: string;
  readonly customModel?: string;
  readonly temperature?: number;
  readonly timeoutSeconds?: number;
  readonly timeoutMs?: number;
  readonly customPromptInstructions?: string;
  readonly signal?: AbortSignal;
}

export interface AiResponse {
  readonly fills: FillInstruction[];
  readonly durationMs: number;
  readonly rawPrompt: string;
  readonly rawResponse: string;
  readonly provider: AiProvider;
  readonly model: string;
}

export interface AiConnectionTestResult {
  readonly success: boolean;
  readonly provider: AiProvider;
  readonly model: string;
  readonly durationMs: number;
  readonly rawPrompt: string;
  readonly rawResponse: string;
  readonly error?: string;
}
