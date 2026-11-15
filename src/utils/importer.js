/**
 * Universal JSON Importer & Exporter for SmartForm AI
 * Supports legacy extension exports, SmartForm native exports, and arbitrary JSON profiles.
 */

import {
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getSettings,
  saveSettings
} from '../services/storage.js';

/**
 * Detect the format of an imported JSON object
 */
export function detectFormat(data) {
  if (!data || typeof data !== 'object') return 'unknown';

  // Legacy format (from user's previous extension)
  if (data.local && (data.local.flexibleProfiles || data.local['byok-v2'])) {
    return 'legacy-extension';
  }

  // SmartForm native format
  if (data.smartform_version || (Array.isArray(data.profiles) && data.settings)) {
    return 'smartform-native';
  }

  // Array of profiles
  if (Array.isArray(data)) {
    return 'array-of-profiles';
  }

  // Generic key-value or profile dictionary
  return 'generic-json';
}

/**
 * Convert legacy flexible profile fields into our rich, schema-agnostic knowledge model
 */
function parseLegacyProfile(legacyProfile) {
  const profileId = legacyProfile.id || ('prof_' + Math.random().toString(36).substring(2, 8));
  const profileName = legacyProfile.name || 'Imported Profile';
  const createdAt = legacyProfile.createdAt ? new Date(legacyProfile.createdAt).getTime() : Date.now();
  const updatedAt = legacyProfile.updatedAt ? new Date(legacyProfile.updatedAt).getTime() : Date.now();

  const rawFields = legacyProfile.fields || {};
  // Handle fields whether they are an object {"0": {...}} or an array [{...}]
  const fieldList = Array.isArray(rawFields) ? rawFields : Object.values(rawFields);

  const parsedData = {
    businessName: '',
    tradingName: '',
    contactName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobile: '',
    website: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    services: [],
    openingHours: {
      monday: { open: '07:00', close: '18:00', closed: false },
      tuesday: { open: '07:00', close: '18:00', closed: false },
      wednesday: { open: '07:00', close: '18:00', closed: false },
      thursday: { open: '07:00', close: '18:00', closed: false },
      friday: { open: '07:00', close: '18:00', closed: false },
      saturday: { open: '08:00', close: '16:00', closed: false },
      sunday: { open: '', close: '', closed: false, onCall24_7: true },
      alwaysOpen: false,
      rawHoursText: ''
    },
    descriptions: {
      short: '',
      full: '',
      tagline: ''
    },
    faqs: [],
    customFields: []
  };

  // Iterate all legacy fields and populate both structured sections and raw custom fields
  for (const f of fieldList) {
    if (!f || typeof f !== 'object') continue;
    const id = String(f.id || '').toLowerCase();
    const name = String(f.name || '').toLowerCase();
    const val = (f.value !== undefined && f.value !== null) ? String(f.value).trim() : '';

    if (!val) {
      if (id.includes('hour') || name.includes('hour')) {
        // empty hour field in user's file
        parsedData.openingHours.rawHoursText = val;
      }
      continue;
    }

    let handled = false;

    // Contact info
    if (id === 'fullname' || name === 'full name') {
      parsedData.contactName = val;
      handled = true;
    } else if (id === 'firstname' || name === 'first name') {
      parsedData.firstName = val;
      handled = true;
    } else if (id === 'lastname' || name === 'last name') {
      parsedData.lastName = val;
      handled = true;
    } else if (id === 'email' || name.includes('email')) {
      parsedData.email = val;
      handled = true;
    } else if (id === 'phone' || id === 'tel' || name.includes('phone') || name.includes('tel')) {
      parsedData.phone = val;
      handled = true;
    } else if (id === 'portfolio' || id === 'website' || name.includes('portfolio') || name.includes('website') || name.includes('url')) {
      parsedData.website = val;
      handled = true;
    }

    // Address
    else if (id === 'address' || name === 'address' || id.includes('street')) {
      parsedData.address.street = val;
      handled = true;
    } else if (id === 'city' || name === 'city' || id === 'suburb') {
      parsedData.address.city = val;
      handled = true;
    } else if (id === 'state' || name === 'state' || id === 'region') {
      parsedData.address.state = val;
      handled = true;
    } else if (id === 'postcode' || id === 'zip' || name.includes('postcode') || name.includes('zip')) {
      parsedData.address.postalCode = val;
      handled = true;
    } else if (id === 'country' || name === 'country') {
      parsedData.address.country = val;
      handled = true;
    }

    // Services provided
    else if (name.includes('services provided') || id.includes('service')) {
      // Split comma separated list into clean tags
      const splitServices = val.split(/,|\n/).map((s) => s.trim()).filter(Boolean);
      parsedData.services = splitServices;
      handled = true;
    }

    // FAQ
    else if (name.includes('faq') || name.includes('frequently asked')) {
      // Parse Q&A pairs (e.g. Q) ... A) ...)
      const qaBlocks = val.split(/(?=Q\))/gi);
      for (const block of qaBlocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^Q\)\s*([\s\S]*?)\s*A\)\s*([\s\S]*)$/i);
        if (match) {
          parsedData.faqs.push({
            q: match[1].trim(),
            a: match[2].trim()
          });
        } else {
          parsedData.faqs.push({
            q: 'General Inquiry',
            a: trimmed
          });
        }
      }
      handled = true;
    }

    // Business description
    else if (id === 'description' || name === 'description' || name.includes('about')) {
      parsedData.descriptions.full = val;
      // Derive short summary if helpful
      if (val.length > 140) {
        const firstSentence = val.split(/\. |\n/)[0];
        parsedData.descriptions.short = firstSentence ? firstSentence.trim() + '.' : val.substring(0, 140);
      } else {
        parsedData.descriptions.short = val;
      }
      handled = true;
    }

    // Hours
    else if (id.includes('hour') || name.includes('hour') || name.includes('open')) {
      parsedData.openingHours.rawHoursText = val;
      handled = true;
    }

    // Always preserve in customFields as key-value for exact AI referencing!
    parsedData.customFields.push({
      key: f.name || f.id || 'Field',
      value: val,
      category: f.category || 'general'
    });
  }

  // Infer business name if not explicitly set
  if (!parsedData.businessName) {
    if (parsedData.website) {
      try {
        const domain = new URL(parsedData.website).hostname.replace('www.', '').split('.')[0];
        parsedData.businessName = domain.charAt(0).toUpperCase() + domain.slice(1);
      } catch (e) {
        parsedData.businessName = profileName;
      }
    } else {
      parsedData.businessName = profileName;
    }
  }

  return {
    id: profileId,
    name: profileName === 'Personal' && parsedData.businessName ? `${parsedData.businessName} Profile` : profileName,
    createdAt,
    updatedAt,
    data: parsedData
  };
}

