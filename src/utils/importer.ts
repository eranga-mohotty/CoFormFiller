/**
 * Universal JSON Importer for SmartForm AI
 * Pure TypeScript implementation with zero external runtime dependencies.
 */

import {
  getProfiles,
  saveProfiles,
  setActiveProfileId,
  getSettings,
  saveSettings,
  generateEmptyProfileTemplate
} from '../services/storage.js';

import {
  isEncryptedExport,
  decryptExportPayload
} from '../services/crypto.js';

import { parseLegacyProfile } from './legacy-importer.js';
import type { Profile, CompanyProfile } from '../types/domain.js';
import type { ImportFormat, ImportMode, ImportOptions, ImportResult } from '../types/storage.js';

export { exportConfiguration } from './exporter.js';

interface ExtractedImportData {
  profiles: Profile[];
  apiKey: string;
  model: string;
  activeId: string | null;
}

export function detectFormat(data: unknown): ImportFormat {
  if (!data || typeof data !== 'object') return 'unknown';
  if (Array.isArray(data)) return 'array-of-profiles';
  if (isEncryptedExport(data)) return 'encrypted-vault';

  const obj = data as Record<string, unknown>;
  const local = obj.local as Record<string, unknown> | undefined;
  if (local && typeof local === 'object' && (local.flexibleProfiles || local['byok-v2'])) {
    return 'legacy-extension';
  }
  if (obj.smartform_version || (Array.isArray(obj.profiles) && typeof obj.settings === 'object' && obj.settings !== null)) {
    return 'smartform-native';
  }
  return 'generic-json';
}

function extractLegacyData(local: Record<string, unknown>): ExtractedImportData {
  const rawProfiles = Array.isArray(local.flexibleProfiles) ? local.flexibleProfiles : [];
  const profiles = rawProfiles.map(parseLegacyProfile);
  const byok = typeof local['byok-v2'] === 'object' && local['byok-v2'] !== null
    ? (local['byok-v2'] as Record<string, unknown>)
    : {};
  const apiKey = typeof byok.google_api_key === 'string' ? byok.google_api_key.trim() : '';
  const model = typeof byok.model === 'string' ? byok.model : '';
  const match = profiles.find((p) => p.id === local.activeFlexibleProfileId);
  const activeId = match ? match.id : (profiles[0]?.id || null);
  return { profiles, apiKey, model, activeId };
}

function extractGenericProfiles(parsedJson: Record<string, unknown>): Profile[] {
  const keys = Object.keys(parsedJson);
  const looksLikeMap = keys.length > 0 && typeof parsedJson[keys[0]] === 'object' && parsedJson[keys[0]] !== null;
  if (looksLikeMap && (keys[0].includes('profile') || keys[0].includes('cleaner') || keys[0].includes('business'))) {
    return keys.map((k) => ({
      id: 'prof_' + Math.random().toString(36).substring(2, 8),
      name: k,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: (parsedJson[k] as CompanyProfile) || generateEmptyProfileTemplate(k).data
    }));
  }
  const fallbackName = typeof parsedJson.businessName === 'string'
    ? parsedJson.businessName
    : (typeof parsedJson.name === 'string' ? parsedJson.name : 'Imported Knowledge Base');
  return [{
    id: 'prof_' + Date.now().toString(36),
    name: fallbackName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: (parsedJson as unknown as CompanyProfile) || generateEmptyProfileTemplate(fallbackName).data
  }];
}

function extractNativeProfiles(obj: Record<string, unknown>): ExtractedImportData {
  const rawProfiles = Array.isArray(obj.profiles) ? obj.profiles : [];
  const profiles: Profile[] = rawProfiles
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      id: typeof p.id === 'string' && p.id ? p.id : 'prof_' + Math.random().toString(36).substring(2, 8),
      name: typeof p.name === 'string' && p.name ? p.name : 'Imported Profile',
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      data: (typeof p.data === 'object' && p.data !== null ? p.data : p) as CompanyProfile
    }));
  const settings = typeof obj.settings === 'object' && obj.settings !== null ? (obj.settings as Record<string, unknown>) : {};
  const apiKey = typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey : '';
  const model = typeof settings.geminiModel === 'string' ? settings.geminiModel : '';
  const activeId = typeof obj.activeProfileId === 'string' ? obj.activeProfileId : (profiles[0]?.id || null);
  return { profiles, apiKey, model, activeId };
}

