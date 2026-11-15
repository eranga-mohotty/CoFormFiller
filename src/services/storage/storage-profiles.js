/**
 * Profile CRUD and Active Profile Operations
 */

import {
  STORAGE_KEYS,
  getStorageBackend
} from './storage-base.js';

import {
  isVaultEncrypted,
  isVaultLocked,
  readDecryptedVaultData,
  writeEncryptedVaultData
} from './storage-vault.js';

export async function getProfiles() {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) return [];
    const data = await readDecryptedVaultData();
    return data ? (data.profiles || []) : [];
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.PROFILES], (res) => {
      resolve(res[STORAGE_KEYS.PROFILES] || []);
    });
  });
}

export async function saveProfiles(profiles) {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) {
      throw new Error('Cannot save profiles: SmartForm AI vault is locked.');
    }
    const data = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
    data.profiles = profiles;
    await writeEncryptedVaultData(data);
    return profiles;
  }

  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.PROFILES]: profiles }, () => resolve(profiles));
  });
}

export async function getActiveProfileId() {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (res) => {
      resolve(res[STORAGE_KEYS.ACTIVE_PROFILE_ID] || null);
    });
  });
}

export async function setActiveProfileId(profileId) {
  const storage = getStorageBackend();
  return new Promise((resolve) => {
    storage.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId }, () => resolve(profileId));
  });
}

export async function getActiveProfile() {
  const [profiles, activeId] = await Promise.all([getProfiles(), getActiveProfileId()]);
  if (!profiles || profiles.length === 0) return null;
  const found = profiles.find((p) => p.id === activeId);
  return found || profiles[0];
}

export async function createProfile(name = 'New Profile', initialData = {}) {
  const profiles = await getProfiles();
  const newProfile = {
    id: 'prof_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim() || 'Untitled Profile',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: initialData
  };
  profiles.push(newProfile);
  await saveProfiles(profiles);
  await setActiveProfileId(newProfile.id);
  return newProfile;
}

export async function updateProfile(profileId, updates) {
  const profiles = await getProfiles();
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) return null;

  profiles[index] = {
    ...profiles[index],
    ...updates,
    updatedAt: Date.now()
  };
  await saveProfiles(profiles);
  return profiles[index];
}

export async function deleteProfile(profileId) {
  let profiles = await getProfiles();
  profiles = profiles.filter((p) => p.id !== profileId);
  await saveProfiles(profiles);

  const activeId = await getActiveProfileId();
  if (activeId === profileId) {
    const nextId = profiles.length > 0 ? profiles[0].id : null;
    await setActiveProfileId(nextId);
  }
  return profiles;
}

export async function duplicateProfile(profileId) {
  const profiles = await getProfiles();
  const target = profiles.find((p) => p.id === profileId);
  if (!target) return null;

  const clone = {
    ...JSON.parse(JSON.stringify(target)),
    id: 'prof_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    name: `${target.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  profiles.push(clone);
  await saveProfiles(profiles);
  return clone;
}

function updateOrAddCustomField(customFields, trimmedKey, trimmedVal) {
  const existingIdx = customFields.findIndex(
    (cf) => cf && typeof cf.key === 'string' && cf.key.trim().toLowerCase() === trimmedKey.toLowerCase()
  );
  if (existingIdx !== -1) {
    customFields[existingIdx] = {
      ...customFields[existingIdx],
      value: trimmedVal,
      updatedAt: Date.now()
    };
  } else {
    customFields.push({
      key: trimmedKey,
      value: trimmedVal,
      category: 'learned',
      createdAt: Date.now()
    });
  }
}

export async function saveLearnedFieldToActiveProfile(key, value) {
  if (!key || typeof key !== 'string' || !key.trim()) {
    throw new Error('Valid field key is required');
  }
  if (value === undefined || value === null) {
    throw new Error('Field value is required');
  }

  const active = await getActiveProfile();
  if (!active) {
    throw new Error('No active profile to update');
  }

  const profileData = active.data || {};
  if (!Array.isArray(profileData.customFields)) {
    profileData.customFields = [];
  }

  const trimmedKey = key.trim();
  const trimmedVal = typeof value === 'string' ? value.trim() : String(value);

  updateOrAddCustomField(profileData.customFields, trimmedKey, trimmedVal);
  active.data = profileData;
  active.updatedAt = Date.now();

  await updateProfile(active.id, active);
  return {
    success: true,
    profileId: active.id,
    profileName: active.name,
    key: trimmedKey,
    value: trimmedVal
  };
}
