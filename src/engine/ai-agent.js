/**
 * Multi-Provider AI Form Filling Agent Coordinator
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

async function dispatchProviderCall(provider, payload, settings, signal) {
  if (provider === 'openai-compatible') {
    const selectedModel = (settings.openaiModel || 'qwen2.5:3b').trim();
    const rawText = await callOpenAiCompatibleApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  if (provider === 'claude') {
    const selectedModel = (settings.claudeCustomModel || '').trim() || (settings.claudeModel || 'claude-3-5-haiku-20241022').trim();
    const rawText = await callClaudeApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  if (provider === 'custom') {
    const selectedModel = (settings.customModel || 'custom').trim();
    const rawText = await callCustomEndpointApi(payload, settings, signal);
    return { rawText, selectedModel };
  }
  const selectedModel = (settings.geminiCustomModel || '').trim() || (settings.geminiModel || 'gemini-3.1-flash-lite').trim();
  const rawText = await callGeminiApiTransport(payload, settings, signal);
  return { rawText, selectedModel };
}

function resolveTimeoutMs(settings) {
  if (typeof settings.timeoutSeconds === 'number' && settings.timeoutSeconds > 0) {
    return settings.timeoutSeconds * 1000;
  }
  if (typeof settings.timeoutMs === 'number' && settings.timeoutMs > 0) {
    return settings.timeoutMs;
  }
  return 90000;
}

export async function callAiProvider(payload, settings = {}) {
  const provider = settings.aiProvider || 'gemini';
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

    const sourceFields = Array.isArray(payload.simplifiedFields) ? payload.simplifiedFields : (Array.isArray(payload.fields) ? payload.fields : null);
    const allowedUids = sourceFields ? sourceFields.map((f) => f.uid) : null;
    const validatedFills = validateAiFills(rawFillsArray, allowedUids);

    return {
      fills: validatedFills,
      durationMs,
      rawPrompt: payload.userPrompt,
      rawResponse: rawText,
      provider,
      model: selectedModel
    };
  } catch (err) {
    if (err.name === 'AbortError' || (err.message && err.message.includes('timed out'))) {
      throw new Error(`AI request timed out after ${timeoutMs / 1000} seconds. Please verify your provider connection.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testAiConnection(settings = {}) {
  const provider = settings.aiProvider || 'gemini';
  const payload = {
    systemInstruction: 'You are an AI connection tester. Reply with ONLY valid JSON: {"status": "ok", "message": "Connection verified"}',
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
