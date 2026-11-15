/**
 * Universal JSON Importer for SmartForm AI
 */

import {
  getProfiles,
  saveProfiles,
  setActiveProfileId,
  getSettings,
  saveSettings
} from '../services/storage.js';

import {
  isEncryptedExport,
  decryptExportPayload
} from '../services/crypto.js';

import { parseLegacyProfile } from './legacy-importer.js';

export { exportConfiguration } from './exporter.js';

export function detectFormat(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  if (isEncryptedExport(data)) return 'encrypted-vault';
  if (data.local && (data.local.flexibleProfiles || data.local['byok-v2'])) return 'legacy-extension';
  if (data.smartform_version || (Array.isArray(data.profiles) && data.settings)) return 'smartform-native';
  if (Array.isArray(data)) return 'array-of-profiles';
  return 'generic-json';
}

function extractLegacyData(local) {
  const profiles = (local.flexibleProfiles || []).map(parseLegacyProfile);
  const byok = local['byok-v2'] || {};
  const apiKey = typeof byok.google_api_key === 'string' ? byok.google_api_key.trim() : '';
  const model = byok.model || '';
  const match = profiles.find((p) => p.id === local.activeFlexibleProfileId);
  const activeId = match ? match.id : (profiles[0]?.id || null);
  return { profiles, apiKey, model, activeId };
}

function extractGenericProfiles(parsedJson) {
  const keys = Object.keys(parsedJson);
  const looksLikeMap = keys.length > 0 && typeof parsedJson[keys[0]] === 'object' && parsedJson[keys[0]] !== null;
  if (looksLikeMap && (keys[0].includes('profile') || keys[0].includes('cleaner') || keys[0].includes('business'))) {
    return keys.map((k) => ({
      id: 'prof_' + Math.random().toString(36).substring(2, 8),
      name: k,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: parsedJson[k]
    }));
  }
  return [{
    id: 'prof_' + Date.now().toString(36),
    name: parsedJson.businessName || parsedJson.name || 'Imported Knowledge Base',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: parsedJson
  }];
}

function parseProfilesFromData(data, format) {
  if (format === 'legacy-extension') return extractLegacyData(data.local || {});
  if (format === 'smartform-native') {
    return {
      profiles: Array.isArray(data.profiles) ? [...data.profiles] : [],
      apiKey: data.settings?.geminiApiKey || '',
      model: data.settings?.geminiModel || '',
      activeId: data.activeProfileId || null
    };
  }
  if (format === 'array-of-profiles') {
    const profiles = data.filter((item) => item && typeof item === 'object').map((item) => ({
      id: item.id || ('prof_' + Math.random().toString(36).substring(2, 8)),
      name: item.name || 'Imported Profile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: item.data || item
    }));
    return { profiles, apiKey: '', model: '', activeId: profiles[0]?.id || null };
  }
  const profiles = extractGenericProfiles(data);
  return { profiles, apiKey: '', model: '', activeId: profiles[0]?.id || null };
}

async function persistImportedSettings(apiKey, model, mode) {
  if (!apiKey) return;
  const current = await getSettings();
  const updates = {};
  if (!current.geminiApiKey || mode === 'replace') updates.geminiApiKey = apiKey;
  if (model) updates.geminiModel = model.includes('hydrogen') ? 'gemini-4-hydrogen' : 'gemini-3.8-flash';
  if (Object.keys(updates).length > 0) await saveSettings(updates);
}

export async function importConfiguration(input, mode = 'replace', options = {}) {
  let data = null;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || typeof data !== 'object') throw new Error('Data must be an object');
  } catch (err) {
    return { success: false, message: 'Invalid JSON format: ' + err.message };
  }

  let format = detectFormat(data);
  if (format === 'encrypted-vault') {
    if (!options.passphrase) {
      return { success: false, needsPassword: true, formatDetected: 'encrypted-vault', message: 'This configuration backup is encrypted with a master password. Please enter your password to restore.' };
    }
    try {
      data = await decryptExportPayload(data, options.passphrase);
      format = detectFormat(data);
    } catch (err) {
      return { success: false, needsPassword: true, error: 'Decryption failed: ' + err.message, message: 'Incorrect password for encrypted backup.' };
    }
  }

  const { profiles, apiKey, model, activeId } = parseProfilesFromData(data, format);
  if (profiles.length === 0) return { success: false, message: 'Could not extract any profiles from the imported file.' };

  const existing = mode === 'replace' ? [] : await getProfiles();
  const finalProfiles = [...existing, ...profiles];
  await saveProfiles(finalProfiles);

  const preferredId = activeId && finalProfiles.some((p) => p.id === activeId) ? activeId : finalProfiles[0]?.id;
  if (preferredId) await setActiveProfileId(preferredId);
  await persistImportedSettings(apiKey, model, mode);

  const active = finalProfiles.find((p) => p.id === preferredId);
  return {
    success: true,
    formatDetected: format,
    modeApplied: mode,
    profilesImported: profiles.length,
    activeProfileName: active ? active.name : '',
    apiKeyDetected: Boolean(apiKey),
    message: `Successfully imported ${profiles.length} profile(s). Active profile set to: "${active ? active.name : 'None'}".`
  };
}
