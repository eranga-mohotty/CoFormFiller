/**
 * Tier 2: Gemini AI Agent Form Filling Engine
 * Uses the Google Gemini Interactions API (SSE streaming).
 * Reasons over schema-agnostic profile knowledge to fill complex fields, descriptions,
 * operating hours, multi-checkboxes, and dropdowns.
 */

const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

/**
 * Build the AI prompt payload combining profile knowledge and scanned DOM fields
 */
export function buildPromptPayload(fields, profile, settings = {}) {
  const customInstructions = settings.customPromptInstructions ? `\nUSER CUSTOM INSTRUCTIONS:\n${settings.customPromptInstructions}\n` : '';

  const systemInstruction = `You are SmartForm AI, an intelligent executive assistant and form-filling agent.
Your objective is to examine the provided Web Form Fields and fill them using the Profile Knowledge Base provided.

PROFILE KNOWLEDGE BASE:
${JSON.stringify(profile.data || profile, null, 2)}
${customInstructions}
FORM FILLING RULES:
1. BUSINESS DESCRIPTIONS & TEXTAREAS:
   - Check 'maxLength'. If a limit is specified (e.g. 150 chars), craft a concise, natural summary that fits within the limit without getting cut off mid-sentence.
   - For unrestricted textareas, provide the complete, detailed description from the profile.
2. OPERATING / TRADING HOURS:
   - Read the profile's opening hours carefully.
   - Map day/time fields (e.g. Monday Open, Monday Close) to the form's UI.
   - If options are provided for a select element, select the exact 'value' that matches the time (e.g., "07:00", "7:00 AM", or "7am").
   - If a radio button or checkbox asks for 24/7, after-hours, or weekend availability, match it against the profile's schedule.
3. SERVICES & MULTI-CHECKBOXES:
   - For checkbox items (e.g. lists of services or specialties), evaluate the checkbox label and value against the profile's services.
   - Set 'checked': true ONLY for services that genuinely match the profile.
   - Set 'checked': false or omit for services the business does NOT provide.
4. DROPDOWNS (<select>) & RADIO BUTTONS:
   - Carefully review the 'options' list provided for each field.
   - Select the best semantic match and return its exact 'value' (e.g. if the option is {"value": "WA", "text": "Western Australia"}, return "WA").
5. QUESTIONS & FAQS:
   - If a form asks questions (e.g. "What areas do you service?", "Why choose your company?"), formulate a direct, professional answer based on the profile facts and FAQs.
6. ANTI-HALLUCINATION / NO-GUESSING:
   - If the profile genuinely does not contain the required information for a field, return null for that field's value or leave it out. Never invent fictional details.

OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no code fences). The JSON must have a "fills" array:
{
  "fills": [
    {
      "uid": "string (the exact uid from the field)",
      "value": "string or number (the text to insert or option value to select)",
      "checked": true/false (required for checkbox and radio inputs),
      "reasoning": "brief 1-sentence explanation"
    }
  ]
}`;

  // Clean field representations to send to Gemini
  const simplifiedFields = fields.map((item) => {
    const f = item.info || item;
    const clean = {
      uid: f.uid,
      tag: f.tag,
      type: f.type,
      label: f.label,
      groupContext: f.groupContext || undefined,
      placeholder: f.placeholder || undefined,
      required: f.required || undefined,
      maxLength: f.maxLength || undefined
    };

    if (f.options && f.options.length > 0) {
      clean.options = f.options.map((o) => ({ value: o.value, text: o.text }));
    }
    if (f.radioGroup && f.radioGroup.options) {
      clean.radioOptions = f.radioGroup.options.map((o) => ({ value: o.value, text: o.text }));
    }
    if (f.valueAttr) {
      clean.valueAttr = f.valueAttr;
    }

    return clean;
  });

  const userPrompt = `Please determine the optimal values for the following ${simplifiedFields.length} form field(s):\n${JSON.stringify(simplifiedFields, null, 2)}`;

  return {
    systemInstruction,
    userPrompt,
    simplifiedFields
  };
}

/**
 * Validate and sanitize fills returned by Gemini before passing to the DOM inserter
 */
