/**
 * OpenAI / Ollama / Local LLM Compatible Transport
 */

import { extractOpenAiOrOllamaText } from './response-parser.js';

export function getExtensionOrigin() {
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

function handleNetworkError(url, netErr) {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const extOrigin = getExtensionOrigin();
    const originParam = extOrigin || 'chrome-extension://<this-extension-id>';
    throw new Error(
      `Failed to reach local server at ${url}. If Ollama is running, it blocks browser origins by default. ` +
      `To safely allow only this extension, start Ollama with:\n` +
      `OLLAMA_ORIGINS="${originParam}" ollama serve (Details: ${netErr.message})`
    );
  }
  throw netErr;
}

async function handleHttpError(response, url) {
  const errText = await response.text();
  let parsedErr = errText;
  try {
    const errJson = JSON.parse(errText);
    parsedErr = errJson.error ? (errJson.error.message || errJson.error) : errText;
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

export async function callOpenAiCompatibleApi(payload, settings = {}, signal = null) {
  const url = (settings.openaiBaseUrl || 'http://localhost:11434/api/chat').trim();
  const apiKey = (settings.openaiApiKey || '').trim();
  const model = (settings.openaiModel || 'qwen2.5:3b').trim();
  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.1;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const requestBody = {
    model,
    stream: false,
    temperature,
    messages: [
      { role: 'system', content: payload.systemInstruction },
      { role: 'user', content: payload.userPrompt }
    ]
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });
  } catch (netErr) {
    handleNetworkError(url, netErr);
  }

  if (!response.ok) {
    await handleHttpError(response, url);
  }

  const data = await response.json();
  const rawText = extractOpenAiOrOllamaText(data);
  if (!rawText || !rawText.trim()) {
    throw new Error('OpenAI/Ollama provider returned an empty response.');
  }

  return rawText;
}
