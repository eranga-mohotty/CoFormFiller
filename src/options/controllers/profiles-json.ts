/**
 * Raw JSON Profile Editor Handlers
 */

import { $, showToast } from './common.js';
import type { Profile, CompanyProfile } from '../../types/domain.js';

export interface JsonEditorHandlersOptions {
  getCurrentProfile: () => Profile | null;
  onApplyProfile: (profile: Profile) => Promise<void>;
  syncFormToJson: () => void;
}

export function syncJsonTextarea(profile: Profile, data: CompanyProfile): void {
  const nameInput = $<HTMLInputElement>('profProfileName');
  const fullProfile: Profile = {
    ...profile,
    name: nameInput?.value.trim() || profile.name,
    data
  };
  const textarea = $<HTMLTextAreaElement>('rawJsonTextarea');
  if (textarea) textarea.value = JSON.stringify(fullProfile, null, 2);
}

function setupViewToggles(syncFormToJson: () => void): void {
  $('btnViewVisual')?.addEventListener('click', () => {
    $('btnViewVisual')?.classList.add('active');
    $('btnViewJson')?.classList.remove('active');
    $('visualEditorView')?.classList.remove('hidden');
    $('jsonEditorView')?.classList.add('hidden');
  });

  $('btnViewJson')?.addEventListener('click', () => {
    $('btnViewJson')?.classList.add('active');
    $('btnViewVisual')?.classList.remove('active');
    $('jsonEditorView')?.classList.remove('hidden');
    $('visualEditorView')?.classList.add('hidden');
    syncFormToJson();
  });
}

function setupFormatButton(): void {
  $('btnFormatJson')?.addEventListener('click', () => {
    try {
      const textarea = $<HTMLTextAreaElement>('rawJsonTextarea');
      if (!textarea) return;
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      showToast('JSON formatted');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast('Invalid JSON: ' + msg, true);
    }
  });
}

function setupApplyButton(options: JsonEditorHandlersOptions): void {
  $('btnApplyJson')?.addEventListener('click', async () => {
    try {
      const textarea = $<HTMLTextAreaElement>('rawJsonTextarea');
      if (!textarea) return;
      const parsed = JSON.parse(textarea.value) as Partial<Profile>;
      if (!parsed || typeof parsed !== 'object') throw new Error('Root must be an object');
      const cur = options.getCurrentProfile();
      if (!cur) return;
      const updated: Profile = {
        ...cur,
        name: parsed.name || cur.name,
        data: (parsed.data || parsed) as CompanyProfile
      };
      await options.onApplyProfile(updated);
      showToast('JSON applied and profile updated!');
      $('btnViewVisual')?.click();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast('Error applying JSON: ' + msg, true);
    }
  });
}

export function setupJsonViewHandlers(options: JsonEditorHandlersOptions): void {
  setupViewToggles(options.syncFormToJson);
  setupFormatButton();
  setupApplyButton(options);
}
