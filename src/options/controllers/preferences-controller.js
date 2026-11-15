/**
 * General Preferences & Form Filling Behaviors Controller
 */

import { $, showToast } from './common.js';
import { getSettings, saveSettings } from '../../services/storage.js';

export async function loadPreferencesSettings() {
  const s = await getSettings();

  if ($('prefTier1Enabled')) $('prefTier1Enabled').checked = s.tier1Enabled !== false;
  if ($('prefTier2Enabled')) $('prefTier2Enabled').checked = s.tier2Enabled !== false;
  if ($('prefFillOnlyEmpty')) $('prefFillOnlyEmpty').checked = s.fillOnlyEmptyFields !== false;
  if ($('prefSmartLearningEnabled')) $('prefSmartLearningEnabled').checked = s.smartLearningEnabled !== false;
  if ($('prefDebugLogging')) $('prefDebugLogging').checked = Boolean(s.debugLogging);
  if ($('prefDomainBlacklist')) $('prefDomainBlacklist').value = s.domainBlacklist || '';
  if ($('prefShowFloatingButton')) $('prefShowFloatingButton').checked = s.showFloatingButton !== false;
  if ($('prefFloatingPos')) $('prefFloatingPos').value = s.floatingButtonPosition || 'bottom-right';
  if ($('prefHighlightDuration')) $('prefHighlightDuration').value = s.highlightDuration || 2500;
}

export function initPreferencesController() {
  $('btnSavePreferences')?.addEventListener('click', async () => {
    const updates = {
      tier1Enabled: $('prefTier1Enabled')?.checked,
      tier2Enabled: $('prefTier2Enabled')?.checked,
      fillOnlyEmptyFields: $('prefFillOnlyEmpty')?.checked,
      smartLearningEnabled: $('prefSmartLearningEnabled')?.checked,
      debugLogging: $('prefDebugLogging')?.checked,
      domainBlacklist: $('prefDomainBlacklist')?.value.trim() || '',
      showFloatingButton: $('prefShowFloatingButton')?.checked,
      floatingButtonPosition: $('prefFloatingPos')?.value || 'bottom-right',
      highlightDuration: parseInt($('prefHighlightDuration')?.value, 10) || 2500
    };

    await saveSettings(updates);
    showToast('Preferences saved successfully!');
  });
}
