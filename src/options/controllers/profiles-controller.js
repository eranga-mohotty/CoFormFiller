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

import { renderServices, renderFaqs, renderCustomFields } from './profiles-collections.js';
import { populateProfileInputs, collectProfileFormData } from './profiles-form.js';

let currentProfile = null;
let currentServices = [];
let currentFaqs = [];
let currentCustomFields = [];

function syncFormToJson() {
  if (!currentProfile) return;
  const data = collectProfileFormData(currentServices, currentFaqs, currentCustomFields);
  const fullProfile = { ...currentProfile, name: $('profProfileName').value || currentProfile.name, data };
  $('rawJsonTextarea').value = JSON.stringify(fullProfile, null, 2);
}

function populateProfile(profile) {
  if (!profile) return;
  currentProfile = profile;
  const d = profile.data || {};

  populateProfileInputs(profile);
  currentServices = Array.isArray(d.services) ? [...d.services] : [];
  renderServices($('serviceTagsList'), currentServices, syncFormToJson);

  currentFaqs = Array.isArray(d.faqs) ? JSON.parse(JSON.stringify(d.faqs)) : [];
  renderFaqs($('faqList'), currentFaqs, syncFormToJson);

  currentCustomFields = Array.isArray(d.customFields) ? JSON.parse(JSON.stringify(d.customFields)) : [];
  renderCustomFields($('customFieldsList'), currentCustomFields, syncFormToJson);

  syncFormToJson();
}

export async function loadProfilesDropdown() {
  const dropdown = $('activeProfileDropdown');
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
  const target = profiles.find((p) => p.id === selectedId) || profiles[0];
  populateProfile(target);
}

function setupJsonViewHandlers() {
  $('btnViewVisual').addEventListener('click', () => {
    $('btnViewVisual').classList.add('active');
    $('btnViewJson').classList.remove('active');
    $('visualEditorView').classList.remove('hidden');
    $('jsonEditorView').classList.add('hidden');
  });

  $('btnViewJson').addEventListener('click', () => {
    $('btnViewJson').classList.add('active');
    $('btnViewVisual').classList.remove('active');
    $('jsonEditorView').classList.remove('hidden');
    $('visualEditorView').classList.add('hidden');
    syncFormToJson();
  });

  $('btnFormatJson').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('rawJsonTextarea').value);
      $('rawJsonTextarea').value = JSON.stringify(parsed, null, 2);
      showToast('JSON formatted');
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, true);
    }
  });

  $('btnApplyJson').addEventListener('click', async () => {
    try {
      const parsed = JSON.parse($('rawJsonTextarea').value);
      if (!parsed || typeof parsed !== 'object') throw new Error('Root must be an object');
      currentProfile = { ...currentProfile, name: parsed.name || currentProfile.name, data: parsed.data || parsed };
      populateProfile(currentProfile);
      await updateProfile(currentProfile.id, currentProfile);
      showToast('JSON applied and profile updated!');
      $('btnViewVisual').click();
    } catch (e) {
      showToast('Error applying JSON: ' + e.message, true);
    }
  });
}

function setupProfileMutations() {
  $('btnNewProfile').addEventListener('click', async () => {
    const tpl = generateEmptyProfileTemplate('New Business Profile');
    const created = await createProfile(tpl.name, tpl.data);
    await loadProfilesDropdown();
    populateProfile(created);
    showToast(`Created "${created.name}"`);
  });

  $('btnDuplicateProfile').addEventListener('click', async () => {
    if (!currentProfile) return;
    const dup = await duplicateProfile(currentProfile.id);
    if (dup) {
      await loadProfilesDropdown();
      populateProfile(dup);
      showToast(`Duplicated to "${dup.name}"`);
    }
  });

  $('btnDeleteProfile').addEventListener('click', async () => {
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

function setupProfileCrudHandlers() {
  $('activeProfileDropdown').addEventListener('change', async () => {
    const selectedId = $('activeProfileDropdown').value;
    await setActiveProfileId(selectedId);
    const profiles = await getProfiles();
    const target = profiles.find((p) => p.id === selectedId);
    if (target) populateProfile(target);
  });

  $('btnSaveProfile').addEventListener('click', async () => {
    if (!currentProfile) return;
    const data = collectProfileFormData(currentServices, currentFaqs, currentCustomFields);
    const updated = await updateProfile(currentProfile.id, { name: $('profProfileName').value.trim() || currentProfile.name, data });
    currentProfile = updated;
    await loadProfilesDropdown();
    showToast(`Saved profile "${updated.name}"!`);
  });

  setupProfileMutations();
}

export function initProfilesController() {
  setupJsonViewHandlers();
  setupProfileCrudHandlers();

  $('profDescShort').addEventListener('input', () => {
    $('shortCharCount').textContent = `${$('profDescShort').value.length} chars`;
  });

  const addTag = () => {
    const val = $('serviceTagInput').value.trim();
    if (val && !currentServices.includes(val)) {
      currentServices.push(val);
      renderServices($('serviceTagsList'), currentServices, syncFormToJson);
      $('serviceTagInput').value = '';
    }
  };
  $('btnAddServiceTag').addEventListener('click', addTag);
  $('serviceTagInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

  $('btnAddFaq').addEventListener('click', () => {
    currentFaqs.push({ q: '', a: '' });
    renderFaqs($('faqList'), currentFaqs, syncFormToJson);
  });

  $('btnAddCustomField').addEventListener('click', () => {
    currentCustomFields.push({ key: '', value: '' });
    renderCustomFields($('customFieldsList'), currentCustomFields, syncFormToJson);
  });
}
