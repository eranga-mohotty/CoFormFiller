/**
 * Anthropic Claude /v1/messages Transport
 * Pure TypeScript, Web Platform APIs, zero runtime npm dependencies.
 */

import { extractClaudeText } from './response-parser.js';
import type {
  AiPromptPayload,
  AiRequestOptions,
  ClaudeProviderConfig
} from '../../types/engine.js';
import type { AppSettings } from '../../types/storage.js';

export type ClaudeTransportSettings = ClaudeProviderConfig | AiRequestOptions | Partial<AppSettings>;

interface ClaudeRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly temperature: number;
  readonly system: string;
  readonly messages: readonly [
    { readonly role: 'user'; readonly content: string }
  ];
}

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

async function handleClaudeError(response: Response): Promise<never> {
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
  throw new Error(`Anthropic Claude Error (${response.status}): ${parsedErr}`);
}

function resolveClaudeConfig(settings: ClaudeTransportSettings): { apiKey: string; model: string; temperature: number } {
  const rawKey = ('claudeApiKey' in settings && settings.claudeApiKey) ||
                 ('apiKey' in settings && settings.apiKey) || '';
  const custom = ('claudeCustomModel' in settings && settings.claudeCustomModel) ||
                 ('customModel' in settings && settings.customModel) || '';
  const standard = ('claudeModel' in settings && settings.claudeModel) ||
                   ('model' in settings && settings.model) || 'claude-3-5-haiku-20241022';
  const tempVal = settings.temperature;

  return {
    apiKey: rawKey.trim(),
    model: (custom.trim() || standard.trim()),
    temperature: typeof tempVal === 'number' ? tempVal : 0.1
  };
}

function buildClaudeRequestBody(model: string, payload: AiPromptPayload, temperature: number): ClaudeRequestBody {
  return {
    model,
    max_tokens: 4096,
    temperature,
    system: payload.systemInstruction,
    messages: [
      { role: 'user', content: payload.userPrompt }
    ]
  };
}

export async function callClaudeApi(
  payload: AiPromptPayload,
  settings: ClaudeTransportSettings = {},
  signal: AbortSignal | null = null
): Promise<string> {
  const { apiKey, model, temperature } = resolveClaudeConfig(settings);
  if (!apiKey) {
    throw new Error('Anthropic Claude API Key is missing. Please enter your key in Extension Settings.');
  }

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(buildClaudeRequestBody(model, payload, temperature)),
    signal: signal ?? undefined
  });

  if (!response.ok) {
    await handleClaudeError(response);
  }

  const data: unknown = await response.json();
  const rawText = extractClaudeText(data);
  if (!rawText || !rawText.trim()) {
    throw new Error('Claude returned an empty response.');
  }

  return rawText;
}
