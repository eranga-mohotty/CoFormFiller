/**
 * Content Script for SmartForm AI
 * Main orchestrator for scanning, pattern matching, AI filling, and UI.
 */

import type {
  ExtensionStatusData,
  Profile,
  ScannedElementEntry,
  FillInstruction,
  ApplyFillsOptions,
  StatusSettingsSummary,
  FloatingButtonPosition
} from '../types/index.js';
import { showToast } from './toast.js';
import { showVaultUnlockPrompt } from './unlock-modal.js';
import { setupLearningMode } from './content-learning.js';
import {
  ensureFloatingButton,
  setButtonLoading,
  resetFloatingButton,
  removeFloatingButton
} from './floating-button.js';

type ScannerModule = typeof import('../engine/scanner.js');
type MatcherModule = typeof import('../engine/pattern-matcher.js');
type InserterModule = typeof import('./inserter.js');

let extensionStatus: ExtensionStatusData | null = null;
let isFilling = false;

function shouldSkipExecution(): boolean {
  const win = window as unknown as { __smartform_initialized__?: boolean };
  if (win.__smartform_initialized__) return true;
  win.__smartform_initialized__ = true;

  const isExt = typeof window !== 'undefined' && window.location &&
    (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'moz-extension:');
  return Boolean(isExt && !window.location.pathname.includes('/test-forms/'));
}

async function fetchActiveProfileData(): Promise<Profile | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['smartform_profiles', 'smartform_active_profile_id'], (res) => {
      const profiles = (res.smartform_profiles || []) as Profile[];
      const activeId = res.smartform_active_profile_id as string | undefined;
      resolve(profiles.find((p) => p.id === activeId) || profiles[0] || null);
    });
  });
}

async function runTier2(
  remainingFields: readonly ScannedElementEntry[],
  scannedMap: ReadonlyMap<string, ScannedElementEntry>,
  tier1Count: number,
  settings: StatusSettingsSummary,
  applyFills: (fills: readonly FillInstruction[], map: ReadonlyMap<string, ScannedElementEntry>, options?: ApplyFillsOptions) => number
): Promise<number> {
  if (settings.tier2Enabled === false || remainingFields.length === 0) return 0;
  if (!extensionStatus?.hasApiKey) {
    showToast(`⚡ Filled ${tier1Count} fields via Fast Match. (API key needed for remaining ${remainingFields.length})`, 'info', 5000);
    return 0;
  }

  setButtonLoading(`AI Reasoning (${remainingFields.length})...`);
  const aiResp = (await chrome.runtime.sendMessage({
    action: 'RUN_AI_FILL',
    type: 'SMARTFORM_RUN_AI_FILL',
    fields: remainingFields.map((item) => item.info),
    tier1Count,
    url: window.location.href,
    domain: window.location.hostname
  })) as { success?: boolean; error?: string; fills?: FillInstruction[] } | undefined;

  if (!aiResp?.success) throw new Error(aiResp?.error || 'AI fill failed');
  return applyFills(aiResp.fills || [], scannedMap, { highlightDuration: settings.highlightDuration || 2500 });
}

async function executeFillWorkflow(
  scanner: ScannerModule,
  matcher: MatcherModule,
  inserter: InserterModule
): Promise<void> {
  const scanned = scanner.scanFormFields(document, {
    fillOnlyEmptyFields: extensionStatus?.settings?.fillOnlyEmptyFields !== false
  });
  if (scanned.length === 0) return showToast('ℹ️ No unfilled form fields detected.', 'info');

  const scannedMap = new Map<string, ScannedElementEntry>(
    scanned.map((item) => [item.info.uid, item])
  );
  const profile = await fetchActiveProfileData();
  const profileData = profile?.data;

  const match = (extensionStatus?.settings?.tier1Enabled !== false && profileData)
    ? matcher.runPatternMatcher(scanned, profileData)
    : { matchedFills: [], remainingFields: scanned };

  const duration = extensionStatus?.settings?.highlightDuration || 2500;
  const tier1Count = inserter.applyFillsToDom(match.matchedFills, scannedMap, { highlightDuration: duration });
  const tier2Count = await runTier2(match.remainingFields, scannedMap, tier1Count, extensionStatus?.settings || {}, inserter.applyFillsToDom);

  const total = tier1Count + tier2Count;
  showToast(total > 0 ? `✨ SmartForm: Filled ${total} field(s)!` : 'ℹ️ AI found no matching profile information.', total > 0 ? 'success' : 'info', 4000);
  if (extensionStatus?.settings?.smartLearningEnabled !== false) {
    setupLearningMode(scanned, scanner.isLearnableField, extensionStatus?.activeProfile?.name);
  }
}

async function runAutoFillPipeline(): Promise<void> {
  if (isFilling) return;
  isFilling = true;
  setButtonLoading('Scanning...');

  try {
    const scanner = (await import(chrome.runtime.getURL('src/engine/scanner.js'))) as ScannerModule;
    const matcher = (await import(chrome.runtime.getURL('src/engine/pattern-matcher.js'))) as MatcherModule;
    const inserter = (await import(chrome.runtime.getURL('src/content/inserter.js'))) as InserterModule;

    extensionStatus = (await chrome.runtime.sendMessage({
      action: 'GET_STATUS',
      type: 'SMARTFORM_GET_STATUS'
    })) as ExtensionStatusData;

    if (extensionStatus?.isEncrypted && extensionStatus?.isLocked) {
      resetFloatingButton();
      isFilling = false;
      showVaultUnlockPrompt(
        () => { void runAutoFillPipeline(); },
        () => showToast('Form fill cancelled (vault locked)', 'info', 2500)
      );
      return;
    }

    await executeFillWorkflow(scanner, matcher, inserter);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`⚠️ Fill Error: ${msg}`, 'error', 5000);
  } finally {
    isFilling = false;
    resetFloatingButton();
  }
}

function refreshFloatingButton(): void {
  if (!extensionStatus?.settings?.showFloatingButton || document.querySelectorAll('input:not([type="hidden"]), textarea, select').length === 0) {
    removeFloatingButton();
    return;
  }
  const pos = (extensionStatus.settings.floatingButtonPosition as FloatingButtonPosition) || 'bottom-right';
  ensureFloatingButton(() => { void runAutoFillPipeline(); }, pos);
}

function handleRuntimeMessage(
  message: { type?: string; action?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  const action = message?.action || message?.type;
  if (action === 'SMARTFORM_TRIGGER_FILL' || action === 'FILL_PAGE') {
    void runAutoFillPipeline().then(() => sendResponse({ success: true }));
    return true; // Keep message channel open for async response
  }
  if (action === 'SMARTFORM_COUNT_FIELDS' || action === 'COUNT_FIELDS') {
    void import(chrome.runtime.getURL('src/engine/scanner.js')).then((mod: unknown) => {
      const scanner = mod as ScannerModule;
      sendResponse({ count: scanner.scanFormFields(document, { fillOnlyEmptyFields: false }).length });
    });
    return true; // Keep message channel open for async response
  }
  return false;
}

(async () => {
  if (shouldSkipExecution()) return;
  try {
    extensionStatus = (await chrome.runtime.sendMessage({
      action: 'GET_STATUS',
      type: 'SMARTFORM_GET_STATUS'
    })) as ExtensionStatusData;
    if (extensionStatus?.isBlacklisted) return;
  } catch (_e) {
    return;
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  refreshFloatingButton();
  new MutationObserver(() => refreshFloatingButton()).observe(
    document.body || document.documentElement,
    { childList: true, subtree: true }
  );
})();
