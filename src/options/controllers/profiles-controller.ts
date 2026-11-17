/**
 * Profiles Manager Controller for Options Dashboard
 */

import { $, showToast } from './common.js';
import {
  getProfiles,
  getActiveProfileId,
  setActiveProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  generateEmptyProfileTemplate
} from '../../services/storage.js';
import type { Profile, FaqItem, CustomField } from '../../types/domain.js';
import { renderServices, renderFaqs, renderCustomFields } from './profiles-collections.js';
import { populateProfileInputs, collectProfileFormData } from './profiles-form.js';
import { syncJsonTextarea, setupJsonViewHandlers } from './profiles-json.js';

let currentProfile: Profile | null = null;
let currentServices: string[] = [];
let currentFaqs: FaqItem[] = [];
let currentCustomFields: CustomField[] = [];

function syncFormToJson(): void {
  if (!currentProfile) return;
  const data = collectProfileFormData(currentServices, currentFaqs, currentCustomFields);
  syncJsonTextarea(currentProfile, data);
}

function populateProfile(profile: Profile | null): void {
  if (!profile) return;
  currentProfile = profile;
  const d = profile.data || {};

  populateProfileInputs(profile);
  currentServices = Array.isArray(d.services) ? [...d.services] : [];
  const sList = $('serviceTagsList');
  if (sList) renderServices(sList, currentServices, syncFormToJson);

  currentFaqs = Array.isArray(d.faqs) ? JSON.parse(JSON.stringify(d.faqs)) : [];
  const fList = $('faqList');
  if (fList) renderFaqs(fList, currentFaqs, syncFormToJson);

  currentCustomFields = Array.isArray(d.customFields) ? JSON.parse(JSON.stringify(d.customFields)) : [];
  const cfList = $('customFieldsList');
  if (cfList) renderCustomFields(cfList, currentCustomFields, syncFormToJson);

  syncFormToJson();
}

export async function loadProfilesDropdown(): Promise<void> {
  const dropdown = $<HTMLSelectElement>('activeProfileDropdown');
  if (!dropdown) return;
  dropdown.replaceChildren();

  const profiles = await getProfiles();
  const activeId = await getActiveProfileId();

  if (profiles.length === 0) {
    const initial = await createProfile('My First Profile', generateEmptyProfileTemplate().data);
    profiles.push(initial);
  }

  profiles.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === activeId || (!activeId && p === profiles[0])) opt.selected = true;
    dropdown.appendChild(opt);
  });

  const selectedId = dropdown.value;
  const target = profiles.find((p) => p.id === selectedId) || profiles[0] || null;
  populateProfile(target);
}

function setupProfileMutations(): void {
  $('btnNewProfile')?.addEventListener('click', async () => {
    const tpl = generateEmptyProfileTemplate('New Business Profile');
    const created = await createProfile(tpl.name, tpl.data);
    await loadProfilesDropdown();
    populateProfile(created);
    showToast(`Created "${created.name}"`);
  });

  $('btnDuplicateProfile')?.addEventListener('click', async () => {
    if (!currentProfile) return;
    const dup = await duplicateProfile(currentProfile.id);
    if (dup) {
      await loadProfilesDropdown();
      populateProfile(dup);
      showToast(`Duplicated to "${dup.name}"`);
    }
  });

  $('btnDeleteProfile')?.addEventListener('click', async () => {
    if (!currentProfile) return;
    const profiles = await getProfiles();
    if (profiles.length <= 1) return showToast('Cannot delete the only profile.', true);
    if (confirm(`Are you sure you want to delete "${currentProfile.name}"?`)) {
      await deleteProfile(currentProfile.id);
      await loadProfilesDropdown();
      showToast('Profile deleted');
    }
  });
}

function setupProfileCrudHandlers(): void {
  $('activeProfileDropdown')?.addEventListener('change', async () => {
    const dropdown = $<HTMLSelectElement>('activeProfileDropdown');
    const selectedId = dropdown?.value || '';
    await setActiveProfileId(selectedId);
    const profiles = await getProfiles();
    const target = profiles.find((p) => p.id === selectedId) || null;
    if (target) populateProfile(target);
  });

  $('btnSaveProfile')?.addEventListener('click', async () => {
    if (!currentProfile) return;
    const data = collectProfileFormData(currentServices, currentFaqs, currentCustomFields);
    const nameInput = $<HTMLInputElement>('profProfileName');
    const updated = await updateProfile(currentProfile.id, {
      name: nameInput?.value.trim() || currentProfile.name,
      data
    });
    if (updated) {
      currentProfile = updated;
      await loadProfilesDropdown();
      showToast(`Saved profile "${updated.name}"!`);
    }
  });

  setupProfileMutations();
}

function setupCollectionAddButtons(): void {
  const addTag = () => {
    const input = $<HTMLInputElement>('serviceTagInput');
    const val = input?.value.trim() || '';
    if (val && !currentServices.includes(val)) {
      currentServices.push(val);
      const sList = $('serviceTagsList');
      if (sList) renderServices(sList, currentServices, syncFormToJson);
      if (input) input.value = '';
    }
  };
  $('btnAddServiceTag')?.addEventListener('click', addTag);
  $('serviceTagInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  $('btnAddFaq')?.addEventListener('click', () => {
    currentFaqs.push({ q: '', a: '' });
    const fList = $('faqList');
    if (fList) renderFaqs(fList, currentFaqs, syncFormToJson);
  });

  $('btnAddCustomField')?.addEventListener('click', () => {
    currentCustomFields.push({ key: '', value: '' });
    const cfList = $('customFieldsList');
    if (cfList) renderCustomFields(cfList, currentCustomFields, syncFormToJson);
  });
}

export function initProfilesController(): void {
  setupJsonViewHandlers({
    getCurrentProfile: () => currentProfile,
    onApplyProfile: async (updated) => {
      populateProfile(updated);
      await updateProfile(updated.id, updated);
      await loadProfilesDropdown();
    },
    syncFormToJson
  });
  setupProfileCrudHandlers();

  $('profDescShort')?.addEventListener('input', () => {
    const text = $<HTMLTextAreaElement>('profDescShort')?.value || '';
    const charCount = $('shortCharCount');
    if (charCount) charCount.textContent = `${text.length} chars`;
  });

  setupCollectionAddButtons();
}