export function validateAiFills(rawFills, allowedUids = null) {
  if (!Array.isArray(rawFills)) {
    return [];
  }

  const validUidSet = allowedUids ? new Set(allowedUids) : null;
  const seenUids = new Set();
  const sanitized = [];

  for (const item of rawFills) {
    if (!item || typeof item !== 'object') continue;

    const uid = typeof item.uid === 'string' ? item.uid.trim() : '';
    if (!uid) continue;

    // Reject hallucinated UIDs if an allowed whitelist is provided
    if (validUidSet && !validUidSet.has(uid)) {
      continue;
    }

    // Deduplicate: preserve first occurrence
    if (seenUids.has(uid)) {
      continue;
    }
    seenUids.add(uid);

    const fill = {
      uid,
      reasoning: typeof item.reasoning === 'string' ? item.reasoning.substring(0, 300) : ''
    };

    if (typeof item.checked === 'boolean') {
      fill.checked = item.checked;
    }

    if (item.value !== undefined && item.value !== null) {
      const strVal = String(item.value);
      // Cap individual field length to 5000 characters to prevent memory abuse / DOM freeze
      fill.value = strVal.length > 5000 ? strVal.substring(0, 5000) : strVal;
    }

    sanitized.push(fill);
  }

  return sanitized;
}

/**
 * Extract model output text from the Gemini Interactions API non-streaming JSON response
 */
export function extractInteractionText(data) {
  if (!data || typeof data !== 'object') return '';

  function extractFromContent(content) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item.text === 'string') return item.text;
          return '';
        })
        .join('');
    }
    if (typeof content === 'object') {
      if (Array.isArray(content.parts)) {
        return content.parts
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('');
      }
      if (typeof content.text === 'string') return content.text;
    }
    return '';
  }

  // 1. Standard Interactions API steps array (e.g. content: [{ text: "...", type: "text" }])
  if (Array.isArray(data.steps)) {
    let combined = '';
    for (const step of data.steps) {
      if (!step) continue;
      if (step.content) {
        combined += extractFromContent(step.content);
      } else if (typeof step.text === 'string') {
        combined += step.text;
      }
    }
    if (combined.trim()) return combined;
  }

  // 2. Alternate outputs representation (e.g. outputs: [{ text: "..." }])
  if (Array.isArray(data.outputs)) {
    let combined = '';
    for (const out of data.outputs) {
      if (!out) continue;
      if (typeof out.text === 'string') {
        combined += out.text;
      } else if (out.content) {
        combined += extractFromContent(out.content);
      }
    }
    if (combined.trim()) return combined;
  }

  // 3. Fallback candidates format
  if (Array.isArray(data.candidates) && data.candidates[0]?.content) {
    const text = extractFromContent(data.candidates[0].content);
    if (text.trim()) return text;
  }

  // 4. Direct text property
  if (typeof data.text === 'string') return data.text;

  return '';
}

/**
 * Parse JSON fills safely from raw model text output, stripping any markdown fences
 */
export function parseJsonFills(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // Try direct parse
  try {
    const direct = JSON.parse(rawText);
    return Array.isArray(direct) ? direct : (direct.fills || []);
  } catch (e) {
    // Attempt to extract from markdown code fences or curly braces
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/i)
      || rawText.match(/```\s*([\s\S]*?)\s*```/i)
      || rawText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return Array.isArray(extracted) ? extracted : (extracted.fills || []);
      } catch (innerErr) {
        throw new Error('Could not parse JSON from AI response: ' + innerErr.message + '\nRaw text: ' + rawText.substring(0, 300));
      }
    }
  }

  throw new Error('No valid JSON fills found in AI output.\nRaw text: ' + rawText.substring(0, 300));
}

/**
 * Extract model output text from OpenAI-compatible & Ollama endpoints
 * Handles:
 * - Ollama native /api/chat: data.message.content
 * - OpenAI / LM Studio / DeepSeek / Groq /v1/chat/completions: data.choices[0].message.content
 * - Ollama native /api/generate: data.response
 */
export function extractOpenAiOrOllamaText(data) {
  if (!data || typeof data !== 'object') return '';

  // 1. Ollama native /api/chat
  if (data.message && typeof data.message.content === 'string') {
    return data.message.content;
  }

  // 2. OpenAI / LM Studio / DeepSeek / Groq / Ollama /v1/chat/completions
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  // 3. Ollama native /api/generate
  if (typeof data.response === 'string') {
    return data.response;
  }

  // 4. Simple text field
  if (typeof data.text === 'string') {
    return data.text;
  }

  return '';
}

/**
 * Extract model output text from Anthropic Claude /v1/messages responses
 */
export function extractClaudeText(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.content)) {
    return data.content
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .join('');
  }
  return '';
}

/**
 * Safe dot-notation path resolver for custom webhooks (e.g. "choices[0].message.content")
 */
