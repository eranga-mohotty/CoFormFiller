/**
 * Custom Webhook & HTTP Endpoint Transport
 * Pure TypeScript, Web Platform APIs, zero runtime npm dependencies.
 */

import {
  resolveJsonPath,
  extractOpenAiOrOllamaText,
  extractInteractionText
} from './response-parser.js';
import type {
  AiPromptPayload,
  AiRequestOptions,
  CustomProviderConfig
} from '../../types/engine.js';
import type { AppSettings } from '../../types/storage.js';

export type CustomTransportSettings = CustomProviderConfig | AiRequestOptions | Partial<AppSettings>;

function parseCustomHeaders(headerInput?: string | Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!headerInput) return headers;

  if (typeof headerInput === 'object') {
    return { ...headers, ...headerInput };
  }

  for (const line of headerInput.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const k = line.substring(0, colonIdx).trim();
      const v = line.substring(colonIdx + 1).trim();
      if (k && v) headers[k] = v;
    }
  }
  return headers;
}

function formatCustomBody(template: string | undefined, payload: AiPromptPayload, model: string, temperature: number): string {
  const bodyStr = template || '{"prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}"}';
  return bodyStr
    .replace(/\{\{SYSTEM_PROMPT\}\}/g, JSON.stringify(payload.systemInstruction).slice(1, -1))
    .replace(/\{\{USER_PROMPT\}\}/g, JSON.stringify(payload.userPrompt).slice(1, -1))
    .replace(/\{\{MODEL\}\}/g, model)
    .replace(/\{\{TEMPERATURE\}\}/g, String(temperature));
}

function extractCustomResponseText(data: unknown, responsePath: string): string {
  let rawText = resolveJsonPath(data, responsePath);
  if (!rawText && typeof data === 'object' && data !== null) {
    rawText = extractOpenAiOrOllamaText(data) || extractInteractionText(data);
  }
  return rawText;
}

function resolveCustomConfig(settings: CustomTransportSettings): {
  url: string;
  headersInput?: string | Record<string, string>;
  template?: string;
  responsePath: string;
  model: string;
  temperature: number;
} {
  const rawUrl = ('customEndpointUrl' in settings && settings.customEndpointUrl) ||
                 ('endpointUrl' in settings && settings.endpointUrl) || '';
  const headersInput = ('customHeaders' in settings && settings.customHeaders) ||
                       ('headers' in settings && settings.headers) || undefined;
  const template = ('customBodyTemplate' in settings && settings.customBodyTemplate) ||
                   ('bodyTemplate' in settings && settings.bodyTemplate) || undefined;
  const rawPath = ('customResponsePath' in settings && settings.customResponsePath) ||
                  ('responsePath' in settings && settings.responsePath) || 'choices[0].message.content';
  const model = ('customModel' in settings && settings.customModel) ||
                ('model' in settings && settings.model) || '';
  const tempVal = settings.temperature;

  return {
    url: rawUrl.trim(),
    headersInput,
    template,
    responsePath: rawPath.trim(),
    model: model.trim(),
    temperature: typeof tempVal === 'number' ? tempVal : 0.1
  };
}

export async function callCustomEndpointApi(
  payload: AiPromptPayload,
  settings: CustomTransportSettings = {},
  signal: AbortSignal | null = null
): Promise<string> {
  const { url, headersInput, template, responsePath, model, temperature } = resolveCustomConfig(settings);
  if (!url) {
    throw new Error('Custom Endpoint URL is required. Please enter an endpoint in Extension Settings.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: parseCustomHeaders(headersInput),
    body: formatCustomBody(template, payload, model, temperature),
    signal: signal ?? undefined
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Custom Endpoint Error (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data: unknown = await response.json();
  const rawText = extractCustomResponseText(data, responsePath);
  if (!rawText || !rawText.trim()) {
    const keys = (typeof data === 'object' && data !== null) ? Object.keys(data).join(', ') : '';
    throw new Error(`Custom Endpoint returned response, but could not extract text using path: "${responsePath}".\nResponse keys: ${keys}`);
  }

  return rawText;
}
