/**
 * General Preferences & Form Filling Behaviors Controller
 */

import { $, showToast } from './common.js';
import { getSettings, saveSettings } from '../../services/storage.js';
import type { AppSettings, FloatingButtonPosition } from '../../types/storage.js';

export async function loadPreferencesSettings(): Promise<void> {
  const s = await getSettings();

  const setCheck = (id: string, val: boolean) => {
    const el = $<HTMLInputElement>(id);
    if (el) el.checked = val;
  };

  setCheck('prefTier1Enabled', s.tier1Enabled !== false);
  setCheck('prefTier2Enabled', s.tier2Enabled !== false);
  setCheck('prefFillOnlyEmpty', s.fillOnlyEmptyFields !== false);
  setCheck('prefSmartLearningEnabled', s.smartLearningEnabled !== false);
  setCheck('prefDebugLogging', Boolean(s.debugLogging));
  setCheck('prefShowFloatingButton', s.showFloatingButton !== false);

  const blacklistEl = $<HTMLTextAreaElement>('prefDomainBlacklist');
  if (blacklistEl) blacklistEl.value = s.domainBlacklist || '';

  const floatPosEl = $<HTMLSelectElement>('prefFloatingPos');
  if (floatPosEl) floatPosEl.value = s.floatingButtonPosition || 'bottom-right';

  const durationEl = $<HTMLInputElement>('prefHighlightDuration');
  if (durationEl) durationEl.value = String(s.highlightDuration || 2500);
}

export function initPreferencesController(): void {
  $('btnSavePreferences')?.addEventListener('click', async () => {
    const updates: Partial<AppSettings> = {
      tier1Enabled: $<HTMLInputElement>('prefTier1Enabled')?.checked ?? true,
      tier2Enabled: $<HTMLInputElement>('prefTier2Enabled')?.checked ?? true,
      fillOnlyEmptyFields: $<HTMLInputElement>('prefFillOnlyEmpty')?.checked ?? true,
      smartLearningEnabled: $<HTMLInputElement>('prefSmartLearningEnabled')?.checked ?? true,
      debugLogging: $<HTMLInputElement>('prefDebugLogging')?.checked ?? false,
      domainBlacklist: $<HTMLTextAreaElement>('prefDomainBlacklist')?.value.trim() || '',
      showFloatingButton: $<HTMLInputElement>('prefShowFloatingButton')?.checked ?? true,
      floatingButtonPosition: ($<HTMLSelectElement>('prefFloatingPos')?.value as FloatingButtonPosition) || 'bottom-right',
      highlightDuration: parseInt($<HTMLInputElement>('prefHighlightDuration')?.value || '2500', 10) || 2500
    };

    await saveSettings(updates);
    showToast('Preferences saved successfully!');
  });
}