export function resolveJsonPath(obj, path) {
  if (!path || !obj) return '';
  try {
    const cleanPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
    const parts = cleanPath.split('.');
    let current = obj;
    for (const p of parts) {
      if (current === undefined || current === null) return '';
      current = current[p];
    }
    return typeof current === 'string' ? current : (current !== undefined ? JSON.stringify(current) : '');
  } catch (e) {
    return '';
  }
}

/**
 * Safely resolves the current browser extension origin across Chromium and Firefox.
 * (e.g. "chrome-extension://abcdef..." or "moz-extension://uuid-...")
 */
export function getExtensionOrigin() {
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    try {
      const fullUrl = chrome.runtime.getURL('');
      const u = new URL(fullUrl);
      if (u.origin && u.origin !== 'null') {
        return u.origin;
      }
      return `${u.protocol}//${u.host}`;
    } catch (e) {
      return '';
    }
  }
  return '';
}

/**
 * Call OpenAI, DeepSeek, Groq, Ollama, LM Studio via OpenAI-compatible schema
 */
export async function callOpenAiCompatibleApi(payload, settings = {}, signal = null) {
  const url = (settings.openaiBaseUrl || 'http://localhost:11434/api/chat').trim();
  const apiKey = (settings.openaiApiKey || '').trim();
  const model = (settings.openaiModel || 'qwen2.5:3b').trim();
  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.1;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Build messages array
  const messages = [
    { role: 'system', content: payload.systemInstruction },
    { role: 'user', content: payload.userPrompt }
  ];

  const requestBody = {
    model,
    stream: false,
    temperature,
    messages
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

  if (!response.ok) {
    const errText = await response.text();
    let parsedErr = errText;
    try {
      const errJson = JSON.parse(errText);
      parsedErr = errJson.error ? (errJson.error.message || errJson.error) : errText;
    } catch (e) {}

    // Special detection for Ollama 403 Forbidden Origin block
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

  const data = await response.json();
  const rawText = extractOpenAiOrOllamaText(data);

  if (!rawText || !rawText.trim()) {
    throw new Error('OpenAI/Ollama provider returned an empty response.');
  }

  return rawText;
}

/**
 * Call Anthropic Claude /v1/messages
 */
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
    const errText = await response.text();
    let parsedErr = errText;
    try {
      const errJson = JSON.parse(errText);
      parsedErr = errJson.error ? errJson.error.message : errText;
    } catch (e) {}
    throw new Error(`Anthropic Claude Error (${response.status}): ${parsedErr}`);
  }

  const data = await response.json();
  const rawText = extractClaudeText(data);

  if (!rawText || !rawText.trim()) {
    throw new Error('Claude returned an empty response.');
  }

  return rawText;
}

/**
 * Call a custom user-defined HTTP endpoint with token replacement
 */
export async function callCustomEndpointApi(payload, settings = {}, signal = null) {
  const url = (settings.customEndpointUrl || '').trim();
  if (!url) {
    throw new Error('Custom Endpoint URL is required. Please enter an endpoint in Extension Settings.');
  }

  // Parse headers
  const headers = { 'Content-Type': 'application/json' };
  if (settings.customHeaders) {
    const lines = settings.customHeaders.split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const k = line.substring(0, colonIdx).trim();
        const v = line.substring(colonIdx + 1).trim();
        if (k && v) headers[k] = v;
      }
    }
  }

  // Format request body using template tokens
  let bodyStr = settings.customBodyTemplate || '{"prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}"}';
  bodyStr = bodyStr
    .replace(/\{\{SYSTEM_PROMPT\}\}/g, JSON.stringify(payload.systemInstruction).slice(1, -1))
    .replace(/\{\{USER_PROMPT\}\}/g, JSON.stringify(payload.userPrompt).slice(1, -1))
    .replace(/\{\{MODEL\}\}/g, settings.customModel || '')
    .replace(/\{\{TEMPERATURE\}\}/g, String(settings.temperature || 0.1));

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyStr,
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Custom Endpoint Error (${response.status}): ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const responsePath = (settings.customResponsePath || 'choices[0].message.content').trim();
  let rawText = resolveJsonPath(data, responsePath);

  if (!rawText && typeof data === 'object') {
    // Fallback: search common fields
    rawText = extractOpenAiOrOllamaText(data) || extractInteractionText(data);
  }

  if (!rawText || !rawText.trim()) {
    throw new Error(`Custom Endpoint returned response, but could not extract text using path: "${responsePath}".\nResponse keys: ${Object.keys(data).join(', ')}`);
  }

  return rawText;
}

/**
 * Universal AI Fill Dispatcher: routes form filling to the user's selected provider,
 * parses JSON, and strictly validates fills against scanned DOM UIDs.
 */
