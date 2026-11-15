/**
 * Content Script for SmartForm AI
 */

import { showToast } from './toast.js';
import { showLearnPrompt } from './learning-card.js';
import { showVaultUnlockPrompt } from './unlock-modal.js';
import {
  ensureFloatingButton,
  setButtonLoading,
  resetFloatingButton,
  removeFloatingButton
} from './floating-button.js';

let extensionStatus = null;
let isFilling = false;

function shouldSkipExecution() {
  const win = /** @type {any} */ (window);
  if (win.__smartform_initialized__) return true;
  win.__smartform_initialized__ = true;

  const isExt = typeof window !== 'undefined' && window.location &&
    (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'moz-extension:');
  return Boolean(isExt && !window.location.pathname.includes('/test-forms/'));
}

async function fetchActiveProfileData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['smartform_profiles', 'smartform_active_profile_id'], (res) => {
      const profiles = /** @type {any[]} */ (res.smartform_profiles || []);
      const activeId = res.smartform_active_profile_id;
      resolve(profiles.find((p) => p.id === activeId) || profiles[0] || null);
    });
  });
}

function attachFieldLearning(info, element, isLearnableField) {
  if (!element || element._sfLearningAttached) return;
  const isCheckable = element.type === 'checkbox' || element.type === 'radio';
  if ((isCheckable && element.checked) || (!isCheckable && element.value && element.value.trim() !== '')) return;
  if (!isLearnableField(info, element)) return;

  element._sfLearningAttached = true;
  const onFill = () => {
    const val = isCheckable ? (element.value !== 'on' ? element.value : 'Yes') : (element.value ? element.value.trim() : '');
    if (!val || val.length > 300 || element._sfLastLearnedValue === val) return;
    const cleanKey = (info.label || info.name || info.id || '').replace(/[*:]/g, '').trim();
    if (cleanKey.length < 2) return;
    element._sfLastLearnedValue = val;

    showLearnPrompt(cleanKey, val, extensionStatus?.activeProfile?.name, async () => {
      const resp = await chrome.runtime.sendMessage({ type: 'SMARTFORM_LEARN_FIELD', key: cleanKey, value: val });
      showToast(resp?.success ? `💡 Saved "${cleanKey}" to profile!` : `⚠️ Could not save field`, resp?.success ? 'success' : 'error', 3000);
    });
  };

  element.addEventListener('change', onFill);
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.addEventListener('blur', onFill);
}

function setupLearningMode(scanned, isLearnableField) {
  scanned.forEach(({ info, element }) => attachFieldLearning(info, element, isLearnableField));
}

async function runTier2(remainingFields, scannedMap, tier1Count, settings, applyFills) {
  if (settings.tier2Enabled === false || remainingFields.length === 0) return 0;
  if (!extensionStatus.hasApiKey) {
    showToast(`⚡ Filled ${tier1Count} fields via Fast Match. (API key needed for remaining ${remainingFields.length})`, 'info', 5000);
    return 0;
  }

  setButtonLoading(`AI Reasoning (${remainingFields.length})...`);
  const aiResp = await chrome.runtime.sendMessage({
    type: 'SMARTFORM_RUN_AI_FILL',
    fields: remainingFields.map((item) => item.info),
    tier1Count,
    url: window.location.href,
    domain: window.location.hostname
  });

  if (!aiResp.success) throw new Error(aiResp.error || 'AI fill failed');
  return applyFills(aiResp.fills || [], scannedMap, { highlightDuration: settings.highlightDuration || 2500 });
}

async function runAutoFillPipeline() {
  if (isFilling) return;
  isFilling = true;
  setButtonLoading('Scanning...');

  try {
    const { scanFormFields, isLearnableField } = await import(chrome.runtime.getURL('src/engine/scanner.js'));
    const { runPatternMatcher } = await import(chrome.runtime.getURL('src/engine/pattern-matcher.js'));
    const { applyFillsToDom } = await import(chrome.runtime.getURL('src/content/inserter.js'));

    extensionStatus = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });
    if (extensionStatus?.isEncrypted && extensionStatus?.isLocked) {
      resetFloatingButton();
      isFilling = false;
      showVaultUnlockPrompt(() => runAutoFillPipeline(), () => showToast('Form fill cancelled (vault locked)', 'info', 2500));
      return;
    }

    const scanned = scanFormFields(document, { fillOnlyEmptyFields: extensionStatus.settings?.fillOnlyEmptyFields !== false });
    if (scanned.length === 0) return showToast('ℹ️ No unfilled form fields detected.', 'info');

    const scannedMap = new Map(scanned.map((item) => [item.info.uid, item]));
    const profileData = (await fetchActiveProfileData())?.data;
    const match = (extensionStatus.settings?.tier1Enabled !== false && profileData)
      ? runPatternMatcher(scanned, profileData)
      : { matchedFills: [], remainingFields: scanned };

    const tier1Count = applyFillsToDom(match.matchedFills, scannedMap, { highlightDuration: extensionStatus.settings?.highlightDuration || 2500 });
    const tier2Count = await runTier2(match.remainingFields, scannedMap, tier1Count, extensionStatus.settings || {}, applyFillsToDom);

    const total = tier1Count + tier2Count;
    showToast(total > 0 ? `✨ SmartForm: Filled ${total} field(s)!` : 'ℹ️ AI found no matching profile information.', total > 0 ? 'success' : 'info', 4000);
    if (extensionStatus.settings?.smartLearningEnabled !== false) setupLearningMode(scanned, isLearnableField);
  } catch (err) {
    showToast(`⚠️ Fill Error: ${err.message}`, 'error', 5000);
  } finally {
    isFilling = false;
    resetFloatingButton();
  }
}

function refreshFloatingButton() {
  if (!extensionStatus?.settings?.showFloatingButton || document.querySelectorAll('input:not([type="hidden"]), textarea, select').length === 0) {
    removeFloatingButton();
    return;
  }
  ensureFloatingButton(() => runAutoFillPipeline(), extensionStatus.settings.floatingButtonPosition || 'bottom-right');
}

(async () => {
  if (shouldSkipExecution()) return;
  try {
    extensionStatus = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });
    if (extensionStatus?.isBlacklisted) return;
  } catch (_e) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'SMARTFORM_TRIGGER_FILL') runAutoFillPipeline().then(() => sendResponse({ success: true }));
    if (message.type === 'SMARTFORM_COUNT_FIELDS') {
      import(chrome.runtime.getURL('src/engine/scanner.js')).then(({ scanFormFields }) => {
        sendResponse({ count: scanFormFields(document, { fillOnlyEmptyFields: false }).length });
      });
      return true;
    }
  });

  refreshFloatingButton();
  new MutationObserver(() => refreshFloatingButton()).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
