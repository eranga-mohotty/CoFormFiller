/**
 * Options Page Orchestrator for SmartForm AI
 */

import { getSettings } from '../services/storage.js';
import { initTabNavigation, initInterfaceMode } from './controllers/tab-controller.js';
import { initProfilesController, loadProfilesDropdown } from './controllers/profiles-controller.js';
import { initAiController, loadAiSettings, updateProviderPanels, updateOllamaTipVisibility } from './controllers/ai-controller.js';
import { initPreferencesController, loadPreferencesSettings } from './controllers/preferences-controller.js';
import { initVaultController, renderVaultStatus } from './controllers/vault-controller.js';
import { initImportExportController } from './controllers/import-export-controller.js';
import { initLogsController, renderLogsTab } from './controllers/logs-controller.js';

async function refreshAllControllers() {
  await renderVaultStatus();
  await loadProfilesDropdown();
  await loadAiSettings();
  await loadPreferencesSettings();
}

document.addEventListener('DOMContentLoaded', async () => {
  const initialSettings = await getSettings();

  initTabNavigation((tabId) => {
    if (tabId === 'tab-logs') renderLogsTab();
  });

  initInterfaceMode(Boolean(initialSettings.advancedMode), {
    onModeChange: () => updateOllamaTipVisibility(),
    onSimpleModeReset: () => {
      const geminiRadio = /** @type {HTMLInputElement} */ (document.querySelector('input[name="aiProvider"][value="gemini"]'));
      if (geminiRadio) {
        geminiRadio.checked = true;
        updateProviderPanels('gemini');
      }
    }
  });

  initProfilesController();
  initAiController();
  initPreferencesController();
  initVaultController(refreshAllControllers);
  initImportExportController(refreshAllControllers);
  initLogsController();

  await refreshAllControllers();
});
