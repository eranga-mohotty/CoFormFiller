/**
 * Custom Webhook & HTTP Endpoint Transport
 */

import {
  resolveJsonPath,
  extractOpenAiOrOllamaText,
  extractInteractionText
} from './response-parser.js';

function parseCustomHeaders(headerStr) {
  const headers = { 'Content-Type': 'application/json' };
  if (!headerStr) return headers;

  for (const line of headerStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const k = line.substring(0, colonIdx).trim();
      const v = line.substring(colonIdx + 1).trim();
      if (k && v) headers[k] = v;
    }
  }
  return headers;
}

function formatCustomBody(template, payload, settings) {
  const bodyStr = template || '{"prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}"}';
  return bodyStr
    .replace(/\{\{SYSTEM_PROMPT\}\}/g, JSON.stringify(payload.systemInstruction).slice(1, -1))
    .replace(/\{\{USER_PROMPT\}\}/g, JSON.stringify(payload.userPrompt).slice(1, -1))
    .replace(/\{\{MODEL\}\}/g, settings.customModel || '')
    .replace(/\{\{TEMPERATURE\}\}/g, String(settings.temperature || 0.1));
}

function extractCustomResponseText(data, responsePath) {
  let rawText = resolveJsonPath(data, responsePath);
  if (!rawText && typeof data === 'object') {
    rawText = extractOpenAiOrOllamaText(data) || extractInteractionText(data);
  }
  return rawText;
}

export async function callCustomEndpointApi(payload, settings = {}, signal = null) {
  const url = (settings.customEndpointUrl || '').trim();
  if (!url) {
    throw new Error('Custom Endpoint URL is required. Please enter an endpoint in Extension Settings.');
  }

  const headers = parseCustomHeaders(settings.customHeaders);
  const body = formatCustomBody(settings.customBodyTemplate, payload, settings);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Custom Endpoint Error (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const responsePath = (settings.customResponsePath || 'choices[0].message.content').trim();
  const rawText = extractCustomResponseText(data, responsePath);

  if (!rawText || !rawText.trim()) {
    throw new Error(`Custom Endpoint returned response, but could not extract text using path: "${responsePath}".\nResponse keys: ${Object.keys(data).join(', ')}`);
  }

  return rawText;
}