export async function callAiProvider(payload, settings = {}) {
  const provider = settings.aiProvider || 'gemini';
  const timeoutMs = typeof settings.timeoutSeconds === 'number' && settings.timeoutSeconds > 0
    ? settings.timeoutSeconds * 1000
    : (typeof settings.timeoutMs === 'number' && settings.timeoutMs > 0 ? settings.timeoutMs : 90000);

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`AI request timed out after ${timeoutMs / 1000} seconds.`));
  }, timeoutMs);

  let rawText = '';
  let selectedModel = '';

  try {
    switch (provider) {
      case 'openai-compatible':
        selectedModel = (settings.openaiModel || 'qwen2.5:3b').trim();
        rawText = await callOpenAiCompatibleApi(payload, settings, controller.signal);
        break;

      case 'claude':
        selectedModel = (settings.claudeCustomModel || '').trim() || (settings.claudeModel || 'claude-3-5-haiku-20241022').trim();
        rawText = await callClaudeApi(payload, settings, controller.signal);
        break;

      case 'custom':
        selectedModel = (settings.customModel || 'custom').trim();
        rawText = await callCustomEndpointApi(payload, settings, controller.signal);
        break;

      case 'gemini':
      default:
        // Raw fetch for Gemini non-streaming
        {
          selectedModel = (settings.geminiCustomModel || '').trim() || (settings.geminiModel || 'gemini-3.1-flash-lite').trim();
          const apiKey = (settings.geminiApiKey || '').trim();
          if (!apiKey) {
            throw new Error('Google Gemini API Key is missing. Please set your key in Extension Settings.');
          }
          const model = selectedModel;
          const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.1;

          const endpoint = GEMINI_INTERACTIONS_ENDPOINT;
          const inputText = payload.systemInstruction + '\n\n' + payload.userPrompt;
          const requestBody = {
            model,
            input: inputText,
            stream: false,
            generation_config: { temperature }
          };

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
              'Api-Revision': API_REVISION
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });

          if (!response.ok) {
            const errText = await response.text();
            let parsedErr = errText;
            try {
              const errJson = JSON.parse(errText);
              parsedErr = errJson.error ? errJson.error.message : errText;
            } catch (e) {}
            throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
          }

          const data = await response.json();
          if (data.status === 'FAILED' || data.error) {
            const msg = data.error?.message || data.status || 'Interaction failed';
            throw new Error(`Gemini Interaction Error: ${msg}`);
          }

          rawText = extractInteractionText(data);
        }
        break;
    }

    const durationMs = Date.now() - startTime;

    if (!rawText || !rawText.trim()) {
      throw new Error(`AI Provider "${provider}" returned an empty response.`);
    }

    // Parse fills JSON safely
    const rawFillsArray = parseJsonFills(rawText);

    // Whitelist check: only accept UIDs from scanned DOM fields, deduplicate & cap size
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

/**
 * Universal Test Connection: verifies API credentials and ping latency for ANY provider
 */
export async function testAiConnection(settings = {}) {
  const provider = settings.aiProvider || 'gemini';
  const modelName = provider === 'openai-compatible'
    ? (settings.openaiModel || 'qwen2.5:3b')
    : (provider === 'claude'
        ? ((settings.claudeCustomModel || '').trim() || settings.claudeModel || 'claude-3-5-haiku-20241022')
        : (provider === 'custom'
            ? (settings.customModel || 'custom')
            : ((settings.geminiCustomModel || '').trim() || settings.geminiModel || 'gemini-3.1-flash-lite')));

  const payload = {
    systemInstruction: 'You are an AI connection tester. Reply with ONLY valid JSON: {"status": "ok", "message": "Connection verified"}',
    userPrompt: 'Ping.',
    simplifiedFields: []
  };

  const result = await callAiProvider(payload, settings);
  return {
    success: true,
    provider,
    model: modelName,
    durationMs: result.durationMs,
    rawPrompt: result.rawPrompt,
    rawResponse: result.rawResponse
  };
}

/**
 * Backward compatibility: Call Gemini specifically
 */
export async function callGeminiApi(payload, apiKey, model = 'gemini-3.1-flash-lite', temperature = 0.1) {
  return callAiProvider(payload, {
    aiProvider: 'gemini',
    geminiApiKey: apiKey,
    geminiModel: model,
    temperature
  });
}

/**
 * Backward compatibility: Test Gemini specifically
 */
export async function testGeminiConnection(apiKey, model = 'gemini-3.1-flash-lite') {
  return testAiConnection({
    aiProvider: 'gemini',
    geminiApiKey: apiKey,
    geminiModel: model
  });
}
