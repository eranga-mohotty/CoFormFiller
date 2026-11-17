/**
 * Profile CRUD and Active Profile Operations
 */

import { STORAGE_KEYS, getStorageBackend } from './storage-base.js';
import { isVaultEncrypted, isVaultLocked, readDecryptedVaultData, writeEncryptedVaultData } from './storage-vault.js';
import { generateEmptyProfileTemplate } from './storage-template.js';
import type { Profile, CompanyProfile, CustomField, LearnedFieldSaveResult } from '../../types/domain.js';
import type { VaultData } from '../../types/storage.js';

export async function getProfiles(): Promise<Profile[]> {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) return [];
    const data = await readDecryptedVaultData();
    return data ? (data.profiles || []) : [];
  }

  const storage = getStorageBackend();
  return new Promise<Profile[]>((resolve) => {
    storage.get([STORAGE_KEYS.PROFILES], (res) => {
      resolve((res?.[STORAGE_KEYS.PROFILES] as Profile[] | undefined) || []);
    });
  });
}

export async function saveProfiles(profiles: Profile[]): Promise<Profile[]> {
  const encrypted = await isVaultEncrypted();
  if (encrypted) {
    const isLocked = await isVaultLocked();
    if (isLocked) {
      throw new Error('Cannot save profiles: SmartForm AI vault is locked.');
    }
    const data: VaultData = (await readDecryptedVaultData()) || { profiles: [], credentials: {}, logs: [] };
    data.profiles = profiles;
    await writeEncryptedVaultData(data);
    return profiles;
  }

  const storage = getStorageBackend();
  return new Promise<Profile[]>((resolve) => {
    storage.set({ [STORAGE_KEYS.PROFILES]: profiles as unknown as Record<string, unknown> }, () => resolve(profiles));
  });
}

export async function getActiveProfileId(): Promise<string | null> {
  const storage = getStorageBackend();
  return new Promise<string | null>((resolve) => {
    storage.get([STORAGE_KEYS.ACTIVE_PROFILE_ID], (res) => {
      resolve((res?.[STORAGE_KEYS.ACTIVE_PROFILE_ID] as string | undefined) ?? null);
    });
  });
}

export async function setActiveProfileId(profileId: string | null): Promise<string | null> {
  const storage = getStorageBackend();
  return new Promise<string | null>((resolve) => {
    storage.set({ [STORAGE_KEYS.ACTIVE_PROFILE_ID]: profileId as unknown as Record<string, unknown> }, () => resolve(profileId));
  });
}

export async function getActiveProfile(): Promise<Profile | null> {
  const [profiles, activeId] = await Promise.all([getProfiles(), getActiveProfileId()]);
  if (!profiles || profiles.length === 0) return null;
  return profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;
}

export async function createProfile(name: string = 'New Profile', initialData: Partial<CompanyProfile> = {}): Promise<Profile> {
  const profiles = await getProfiles();
  const template = generateEmptyProfileTemplate(name);
  const newProfile: Profile = {
    id: 'prof_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim() || 'Untitled Profile',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: { ...template.data, ...initialData }
  };
  profiles.push(newProfile);
  await saveProfiles(profiles);
  await setActiveProfileId(newProfile.id);
  return newProfile;
}

export async function updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile | null> {
  const profiles = await getProfiles();
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) return null;
  const target = profiles[index];
  if (!target) return null;
  profiles[index] = { ...target, ...updates, updatedAt: Date.now() };
  await saveProfiles(profiles);
  return profiles[index]!;
}

export async function deleteProfile(profileId: string): Promise<Profile[]> {
  const profiles = (await getProfiles()).filter((p) => p.id !== profileId);
  await saveProfiles(profiles);

  const activeId = await getActiveProfileId();
  if (activeId === profileId) {
    const nextId = profiles.length > 0 && profiles[0] ? profiles[0].id : null;
    await setActiveProfileId(nextId);
  }
  return profiles;
}

export async function duplicateProfile(profileId: string): Promise<Profile | null> {
  const profiles = await getProfiles();
  const target = profiles.find((p) => p.id === profileId);
  if (!target) return null;

  const clone: Profile = {
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

function updateOrAddCustomField(customFields: CustomField[], trimmedKey: string, trimmedVal: string): void {
  const existingIdx = customFields.findIndex(
    (cf) => cf && typeof cf.key === 'string' && cf.key.trim().toLowerCase() === trimmedKey.toLowerCase()
  );
  if (existingIdx !== -1) {
    const existing = customFields[existingIdx];
    if (existing) {
      customFields[existingIdx] = { ...existing, value: trimmedVal, updatedAt: Date.now() };
    }
  } else {
    customFields.push({ key: trimmedKey, value: trimmedVal, category: 'learned', createdAt: Date.now() });
  }
}

export async function saveLearnedFieldToActiveProfile(key: string, value: unknown): Promise<LearnedFieldSaveResult> {
  if (!key || typeof key !== 'string' || !key.trim()) throw new Error('Valid field key is required');
  if (value === undefined || value === null) throw new Error('Field value is required');
  const active = await getActiveProfile();
  if (!active) throw new Error('No active profile to update');

  const profileData = active.data || ({} as CompanyProfile);
  if (!Array.isArray(profileData.customFields)) {
    profileData.customFields = [];
  }
  const trimmedKey = key.trim();
  const trimmedVal = typeof value === 'string' ? value.trim() : String(value);

  updateOrAddCustomField(profileData.customFields, trimmedKey, trimmedVal);
  active.data = profileData;
  active.updatedAt = Date.now();
  await updateProfile(active.id, active);
  return { success: true, profileId: active.id, profileName: active.name, key: trimmedKey, value: trimmedVal };
}
