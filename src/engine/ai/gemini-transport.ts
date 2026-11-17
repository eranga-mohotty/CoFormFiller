/**
 * Google Gemini Interactions API Transport
 * Pure TypeScript, Web Platform APIs, zero runtime npm dependencies.
 */

import { extractInteractionText } from './response-parser.js';
import type {
  AiPromptPayload,
  AiRequestOptions,
  GeminiProviderConfig
} from '../../types/engine.js';
import type { AppSettings } from '../../types/storage.js';

export type GeminiTransportSettings = GeminiProviderConfig | AiRequestOptions | Partial<AppSettings>;

interface GeminiRequestBody {
  readonly model: string;
  readonly input: string;
  readonly stream: boolean;
  readonly generation_config: {
    readonly temperature: number;
  };
}

const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

function parseGeminiErrorMessage(errText: string): string {
  try {
    const errJson = JSON.parse(errText) as { error?: { message?: string } | string };
    if (!errJson.error) return errText;
    return typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || errText);
  } catch (_e) {
    return errText;
  }
}

function resolveGeminiConfig(settings: GeminiTransportSettings): { model: string; apiKey: string; temperature: number } {
  const custom = ('geminiCustomModel' in settings && settings.geminiCustomModel) ||
                 ('customModel' in settings && settings.customModel) || '';
  const standard = ('geminiModel' in settings && settings.geminiModel) ||
                   ('model' in settings && settings.model) || 'gemini-3.1-flash-lite';
  const model = (custom.trim() || standard.trim());

  const rawApiKey = ('geminiApiKey' in settings && settings.geminiApiKey) ||
                    ('apiKey' in settings && settings.apiKey) || '';
  const apiKey = rawApiKey.trim();

  const tempVal = settings.temperature;
  const temperature = typeof tempVal === 'number' ? tempVal : 0.1;

  return { model, apiKey, temperature };
}

function buildGeminiRequestBody(model: string, payload: AiPromptPayload, temperature: number): GeminiRequestBody {
  return {
    model,
    input: `${payload.systemInstruction}\n\n${payload.userPrompt}`,
    stream: false,
    generation_config: { temperature }
  };
}

async function handleGeminiResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const errText = await response.text();
    const parsedErr = parseGeminiErrorMessage(errText);
    throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
  }

  const data = (await response.json()) as { status?: string; error?: { message?: string } };
  if (data.status === 'FAILED' || data.error) {
    const msg = data.error?.message || data.status || 'Interaction failed';
    throw new Error(`Gemini Interaction Error: ${msg}`);
  }

  return data;
}

export async function callGeminiApiTransport(
  payload: AiPromptPayload,
  settings: GeminiTransportSettings = {},
  signal: AbortSignal | null = null
): Promise<string> {
  const { model, apiKey, temperature } = resolveGeminiConfig(settings);
  if (!apiKey) {
    throw new Error('Google Gemini API Key is missing. Please set your key in Extension Settings.');
  }

  const requestBody = buildGeminiRequestBody(model, payload, temperature);
  const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': API_REVISION
    },
    body: JSON.stringify(requestBody),
    signal: signal ?? undefined
  });

  const data = await handleGeminiResponse(response);
  return extractInteractionText(data);
}
