/**
 * Multi-Provider AI Form Filling Agent Coordinator
 * Pure TypeScript, Web Platform APIs, zero runtime npm dependencies.
 */

import { buildPromptPayload } from './ai/prompt-builder.js';
import {
  extractInteractionText,
  extractClaudeText,
  extractOpenAiOrOllamaText,
  resolveJsonPath,
  parseJsonFills,
  validateAiFills
} from './ai/response-parser.js';
import { callGeminiApiTransport } from './ai/gemini-transport.js';
import { callOpenAiCompatibleApi, getExtensionOrigin } from './ai/openai-transport.js';
import { callClaudeApi } from './ai/claude-transport.js';
import { callCustomEndpointApi } from './ai/custom-transport.js';
import type {
  AiPromptPayload,
  AiRequestOptions,
  AiResponse,
  AiConnectionTestResult,
  AiProvider,
  FieldMetadata,
  ScannedFormField
} from '../types/engine.js';
import type { AppSettings } from '../types/storage.js';

export {
  buildPromptPayload,
  extractInteractionText,
  extractClaudeText,
  extractOpenAiOrOllamaText,
  resolveJsonPath,
  parseJsonFills,
  validateAiFills,
  getExtensionOrigin,
  callOpenAiCompatibleApi,
  callClaudeApi,
  callCustomEndpointApi
};

export type AiAgentSettings = AiRequestOptions | Partial<AppSettings>;

interface ProviderDispatchResult {
  readonly rawText: string;
  readonly selectedModel: string;
}

async function dispatchProviderCall(
  provider: AiProvider | string,
  payload: AiPromptPayload,
  settings: AiAgentSettings,
  signal: AbortSignal
): Promise<ProviderDispatchResult> {
  if (provider === 'openai-compatible') {
    const selectedModel = (settings.openaiModel || 'qwen2.5:3b').trim();
    const rawText = await callOpenAiCompatibleApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  if (provider === 'claude') {
    const custom = (settings.claudeCustomModel || '').trim();
    const standard = (settings.claudeModel || 'claude-3-5-haiku-20241022').trim();
    const selectedModel = custom || standard;
    const rawText = await callClaudeApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  if (provider === 'custom') {
    const selectedModel = (settings.customModel || 'custom').trim();
    const rawText = await callCustomEndpointApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  const custom = (settings.geminiCustomModel || '').trim();
  const standard = (settings.geminiModel || 'gemini-3.1-flash-lite').trim();
  const selectedModel = custom || standard;
  const rawText = await callGeminiApiTransport(payload, settings, signal);
  return { rawText, selectedModel };
}

function resolveTimeoutMs(settings: AiAgentSettings): number {
  if (typeof settings.timeoutSeconds === 'number' && settings.timeoutSeconds > 0) {
    return settings.timeoutSeconds * 1000;
  }
  if (typeof settings.timeoutMs === 'number' && settings.timeoutMs > 0) {
    return settings.timeoutMs;
  }
  return 90000;
}

function extractAllowedUids(payload: AiPromptPayload): string[] | null {
  const sourceFields: readonly (FieldMetadata | ScannedFormField)[] | null =
    Array.isArray(payload.simplifiedFields)
      ? payload.simplifiedFields
      : (Array.isArray(payload.fields) ? payload.fields : null);
  return sourceFields ? sourceFields.map((f) => f.uid) : null;
}

export async function callAiProvider(
  payload: AiPromptPayload,
  settings: AiAgentSettings = {}
): Promise<AiResponse> {
  const provider = (settings.aiProvider || 'gemini') as AiProvider;
  const timeoutMs = resolveTimeoutMs(settings);
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`AI request timed out after ${timeoutMs / 1000} seconds.`));
  }, timeoutMs);

  try {
    const { rawText, selectedModel } = await dispatchProviderCall(provider, payload, settings, controller.signal);
    const durationMs = Date.now() - startTime;
    const rawFillsArray = parseJsonFills(rawText);
    const allowedUids = extractAllowedUids(payload);
    const validatedFills = validateAiFills(rawFillsArray, allowedUids);

    return {
      fills: validatedFills,
      durationMs,
      rawPrompt: payload.userPrompt,
      rawResponse: rawText,
      provider,
      model: selectedModel
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('timed out'));
    if (isAbort) {
      throw new Error(`AI request timed out after ${timeoutMs / 1000} seconds. Please verify your provider connection.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testAiConnection(
  settings: AiAgentSettings = {}
): Promise<AiConnectionTestResult> {
  const provider = (settings.aiProvider || 'gemini') as AiProvider;
  const payload: AiPromptPayload = {
    systemInstruction:
      'You are an AI connection tester. Reply with ONLY valid JSON: {"status": "ok", "message": "Connection verified"}',
    userPrompt: 'Ping.',
    simplifiedFields: []
  };

  const result = await callAiProvider(payload, settings);
  return {
    success: true,
    provider,
    model: result.model,
    durationMs: result.durationMs,
    rawPrompt: result.rawPrompt,
    rawResponse: result.rawResponse
  };
}
