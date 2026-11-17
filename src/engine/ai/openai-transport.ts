/**
 * OpenAI / Ollama / Local LLM Compatible Transport
 * Pure TypeScript, Web Platform APIs, zero runtime npm dependencies.
 */

import { extractOpenAiOrOllamaText } from './response-parser.js';
import type {
  AiPromptPayload,
  AiRequestOptions,
  OpenAiProviderConfig,
  OpenAiCompatibleProviderConfig,
  OllamaProviderConfig
} from '../../types/engine.js';
import type { AppSettings } from '../../types/storage.js';

export type OpenAiTransportSettings =
  | OpenAiProviderConfig
  | OpenAiCompatibleProviderConfig
  | OllamaProviderConfig
  | AiRequestOptions
  | Partial<AppSettings>;

interface OpenAiRequestBody {
  readonly model: string;
  readonly stream: boolean;
  readonly temperature: number;
  readonly messages: readonly [
    { readonly role: 'system'; readonly content: string },
    { readonly role: 'user'; readonly content: string }
  ];
}

export function getExtensionOrigin(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    try {
      const fullUrl = chrome.runtime.getURL('');
      const u = new URL(fullUrl);
      if (u.origin && u.origin !== 'null') {
        return u.origin;
      }
      return `${u.protocol}//${u.host}`;
    } catch (_e) {
      return '';
    }
  }
  return '';
}

function handleNetworkError(url: string, netErr: unknown): never {
  const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const extOrigin = getExtensionOrigin();
    const originParam = extOrigin || 'chrome-extension://<this-extension-id>';
    throw new Error(
      `Failed to reach local server at ${url}. If Ollama is running, it blocks browser origins by default. ` +
      `To safely allow only this extension, start Ollama with:\n` +
      `OLLAMA_ORIGINS="${originParam}" ollama serve (Details: ${errMsg})`
    );
  }
  throw netErr;
}

async function handleHttpError(response: Response, url: string): Promise<never> {
  const errText = await response.text();
  let parsedErr = errText;
  try {
    const errJson = JSON.parse(errText) as { error?: { message?: string } | string };
    if (errJson.error) {
      parsedErr = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || errText);
    }
  } catch (_e) {
    // raw text fallback
  }

  if (response.status === 403 && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    const extOrigin = getExtensionOrigin();
    const originParam = extOrigin || 'chrome-extension://<this-extension-id>';
    throw new Error(
      `Ollama Origin Block (403 Forbidden): Ollama blocks browser extensions by default. ` +
      `To safely allow only this extension without exposing your local instance to other sites, start Ollama with:\n` +
      `OLLAMA_ORIGINS="${originParam}" ollama serve`
    );
  }

  throw new Error(`OpenAI/Ollama API Error (${response.status}): ${parsedErr}`);
}

function resolveOpenAiConfig(settings: OpenAiTransportSettings): { url: string; apiKey: string; model: string; temperature: number } {
  const rawUrl = ('openaiBaseUrl' in settings && settings.openaiBaseUrl) ||
                 ('baseUrl' in settings && settings.baseUrl) || 'http://localhost:11434/api/chat';
  const rawKey = ('openaiApiKey' in settings && settings.openaiApiKey) ||
                 ('apiKey' in settings && settings.apiKey) || '';
  const rawModel = ('openaiModel' in settings && settings.openaiModel) ||
                   ('model' in settings && settings.model) || 'qwen2.5:3b';
  const tempVal = settings.temperature;

  return {
    url: rawUrl.trim(),
    apiKey: rawKey.trim(),
    model: rawModel.trim(),
    temperature: typeof tempVal === 'number' ? tempVal : 0.1
  };
}

function buildOpenAiRequestBody(model: string, payload: AiPromptPayload, temperature: number): OpenAiRequestBody {
  return {
    model,
    stream: false,
    temperature,
    messages: [
      { role: 'system', content: payload.systemInstruction },
      { role: 'user', content: payload.userPrompt }
    ]
  };
}

export async function callOpenAiCompatibleApi(
  payload: AiPromptPayload,
  settings: OpenAiTransportSettings = {},
  signal: AbortSignal | null = null
): Promise<string> {
  const { url, apiKey, model, temperature } = resolveOpenAiConfig(settings);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildOpenAiRequestBody(model, payload, temperature)),
      signal: signal ?? undefined
    });
  } catch (netErr) {
    handleNetworkError(url, netErr);
  }

  if (!response.ok) {
    await handleHttpError(response, url);
  }

  const data: unknown = await response.json();
  const rawText = extractOpenAiOrOllamaText(data);
  if (!rawText || !rawText.trim()) {
    throw new Error('OpenAI/Ollama provider returned an empty response.');
  }

  return rawText;
}