/**
 * Main Universal Ingestion Function
 * Supports mode: 'replace' (default, completely overwrites) or 'append'
 */
export async function importConfiguration(input, mode = 'replace') {
  let parsedJson = null;
  if (typeof input === 'string') {
    try {
      parsedJson = JSON.parse(input);
    } catch (err) {
      return { success: false, message: 'Invalid JSON format: ' + err.message };
    }
  } else if (typeof input === 'object' && input !== null) {
    parsedJson = input;
  } else {
    return { success: false, message: 'No valid data provided to import.' };
  }

  const format = detectFormat(parsedJson);
  const resultProfiles = [];
  let detectedApiKey = '';
  let detectedModel = '';
  let preferredActiveId = null;

  // 1. Process based on format
  if (format === 'legacy-extension') {
    const local = parsedJson.local || {};
    const flexibleProfiles = local.flexibleProfiles || [];

    for (const lp of flexibleProfiles) {
      const parsed = parseLegacyProfile(lp);
      resultProfiles.push(parsed);
    }

    // Check for API key in byok-v2
    const byok = local['byok-v2'] || {};
    if (byok.google_api_key && typeof byok.google_api_key === 'string' && byok.google_api_key.trim()) {
      detectedApiKey = byok.google_api_key.trim();
    }
    if (byok.model) {
      detectedModel = byok.model;
    }

    // Find best active ID
    const legacyActiveId = local.activeFlexibleProfileId;
    const match = resultProfiles.find((p) => p.id === legacyActiveId);
    if (match) {
      preferredActiveId = match.id;
    } else if (resultProfiles.length > 0) {
      // Pick first with real data
      preferredActiveId = resultProfiles[0].id;
    }
  } else if (format === 'smartform-native') {
    if (Array.isArray(parsedJson.profiles)) {
      resultProfiles.push(...parsedJson.profiles);
    }
    if (parsedJson.activeProfileId) {
      preferredActiveId = parsedJson.activeProfileId;
    }
    if (parsedJson.settings) {
      if (parsedJson.settings.geminiApiKey) {
        detectedApiKey = parsedJson.settings.geminiApiKey;
      }
      if (parsedJson.settings.geminiModel) {
        detectedModel = parsedJson.settings.geminiModel;
      }
    }
  } else if (format === 'array-of-profiles') {
    for (const item of parsedJson) {
      if (item && typeof item === 'object') {
        const id = item.id || ('prof_' + Math.random().toString(36).substring(2, 8));
        const name = item.name || 'Imported Profile';
        resultProfiles.push({
          id,
          name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data: item.data || item
        });
      }
    }
    if (resultProfiles.length > 0) preferredActiveId = resultProfiles[0].id;
  } else {
    // Generic single object or dictionary of profiles
    const keys = Object.keys(parsedJson);
    const looksLikeProfileMap = keys.length > 0 && typeof parsedJson[keys[0]] === 'object' && parsedJson[keys[0]] !== null;

    if (looksLikeProfileMap && (keys[0].includes('profile') || keys[0].includes('cleaner') || keys[0].includes('business'))) {
      for (const k of keys) {
        resultProfiles.push({
          id: 'prof_' + Math.random().toString(36).substring(2, 8),
          name: k,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data: parsedJson[k]
        });
      }
    } else {
      // Single profile
      resultProfiles.push({
        id: 'prof_' + Date.now().toString(36),
        name: parsedJson.businessName || parsedJson.name || 'Imported Knowledge Base',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: parsedJson
      });
    }
    if (resultProfiles.length > 0) preferredActiveId = resultProfiles[0].id;
  }

  if (resultProfiles.length === 0) {
    return { success: false, message: 'Could not extract any profiles from the imported file.' };
  }

  // 2. Apply to storage based on mode
  let finalProfiles = [];
  if (mode === 'replace') {
    finalProfiles = resultProfiles;
  } else {
    // append
    const existing = await getProfiles();
    finalProfiles = [...existing, ...resultProfiles];
  }

  await saveProfiles(finalProfiles);

  if (preferredActiveId && finalProfiles.some((p) => p.id === preferredActiveId)) {
    await setActiveProfileId(preferredActiveId);
  } else if (finalProfiles.length > 0) {
    await setActiveProfileId(finalProfiles[0].id);
  }

  // Update API key and model if detected and currently empty
  if (detectedApiKey) {
    const currentSettings = await getSettings();
    const updates = {};
    if (!currentSettings.geminiApiKey || mode === 'replace') {
      updates.geminiApiKey = detectedApiKey;
    }
    if (detectedModel) {
      updates.geminiModel = detectedModel.includes('hydrogen') ? 'gemini-4-hydrogen' : 'gemini-3.8-flash';
    }
    if (Object.keys(updates).length > 0) {
      await saveSettings(updates);
    }
  }

  const active = finalProfiles.find((p) => p.id === (preferredActiveId || finalProfiles[0]?.id));

  return {
    success: true,
    formatDetected: format,
    modeApplied: mode,
    profilesImported: resultProfiles.length,
    activeProfileName: active ? active.name : '',
    apiKeyDetected: Boolean(detectedApiKey),
    message: `Successfully imported ${resultProfiles.length} profile(s). Active profile set to: "${active ? active.name : 'None'}".`
  };
}

/**
 * Export all profiles and settings to a clean JSON object
 */
export async function exportConfiguration({ includeApiKey = false } = {}) {
  const [profiles, activeProfileId, settings] = await Promise.all([
    getProfiles(),
    getActiveProfileId(),
    getSettings()
  ]);

  const sanitizedSettings = { ...settings };
  if (!includeApiKey) {
    sanitizedSettings.geminiApiKey = '';
  }

  return {
    smartform_version: '1.0.0',
    exportedAt: new Date().toISOString(),
    activeProfileId,
    profiles,
    settings: sanitizedSettings
  };
}
