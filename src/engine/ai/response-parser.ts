/**
 * AI Response Parsers, JSON Extractor, and Schema Whitelist Validator
 * Pure Web Platform APIs with zero runtime dependencies.
 */

import type { FillInstruction } from '../../types/index.js';

function extractFromContent(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string') {
          return (item as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    if (Array.isArray(obj.parts)) {
      return obj.parts
        .map((p: unknown) => (p && typeof p === 'object' && 'text' in p && typeof (p as { text: unknown }).text === 'string' ? (p as { text: string }).text : ''))
        .join('');
    }
    if (typeof obj.text === 'string') return obj.text;
  }
  return '';
}

export function extractInteractionText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.steps)) {
    const combined = record.steps
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
      .map((s) => (s.content ? extractFromContent(s.content) : (typeof s.text === 'string' ? s.text : '')))
      .join('');
    if (combined.trim()) return combined;
  }

  if (Array.isArray(record.outputs)) {
    const combined = record.outputs
      .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
      .map((o) => (typeof o.text === 'string' ? o.text : (o.content ? extractFromContent(o.content) : '')))
      .join('');
    if (combined.trim()) return combined;
  }

  if (Array.isArray(record.candidates) && record.candidates[0] && typeof record.candidates[0] === 'object') {
    const text = extractFromContent((record.candidates[0] as Record<string, unknown>).content);
    if (text.trim()) return text;
  }

  return typeof record.text === 'string' ? record.text : '';
}

export function extractOpenAiOrOllamaText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;

  if (record.message && typeof record.message === 'object' && 'content' in record.message) {
    const content = (record.message as Record<string, unknown>).content;
    if (typeof content === 'string') return content;
  }
  if (Array.isArray(record.choices) && record.choices.length > 0) {
    const first = record.choices[0];
    if (first && typeof first === 'object' && 'message' in first) {
      const msg = (first as Record<string, unknown>).message;
      if (msg && typeof msg === 'object' && 'content' in msg && typeof (msg as Record<string, unknown>).content === 'string') {
        return (msg as { content: string }).content;
      }
    }
  }
  if (typeof record.response === 'string') return record.response;
  return typeof record.text === 'string' ? record.text : '';
}

export function extractClaudeText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    return record.content
      .map((item: unknown) => (item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string' ? (item as { text: string }).text : ''))
      .join('');
  }
  return '';
}

export function resolveJsonPath(obj: unknown, path: string): string {
  if (!path || !obj) return '';
  try {
    const cleanPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
    let current: unknown = obj;
    for (const p of cleanPath.split('.')) {
      if (current === undefined || current === null) return '';
      current = (current as Record<string, unknown>)[p];
    }
    return typeof current === 'string' ? current : (current !== undefined ? JSON.stringify(current) : '');
  } catch (_e) {
    return '';
  }
}

export function parseJsonFills(rawText: string): unknown[] {
  if (!rawText || typeof rawText !== 'string') return [];
  try {
    const direct: unknown = JSON.parse(rawText);
    if (Array.isArray(direct)) return direct;
    if (direct && typeof direct === 'object' && 'fills' in direct && Array.isArray((direct as { fills: unknown }).fills)) {
      return (direct as { fills: unknown[] }).fills;
    }
    return [];
  } catch (_e) {
    const match = rawText.match(/```json\s*([\s\S]*?)\s*```/i)
      || rawText.match(/```\s*([\s\S]*?)\s*```/i)
      || rawText.match(/\{[\s\S]*\}/);

    if (match) {
      const extracted: unknown = JSON.parse(match[1] || match[0]);
      if (Array.isArray(extracted)) return extracted;
      if (extracted && typeof extracted === 'object' && 'fills' in extracted && Array.isArray((extracted as { fills: unknown }).fills)) {
        return (extracted as { fills: unknown[] }).fills;
      }
      return [];
    }
  }
  throw new Error('No valid JSON fills found in AI output.\nRaw text: ' + rawText.substring(0, 300));
}

function sanitizeFillItem(item: unknown): FillInstruction | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;

  const uid = typeof record.uid === 'string' ? record.uid.trim() : '';
  if (!uid) return null;

  const reasoning = typeof record.reasoning === 'string' ? record.reasoning.substring(0, 300) : '';
  const fill: {
    uid: string;
    reasoning: string;
    checked?: boolean;
    value?: string;
  } = {
    uid,
    reasoning
  };

  if (typeof record.checked === 'boolean') {
    fill.checked = record.checked;
  }
  if (record.value !== undefined && record.value !== null) {
    const strVal = String(record.value);
    fill.value = strVal.length > 5000 ? strVal.substring(0, 5000) : strVal;
  }
  return fill;
}

export function validateAiFills(
  rawFills: unknown,
  allowedUids: readonly string[] | Iterable<string> | null = null
): FillInstruction[] {
  if (!Array.isArray(rawFills)) return [];

  const validUidSet = allowedUids ? new Set(allowedUids) : null;
  const seenUids = new Set<string>();
  const sanitized: FillInstruction[] = [];

  for (const item of rawFills) {
    const fill = sanitizeFillItem(item);
    if (!fill) continue;

    if (validUidSet && !validUidSet.has(fill.uid)) continue;
    if (seenUids.has(fill.uid)) continue;

    seenUids.add(fill.uid);
    sanitized.push(fill);
  }

  return sanitized;
}
