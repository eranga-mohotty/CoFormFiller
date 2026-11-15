/**
 * Anthropic Claude /v1/messages Transport
 */

import { extractClaudeText } from './response-parser.js';

async function handleClaudeError(response) {
  const errText = await response.text();
  let parsedErr = errText;
  try {
    const errJson = JSON.parse(errText);
    parsedErr = errJson.error ? errJson.error.message : errText;
  } catch (_e) {
    // raw text fallback
  }
  throw new Error(`Anthropic Claude Error (${response.status}): ${parsedErr}`);
}

export async function callClaudeApi(payload, settings = {}, signal = null) {
  const apiKey = (settings.claudeApiKey || '').trim();
  if (!apiKey) {
    throw new Error('Anthropic Claude API Key is missing. Please enter your key in Extension Settings.');
  }

  const url = 'https://api.anthropic.com/v1/messages';
  const model = (settings.claudeCustomModel || '').trim() || (settings.claudeModel || 'claude-3-5-haiku-20241022').trim();
  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.1;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const requestBody = {
    model,
    max_tokens: 4096,
    temperature,
    system: payload.systemInstruction,
    messages: [
      { role: 'user', content: payload.userPrompt }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    await handleClaudeError(response);
  }

  const data = await response.json();
  const rawText = extractClaudeText(data);
  if (!rawText || !rawText.trim()) {
    throw new Error('Claude returned an empty response.');
  }

  return rawText;
}
