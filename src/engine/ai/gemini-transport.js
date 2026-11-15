/**
 * Google Gemini Interactions API Transport
 */

import { extractInteractionText } from './response-parser.js';

const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

function parseGeminiErrorMessage(errText) {
  try {
    const errJson = JSON.parse(errText);
    return errJson.error ? (errJson.error.message || errJson.error) : errText;
  } catch (_e) {
    return errText;
  }
}

export async function callGeminiApiTransport(payload, settings = {}, signal = null) {
  const model = (settings.geminiCustomModel || '').trim() || (settings.geminiModel || 'gemini-3.1-flash-lite').trim();
  const apiKey = (settings.geminiApiKey || '').trim();
  if (!apiKey) {
    throw new Error('Google Gemini API Key is missing. Please set your key in Extension Settings.');
  }

  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.1;
  const inputText = payload.systemInstruction + '\n\n' + payload.userPrompt;
  const requestBody = {
    model,
    input: inputText,
    stream: false,
    generation_config: { temperature }
  };

  const response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': API_REVISION
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    const parsedErr = parseGeminiErrorMessage(errText);
    throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
  }

  const data = await response.json();
  if (data.status === 'FAILED' || data.error) {
    const msg = data.error?.message || data.status || 'Interaction failed';
    throw new Error(`Gemini Interaction Error: ${msg}`);
  }

  return extractInteractionText(data);
}
