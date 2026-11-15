/**
 * AI Response Parsers, JSON Extractor, and Schema Whitelist Validator
 */

function extractFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      return item && typeof item.text === 'string' ? item.text : '';
    }).join('');
  }
  if (typeof content === 'object') {
    if (Array.isArray(content.parts)) {
      return content.parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
    }
    if (typeof content.text === 'string') return content.text;
  }
  return '';
}

export function extractInteractionText(data) {
  if (!data || typeof data !== 'object') return '';

  if (Array.isArray(data.steps)) {
    const combined = data.steps
      .filter(Boolean)
      .map((s) => (s.content ? extractFromContent(s.content) : (typeof s.text === 'string' ? s.text : '')))
      .join('');
    if (combined.trim()) return combined;
  }

  if (Array.isArray(data.outputs)) {
    const combined = data.outputs
      .filter(Boolean)
      .map((o) => (typeof o.text === 'string' ? o.text : (o.content ? extractFromContent(o.content) : '')))
      .join('');
    if (combined.trim()) return combined;
  }

  if (Array.isArray(data.candidates) && data.candidates[0]?.content) {
    const text = extractFromContent(data.candidates[0].content);
    if (text.trim()) return text;
  }

  return typeof data.text === 'string' ? data.text : '';
}

export function extractOpenAiOrOllamaText(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.message && typeof data.message.content === 'string') {
    return data.message.content;
  }
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (typeof data.response === 'string') return data.response;
  return typeof data.text === 'string' ? data.text : '';
}

export function extractClaudeText(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.content)) {
    return data.content
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .join('');
  }
  return '';
}

export function resolveJsonPath(obj, path) {
  if (!path || !obj) return '';
  try {
    const cleanPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
    let current = obj;
    for (const p of cleanPath.split('.')) {
      if (current === undefined || current === null) return '';
      current = current[p];
    }
    return typeof current === 'string' ? current : (current !== undefined ? JSON.stringify(current) : '');
  } catch (_e) {
    return '';
  }
}

export function parseJsonFills(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  try {
    const direct = JSON.parse(rawText);
    return Array.isArray(direct) ? direct : (direct.fills || []);
  } catch (_e) {
    const match = rawText.match(/```json\s*([\s\S]*?)\s*```/i)
      || rawText.match(/```\s*([\s\S]*?)\s*```/i)
      || rawText.match(/\{[\s\S]*\}/);

    if (match) {
      const extracted = JSON.parse(match[1] || match[0]);
      return Array.isArray(extracted) ? extracted : (extracted.fills || []);
    }
  }
  throw new Error('No valid JSON fills found in AI output.\nRaw text: ' + rawText.substring(0, 300));
}

function sanitizeFillItem(item) {
  const uid = typeof item.uid === 'string' ? item.uid.trim() : '';
  if (!uid) return null;

  const fill = {
    uid,
    reasoning: typeof item.reasoning === 'string' ? item.reasoning.substring(0, 300) : ''
  };
  if (typeof item.checked === 'boolean') {
    fill.checked = item.checked;
  }
  if (item.value !== undefined && item.value !== null) {
    const strVal = String(item.value);
    fill.value = strVal.length > 5000 ? strVal.substring(0, 5000) : strVal;
  }
  return fill;
}

export function validateAiFills(rawFills, allowedUids = null) {
  if (!Array.isArray(rawFills)) return [];

  const validUidSet = allowedUids ? new Set(allowedUids) : null;
  const seenUids = new Set();
  const sanitized = [];

  for (const item of rawFills) {
    if (!item || typeof item !== 'object') continue;
    const fill = sanitizeFillItem(item);
    if (!fill) continue;

    if (validUidSet && !validUidSet.has(fill.uid)) continue;
    if (seenUids.has(fill.uid)) continue;

    seenUids.add(fill.uid);
    sanitized.push(fill);
  }

  return sanitized;
}