function parseProfilesFromData(data: unknown, format: ImportFormat): ExtractedImportData {
  if (format === 'legacy-extension') {
    const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const local = (typeof obj.local === 'object' && obj.local !== null ? obj.local : {}) as Record<string, unknown>;
    return extractLegacyData(local);
  }
  if (format === 'smartform-native') {
    return extractNativeProfiles((data || {}) as Record<string, unknown>);
  }
  if (format === 'array-of-profiles') {
    const rawList = Array.isArray(data) ? data : [];
    const profiles: Profile[] = rawList.filter((item): item is Record<string, unknown> => item && typeof item === 'object').map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : ('prof_' + Math.random().toString(36).substring(2, 8)),
      name: typeof item.name === 'string' && item.name ? item.name : 'Imported Profile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: (item.data || item) as CompanyProfile
    }));
    return { profiles, apiKey: '', model: '', activeId: profiles[0]?.id || null };
  }
  const profiles = extractGenericProfiles((data || {}) as Record<string, unknown>);
  return { profiles, apiKey: '', model: '', activeId: profiles[0]?.id || null };
}

async function persistImportedSettings(apiKey: string, model: string, mode: ImportMode): Promise<void> {
  if (!apiKey) return;
  const current = await getSettings();
  const updates: Record<string, string> = {};
  if (!current.geminiApiKey || mode === 'replace') updates.geminiApiKey = apiKey;
  if (model) updates.geminiModel = model.includes('hydrogen') ? 'gemini-4-hydrogen' : 'gemini-3.8-flash';
  if (Object.keys(updates).length > 0) await saveSettings(updates);
}

async function resolveImportPayload(data: unknown, options: ImportOptions): Promise<{ data: unknown; format: ImportFormat; errorResult?: ImportResult }> {
  let currentData = data;
  let format = detectFormat(currentData);
  if (format === 'encrypted-vault') {
    if (!options.passphrase) {
      return { data: currentData, format, errorResult: { success: false, needsPassword: true, formatDetected: 'encrypted-vault', message: 'This configuration backup is encrypted with a master password. Please enter your password to restore.' } };
    }
    try {
      currentData = await decryptExportPayload(currentData, options.passphrase);
      format = detectFormat(currentData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: currentData, format, errorResult: { success: false, needsPassword: true, error: 'Decryption failed: ' + msg, message: 'Incorrect password for encrypted backup.' } };
    }
  }
  return { data: currentData, format };
}

function parseJsonInput(input: unknown): unknown {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || typeof data !== 'object') throw new Error('Data must be an object');
  return data;
}

export async function importConfiguration(input: unknown, mode: ImportMode = 'replace', options: ImportOptions = {}): Promise<ImportResult> {
  let parsed: unknown = null;
  try {
    parsed = parseJsonInput(input);
  } catch (err) {
    return { success: false, message: 'Invalid JSON format: ' + (err instanceof Error ? err.message : String(err)) };
  }

  const { data, format, errorResult } = await resolveImportPayload(parsed, options);
  if (errorResult) return errorResult;

  const { profiles, apiKey, model, activeId } = parseProfilesFromData(data, format);
  if (profiles.length === 0) return { success: false, message: 'Could not extract any profiles from the imported file.' };

  const existing = mode === 'replace' ? [] : await getProfiles();
  const finalProfiles = [...existing, ...profiles];
  await saveProfiles(finalProfiles);

  const preferredId = activeId && finalProfiles.some((p) => p.id === activeId) ? activeId : finalProfiles[0]?.id;
  if (preferredId) await setActiveProfileId(preferredId);
  await persistImportedSettings(apiKey, model, mode);

  const active = finalProfiles.find((p) => p.id === preferredId);
  const activeProfileName = active ? active.name : '';
  return {
    success: true, formatDetected: format, modeApplied: mode,
    profilesImported: profiles.length, activeProfileName, apiKeyDetected: Boolean(apiKey),
    message: `Successfully imported ${profiles.length} profile(s). Active profile set to: "${activeProfileName || 'None'}".`
  };
}
