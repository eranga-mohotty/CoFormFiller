/**
 * Empirical Challenger Test Suite for Wave 4
 * Focus: Service Worker Lifecycle, Action Badges, Alarms, and Security Boundaries
 * Target files:
 * - src/background/service-worker.ts
 * - src/background/message-handlers.ts
 * - src/background/vault-handlers.ts
 */

import assert from 'node:assert';

// ---------------------------------------------------------------------------
// 1. Setup Chrome Extension API Mocks BEFORE importing Service Worker
// ---------------------------------------------------------------------------

const badgeState = { text: '', color: '', title: '' };
const tabBadgeStates = new Map();
let badgeSetCount = 0;

const actionMock = {
  setBadgeText: async (details) => {
    badgeSetCount++;
    if (details.tabId !== undefined) {
      const s = tabBadgeStates.get(details.tabId) || { text: '', color: '', title: '' };
      s.text = details.text;
      tabBadgeStates.set(details.tabId, s);
    } else {
      badgeState.text = details.text;
    }
  },
  setBadgeBackgroundColor: async (details) => {
    if (details.tabId !== undefined) {
      const s = tabBadgeStates.get(details.tabId) || { text: '', color: '', title: '' };
      s.color = details.color;
      tabBadgeStates.set(details.tabId, s);
    } else {
      badgeState.color = details.color;
    }
  },
  setTitle: async (details) => {
    if (details.tabId !== undefined) {
      const s = tabBadgeStates.get(details.tabId) || { text: '', color: '', title: '' };
      s.title = details.title;
      tabBadgeStates.set(details.tabId, s);
    } else {
      badgeState.title = details.title;
    }
  }
};

const alarmsState = new Map();
const alarmsMock = {
  create: (name, details) => { alarmsState.set(name, details); },
  clear: (name) => { alarmsState.delete(name); },
  onAlarm: { addListener: () => {} }
};

const runtimeMock = {
  onInstalled: { addListener: () => {} },
  onStartup: { addListener: () => {} },
  onMessage: { addListener: () => {} }
};

globalThis.chrome = {
  action: actionMock,
  alarms: alarmsMock,
  runtime: runtimeMock
};

// Track any unhandled rejections to ensure zero unhandled rejections occur
let unhandledRejections = 0;
process.on('unhandledRejection', (reason) => {
  unhandledRejections++;
  console.error('UNHANDLED REJECTION DETECTED:', reason);
});

// ---------------------------------------------------------------------------
// 2. Imports from Source Under Test
// ---------------------------------------------------------------------------

import {
  MSG,
  handleGetStatus,
  handleGetActiveProfile,
  handleLearnField,
  handleSwitchProfile,
  handleTestKey,
  handleRunAiFill
} from '../src/background/message-handlers.ts';

import { handleVaultMessage } from '../src/background/vault-handlers.ts';

import {
  routeMessage,
  handleRuntimeMessage,
  setActionBadge,
  updateActionBadge,
  scheduleVaultAutoLock,
  cancelVaultAutoLock,
  handleAlarm,
  handleInstalled,
  handleStartup,
  initServiceWorkerListeners,
  ALARM_VAULT_AUTOLOCK
} from '../src/background/service-worker.ts';

import {
  saveProfiles,
  setActiveProfileId,
  saveSettings,
  getSettings,
  getFillLogs,
  setupVaultEncryption,
  lockVault,
  unlockVault,
  disableVaultEncryption,
  isVaultEncrypted,
  isVaultLocked
} from '../src/services/storage.ts';

// ---------------------------------------------------------------------------
// 3. Test Runner & Assertions
// ---------------------------------------------------------------------------

let totalTests = 0;
let passedTests = 0;

function reportTest(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ FAIL: ${name} ${details}`);
    throw new Error(`Test failed: ${name} ${details}`);
  }
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log(' WAVE 4 EMPIRICAL CHALLENGE: LIFECYCLE, BADGES & SECURITY');
  console.log('===============================================================\n');

  // Baseline data setup
  const sampleProfile = {
    id: 'prof_challenger_test',
    name: 'Empirical Challenger Corp',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      businessName: 'Empirical Challenger Corp',
      email: 'challenger@test.com',
      phone: '+61400999888',
      address: { street: '1 Empirical Way', city: 'Sydney', state: 'NSW', postalCode: '2000', country: 'Australia' },
      services: ['Security Auditing', 'Stress Testing'],
      openingHours: { monday: { open: '09:00', close: '17:00', closed: false } },
      descriptions: { short: 'High-assurance security testing', full: 'Comprehensive security testing and verification' },
      faqs: [{ question: 'What do you audit?', answer: 'Browser extension security boundaries.' }],
      customFields: []
    }
  };
  await saveProfiles([sampleProfile]);
  await setActiveProfileId(sampleProfile.id);
  await saveSettings({
    geminiApiKey: 'test-challenger-gemini-key',
    aiProvider: 'gemini',
    domainBlacklist: 'blocked-site.com\nphishing-test.org,malicious-bank.net',
    debugLogging: true
  });

  // Ensure clean unencrypted vault state
  try {
    await disableVaultEncryption('any');
  } catch (_e) {
    // Expected if not encrypted yet
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 1: Manifest V3 Async Message Port Protocol
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Manifest V3 Async Message Port Protocol ---');

  // 1.1 Strict synchronous boolean return value across all message topologies
  const testInputs = [
    { name: 'Canonical GET_STATUS', msg: { action: 'GET_STATUS' } },
    { name: 'Legacy SMARTFORM_GET_STATUS', msg: { type: 'SMARTFORM_GET_STATUS' } },
    { name: 'Canonical GET_ACTIVE_PROFILE', msg: { action: 'GET_ACTIVE_PROFILE' } },
    { name: 'Canonical SWITCH_PROFILE', msg: { action: 'SWITCH_PROFILE', payload: { profileId: 'prof_challenger_test' } } },
    { name: 'Canonical RUN_AI_FILL', msg: { action: 'RUN_AI_FILL', payload: { fields: [], url: 'https://example.com' } } },
    { name: 'Vault Message (GET_VAULT_STATUS)', msg: { action: 'GET_VAULT_STATUS' } },
    { name: 'Unknown action string', msg: { action: 'COMPLETELY_UNKNOWN_ACTION_XYZ' } },
    { name: 'Empty message object', msg: {} },
    { name: 'Null message', msg: null },
    { name: 'Undefined message', msg: undefined },
    { name: 'Primitive number', msg: 12345 },
    { name: 'Primitive string', msg: 'not an object' },
    { name: 'Primitive boolean', msg: true },
    {
      name: 'Explosive throwing property getter',
      msg: { get action() { throw new Error('Explosive getter triggered'); } }
    }
  ];

  for (const item of testInputs) {
    let callbackInvokedSync = false;
    const syncReturn = handleRuntimeMessage(
      item.msg,
      { id: 'ext-test-id' },
      () => { callbackInvokedSync = true; }
    );
    reportTest(
      `handleRuntimeMessage returns strict boolean true for: ${item.name}`,
      syncReturn === true && typeof syncReturn === 'boolean'
    );
    reportTest(
      `sendResponse callback is NOT executed synchronously for: ${item.name}`,
      callbackInvokedSync === false
    );
  }

  function dispatchRuntimeMessageAsync(msg, sender = {}) {
    return new Promise((resolve) => {
      handleRuntimeMessage(msg, sender, (resp) => {
        // Small tick to ensure isVaultAction -> updateActionBadge() completes
        setTimeout(() => resolve(resp), 50);
      });
    });
  }

  // 1.2 Async execution delivers response to sendResponse
  const receivedSuccessResponse = await dispatchRuntimeMessageAsync(
    { action: 'GET_STATUS' },
    { url: 'https://allowed-business.com' }
  );

  reportTest(
    'Asynchronous delivery completes to sendResponse callback',
    receivedSuccessResponse !== null
  );
  reportTest(
    'Delivered response contains success: true and data payload',
    receivedSuccessResponse?.success === true &&
    receivedSuccessResponse?.data?.hasApiKey === true &&
    receivedSuccessResponse?.isBlacklisted === false
  );

  // 1.3 Unknown action delivered safely to sendResponse
  const receivedUnknownResponse = await dispatchRuntimeMessageAsync(
    { action: 'NON_EXISTENT_ACTION_404' },
    {}
  );
  reportTest(
    'Unknown action delivers error envelope safely to sendResponse',
    receivedUnknownResponse?.success === false &&
    receivedUnknownResponse?.error?.includes('Unknown action')
  );

  // 1.4 Simulating closed port / throwing sendResponse callback
  let threwException = false;
  try {
    handleRuntimeMessage(
      { action: 'GET_STATUS' },
      {},
      () => { throw new Error('Attempting to use a disconnected port object'); }
    );
    // Also test throwing callback on error route
    handleRuntimeMessage(
      { action: 'UNKNOWN_ACTION_THROWS' },
      {},
      () => { throw new Error('Attempting to use a disconnected port object'); }
    );
    // Also test throwing callback on explosive message
    handleRuntimeMessage(
      { get action() { throw new Error('Getter error on closed port'); } },
      {},
      () => { throw new Error('Attempting to use a disconnected port object'); }
    );
  } catch (err) {
    threwException = true;
    console.error('Unexpected synchronous throw:', err);
  }

  await new Promise((r) => setTimeout(r, 80));
  reportTest(
    'Simulated closed port throwing in sendResponse does not throw synchronously or unhandled rejection',
    threwException === false && unhandledRejections === 0
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 2: Action Badge Reactivity
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Action Badge Reactivity ---');

  // 2.1 Unencrypted vault state -> badge is cleared ('')
  badgeState.text = 'INITIAL';
  badgeState.title = 'INITIAL';
  await updateActionBadge();
  reportTest(
    'Unencrypted vault clears action badge text',
    badgeState.text === ''
  );
  reportTest(
    'Unencrypted vault sets default extension title',
    badgeState.title === 'SmartForm AI'
  );

  // 2.2 Encrypted and Locked vault state -> badge is '🔒', red '#E53E3E'
  const vaultPass = 'ChallengerPass999!';
  await setupVaultEncryption(vaultPass, { autoLockMinutes: 10 });
  await lockVault();

  reportTest('Vault is encrypted', (await isVaultEncrypted()) === true);
  reportTest('Vault is locked', (await isVaultLocked()) === true);

  await updateActionBadge();
  reportTest(
    'Locked vault sets badge text to "🔒"',
    badgeState.text === '🔒'
  );
  reportTest(
    'Locked vault sets badge color to red "#E53E3E"',
    badgeState.color === '#E53E3E'
  );
  reportTest(
    'Locked vault sets descriptive title "SmartForm AI (Vault Locked)"',
    badgeState.title === 'SmartForm AI (Vault Locked)'
  );

  // 2.3 Encrypted and Unlocked vault state -> badge is cleared
  const unlockResult = await unlockVault(vaultPass);
  reportTest('Vault unlocked successfully', unlockResult.success === true);
  reportTest('Vault is no longer locked', (await isVaultLocked()) === false);

  await updateActionBadge();
  reportTest(
    'Unlocked vault clears action badge text to ""',
    badgeState.text === ''
  );
  reportTest(
    'Unlocked vault restores default extension title',
    badgeState.title === 'SmartForm AI'
  );

  // 2.4 Vault message routing reactively triggers updateActionBadge()
  // Test locking via handleRuntimeMessage
  const lockResp = await dispatchRuntimeMessageAsync({ action: 'LOCK_VAULT' });

  reportTest('LOCK_VAULT message resolved', lockResp?.success === true);
  reportTest(
    'LOCK_VAULT message reactively updated badge text to "🔒"',
    badgeState.text === '🔒'
  );
  reportTest(
    'LOCK_VAULT message reactively updated badge color to "#E53E3E"',
    badgeState.color === '#E53E3E'
  );

  // Test unlocking via handleRuntimeMessage
  const unlockResp = await dispatchRuntimeMessageAsync({
    action: 'UNLOCK_VAULT',
    payload: { passphrase: vaultPass }
  });

  reportTest('UNLOCK_VAULT message resolved', unlockResp?.success === true);
  reportTest(
    'UNLOCK_VAULT message reactively cleared badge text',
    badgeState.text === ''
  );

  // Test legacy SMARTFORM_VAULT_LOCK action name
  const legacyLockResp = await dispatchRuntimeMessageAsync({ type: 'SMARTFORM_VAULT_LOCK' });

  reportTest('Legacy SMARTFORM_VAULT_LOCK message resolved', legacyLockResp?.success === true);
  reportTest(
    'Legacy SMARTFORM_VAULT_LOCK reactively updated badge text to "🔒"',
    badgeState.text === '🔒'
  );

  // Test non-vault action does NOT re-trigger badge updates unnecessarily
  const prevBadgeCount = badgeSetCount;
  const statusResp = await dispatchRuntimeMessageAsync({ action: 'GET_STATUS' });
  reportTest('Non-vault action resolves', statusResp?.success === true);
  reportTest(
    'Non-vault action does not trigger updateActionBadge',
    badgeSetCount === prevBadgeCount
  );

  // 2.5 Tab-scoped badge update
  await updateActionBadge(777);
  reportTest(
    'Tab-scoped updateActionBadge(777) isolates badge to tab 777',
    tabBadgeStates.get(777)?.text === '🔒' && tabBadgeStates.get(777)?.color === '#E53E3E'
  );

  // 2.6 Resilience when chrome.action is missing or throws
  const savedAction = globalThis.chrome.action;
  try {
    globalThis.chrome.action = undefined;
    let actionMissingError = false;
    try {
      await updateActionBadge();
      await setActionBadge('🔒');
    } catch (_e) {
      actionMissingError = true;
    }
    reportTest(
      'updateActionBadge and setActionBadge gracefully handle undefined chrome.action',
      actionMissingError === false
    );
  } finally {
    globalThis.chrome.action = savedAction;
  }

  // Restore unlocked state
  await unlockVault(vaultPass);

  // -------------------------------------------------------------------------
  // TEST GROUP 3: Alarms & Background Timers
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Alarms & Background Timers ---');

  // 3.1 scheduleVaultAutoLock and cancelVaultAutoLock
  scheduleVaultAutoLock(25);
  reportTest(
    'scheduleVaultAutoLock(25) sets alarm with delayInMinutes = 25',
    alarmsState.has(ALARM_VAULT_AUTOLOCK) &&
    alarmsState.get(ALARM_VAULT_AUTOLOCK)?.delayInMinutes === 25
  );

  // Setting delay <= 0 clears the alarm
  scheduleVaultAutoLock(0);
  reportTest(
    'scheduleVaultAutoLock(0) clears the auto-lock alarm',
    !alarmsState.has(ALARM_VAULT_AUTOLOCK)
  );

  scheduleVaultAutoLock(-10);
  reportTest(
    'scheduleVaultAutoLock(-10) also clears the auto-lock alarm',
    !alarmsState.has(ALARM_VAULT_AUTOLOCK)
  );

  // Explicit cancelVaultAutoLock
  scheduleVaultAutoLock(60);
  reportTest('scheduleVaultAutoLock(60) scheduled alarm', alarmsState.has(ALARM_VAULT_AUTOLOCK));
  cancelVaultAutoLock();
  reportTest(
    'cancelVaultAutoLock() successfully cancels the scheduled alarm',
    !alarmsState.has(ALARM_VAULT_AUTOLOCK)
  );

  // 3.2 handleAlarm with ALARM_VAULT_AUTOLOCK locks the vault and updates badge
  reportTest('Vault is initially unlocked before alarm', (await isVaultLocked()) === false);
  await handleAlarm({ name: ALARM_VAULT_AUTOLOCK });

  reportTest(
    'handleAlarm(ALARM_VAULT_AUTOLOCK) invokes lockVault()',
    (await isVaultLocked()) === true
  );
  reportTest(
    'handleAlarm(ALARM_VAULT_AUTOLOCK) updates badge to "🔒"',
    badgeState.text === '🔒' && badgeState.color === '#E53E3E'
  );

  // handleAlarm with an unrelated alarm name
  await unlockVault(vaultPass);
  reportTest('Vault unlocked again', (await isVaultLocked()) === false);

  await handleAlarm({ name: 'unrelated_sync_alarm' });
  reportTest(
    'Unrelated alarm name does NOT lock vault',
    (await isVaultLocked()) === false
  );

  // 3.3 Defensive guards when chrome.alarms is undefined
  const savedAlarms = globalThis.chrome.alarms;
  try {
    globalThis.chrome.alarms = undefined;
    let alarmCrash = false;
    try {
      scheduleVaultAutoLock(15);
      cancelVaultAutoLock();
      initServiceWorkerListeners();
    } catch (_e) {
      alarmCrash = true;
    }
    reportTest(
      'scheduleVaultAutoLock, cancelVaultAutoLock, and initServiceWorkerListeners survive undefined chrome.alarms',
      alarmCrash === false
    );
  } finally {
    globalThis.chrome.alarms = savedAlarms;
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 4: Security Boundaries
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Security Boundaries ---');

  // 4.1 Vault Lock Blocking of AI Fills
  // Ensure vault is locked
  await lockVault();
  reportTest('Vault confirmed locked for AI fill test', (await isVaultLocked()) === true);

  // Direct invocation must throw
  let directThrown = false;
  let directErrorMessage = '';
  try {
    await handleRunAiFill({ fields: [], url: 'https://example.com' });
  } catch (err) {
    directThrown = true;
    directErrorMessage = err instanceof Error ? err.message : String(err);
  }
  reportTest(
    'handleRunAiFill strictly throws when vault is locked',
    directThrown === true && directErrorMessage.includes('SmartForm AI Vault is locked')
  );

  // IPC routed invocation must return error response envelope
  const routedLockedAiFill = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], url: 'https://example.com', domain: 'example.com' }
  }, {});
  reportTest(
    'routeMessage(RUN_AI_FILL) returns success: false when vault is locked',
    routedLockedAiFill.success === false &&
    routedLockedAiFill.error?.includes('Vault is locked')
  );

  // Legacy routed invocation
  const legacyLockedAiFill = await routeMessage({
    type: 'SMARTFORM_RUN_AI_FILL',
    fields: [],
    url: 'https://example.com'
  }, {});
  reportTest(
    'routeMessage(SMARTFORM_RUN_AI_FILL) returns success: false when vault is locked',
    legacyLockedAiFill.success === false &&
    legacyLockedAiFill.error?.includes('Vault is locked')
  );

  // Now unlock vault and disable for non-vault tests
  await unlockVault(vaultPass);
  await disableVaultEncryption(vaultPass);
  reportTest('Vault disabled for remaining tests', (await isVaultEncrypted()) === false);

  // 4.2 Blacklist Domain & Subdomain Enforcement
  // Settings blacklist: 'blocked-site.com\nphishing-test.org,malicious-bank.net'
  const blacklistCases = [
    { desc: 'Exact domain match: blocked-site.com', domain: 'blocked-site.com', shouldBlock: true },
    { desc: 'Exact domain match: phishing-test.org', domain: 'phishing-test.org', shouldBlock: true },
    { desc: 'Exact domain match: malicious-bank.net', domain: 'malicious-bank.net', shouldBlock: true },
    { desc: 'Subdomain match: login.blocked-site.com', domain: 'login.blocked-site.com', shouldBlock: true },
    { desc: 'Deep subdomain match: secure.auth.phishing-test.org', domain: 'secure.auth.phishing-test.org', shouldBlock: true },
    { desc: 'Case insensitive domain: BLOCKED-SITE.COM', domain: 'BLOCKED-SITE.COM', shouldBlock: true },
    { desc: 'Case insensitive subdomain: Sub.Malicious-Bank.Net', domain: 'Sub.Malicious-Bank.Net', shouldBlock: true },
    { desc: 'URL fallback when domain empty: https://blocked-site.com/form', domain: '', url: 'https://blocked-site.com/form', shouldBlock: true },
    { desc: 'URL fallback with subdomain: https://sso.phishing-test.org/login', domain: '', url: 'https://sso.phishing-test.org/login', shouldBlock: true },
    // Anti-spoofing / safe domain cases
    { desc: 'Permitted safe domain: safe-domain.com', domain: 'safe-domain.com', shouldBlock: false },
    { desc: 'Substring spoofing defense: notblocked-site.com', domain: 'notblocked-site.com', shouldBlock: false },
    { desc: 'Suffix spoofing defense: blocked-site.company', domain: 'blocked-site.company', shouldBlock: false },
    { desc: 'Parent spoofing defense: phishing-test.org.attacker.com', domain: 'phishing-test.org.attacker.com', shouldBlock: false }
  ];

  for (const tc of blacklistCases) {
    const res = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: { fields: [], domain: tc.domain, url: tc.url }
    }, {});

    if (tc.shouldBlock) {
      reportTest(
        `Blacklist guard: ${tc.desc} is BLOCKED`,
        res.success === false && res.error?.includes('Form filling is disabled on blacklisted domain')
      );
    } else {
      // Allowed domain: should NOT fail with blacklist error
      const notBlacklistError = res.error === undefined || !res.error.includes('blacklisted domain');
      reportTest(
        `Blacklist guard: ${tc.desc} is ALLOWED`,
        notBlacklistError
      );
    }
  }

  // Blacklist check in GET_STATUS
  const statusBlacklistSender = await handleGetStatus({ url: 'https://admin.blocked-site.com/dashboard' });
  reportTest(
    'handleGetStatus detects blacklisted sender url',
    statusBlacklistSender.data?.isBlacklisted === true
  );

  const statusSafeSender = await handleGetStatus({ url: 'https://trusted-site.com/form' });
  reportTest(
    'handleGetStatus allows trusted sender url',
    statusSafeSender.data?.isBlacklisted === false
  );

  // 4.3 URL Sanitization in Fill Log Recording
  // Mock fetch to simulate successful AI provider response
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify([{ uid: 'field_email', value: 'challenger@test.com' }]) }]
          }
        }
      ]
    })
  });

  try {
    const sensitiveUrl = 'https://portal.bank.com/apply/loan?user_id=usr_998811&session_token=secret_xyz123#step3-credit-check';
    const fillResp = await handleRunAiFill({
      fields: [{ uid: 'field_email', label: 'Email', name: 'email', tag: 'input', type: 'email' }],
      domain: 'portal.bank.com',
      url: sensitiveUrl,
      tier1Count: 1
    });

    reportTest('handleRunAiFill succeeds with mocked AI', fillResp.success === true);

    const logs = await getFillLogs();
    const latestLog = logs[0];

    reportTest(
      'Fill log was recorded in storage',
      latestLog !== undefined && latestLog.domain === 'portal.bank.com'
    );
    reportTest(
      'URL sanitization: Query parameters and token are stripped from log',
      !latestLog.url.includes('session_token') &&
      !latestLog.url.includes('user_id') &&
      !latestLog.url.includes('secret_xyz123')
    );
    reportTest(
      'URL sanitization: Hash fragment is stripped from log',
      !latestLog.url.includes('#step3-credit-check')
    );
    reportTest(
      'URL sanitization: Preserves clean protocol, host, and path',
      latestLog.url === 'https://portal.bank.com/apply/loan'
    );

    // Test sanitization with complex URL topologies
    const complexUrls = [
      {
        raw: 'https://app.io/path?a=1?b=2&c=3#frag1#frag2',
        expected: 'https://app.io/path'
      },
      {
        raw: 'https://app.io/simple/clean',
        expected: 'https://app.io/simple/clean'
      },
      {
        raw: '',
        expected: ''
      }
    ];

    for (const cu of complexUrls) {
      await handleRunAiFill({
        fields: [{ uid: 'field_email', label: 'Email', name: 'email', tag: 'input', type: 'email' }],
        domain: 'app.io',
        url: cu.raw,
        tier1Count: 0
      });
      const updatedLogs = await getFillLogs();
      reportTest(
        `URL sanitization handles "${cu.raw}" -> "${cu.expected}"`,
        updatedLogs[0].url === cu.expected
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 5: Lifecycle Hooks
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Lifecycle Hooks ---');

  // 5.1 handleInstalled with reason 'install'
  badgeState.text = 'BEFORE_INSTALL';
  await handleInstalled({ reason: 'install' });
  reportTest(
    'handleInstalled(reason: "install") executes and updates action badge',
    badgeState.text === ''
  );

  // 5.2 handleInstalled with reason 'update'
  await handleInstalled({ reason: 'update', previousVersion: '0.9.8' });
  reportTest(
    'handleInstalled(reason: "update") executes cleanly',
    badgeState.text === ''
  );

  // 5.3 handleInstalled with reason 'chrome_update'
  await handleInstalled({ reason: 'chrome_update' });
  reportTest(
    'handleInstalled(reason: "chrome_update") executes cleanly',
    badgeState.text === ''
  );

  // 5.4 handleStartup
  await handleStartup();
  reportTest(
    'handleStartup executes cleanly and updates action badge',
    badgeState.text === ''
  );

  // -------------------------------------------------------------------------
  // TEST GROUP 6: Adversarial Edge Cases & High-Throughput Concurrency
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Adversarial Edge Cases & Concurrency ---');

  // 6.1 Blacklist formatting stress (tabs, extra spaces, multiple blank lines, consecutive commas)
  await saveSettings({
    domainBlacklist: '  \n\n  custom-block.org \t , , \n   sub.evil-hub.com  \n ',
    aiProvider: 'gemini',
    geminiApiKey: 'test-key'
  });

  const stressBlock1 = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], domain: 'custom-block.org' }
  }, {});
  reportTest(
    'Blacklist with messy formatting blocks custom-block.org',
    stressBlock1.success === false && stressBlock1.error?.includes('blacklisted domain')
  );

  const stressBlock2 = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], domain: 'sub.evil-hub.com' }
  }, {});
  reportTest(
    'Blacklist with messy formatting blocks sub.evil-hub.com',
    stressBlock2.success === false && stressBlock2.error?.includes('blacklisted domain')
  );

  const stressAllowed = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], domain: 'allowed-domain.org' }
  }, {});
  reportTest(
    'Blacklist with messy formatting allows non-matching allowed-domain.org',
    stressAllowed.error === undefined || !stressAllowed.error.includes('blacklisted domain')
  );

  // 6.2 Malformed and non-standard URIs in sender and verifyBlacklist
  const weirdSenders = [
    'javascript:alert(1)',
    'data:text/html,<html>test</html>',
    'chrome-extension://some-random-id/popup.html',
    'not a valid uri at all'
  ];
  for (const senderUri of weirdSenders) {
    const st = await handleGetStatus({ url: senderUri });
    reportTest(
      `handleGetStatus handles non-standard sender URL "${senderUri}" without crashing`,
      st.success === true && st.data?.isBlacklisted === false
    );
  }

  // 6.3 Malformed payloads in handleRunAiFill
  const malformedPayloads = [
    { fields: 'string_not_array', domain: 'test.com', url: 'https://test.com' },
    { fields: null, domain: 'test.com', url: 'https://test.com' },
    { fields: 12345, domain: 'test.com', url: 'https://test.com' },
    { fields: {}, domain: 'test.com', url: 'https://test.com' }
  ];
  for (const mp of malformedPayloads) {
    let mpThrew = false;
    try {
      const res = await routeMessage({ action: 'RUN_AI_FILL', payload: mp }, {});
      reportTest(
        `routeMessage(RUN_AI_FILL) with fields: ${typeof mp.fields} handles payload safely`,
        typeof res.success === 'boolean'
      );
    } catch (_e) {
      mpThrew = true;
    }
    reportTest(`Malformed payload does not throw unhandled exception`, mpThrew === false);
  }

  // 6.4 Prototype pollution and property spoofing in action routing
  const weirdActions = ['__proto__', 'constructor', 'toString', 'valueOf'];
  for (const wa of weirdActions) {
    const waResp = await routeMessage({ action: wa }, {});
    reportTest(
      `routeMessage handles object prototype property action "${wa}" safely`,
      waResp.success === false && waResp.error?.includes(`Unknown action: ${wa}`)
    );
  }

  // 6.5 High-Throughput Concurrent Routing Under Load
  const CONCURRENT_COUNT = 50;
  const concurrentPromises = [];
  const syncReturnValues = [];

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    const p = new Promise((resolve) => {
      const syncVal = handleRuntimeMessage(
        { action: 'GET_STATUS' },
        { url: `https://test-concurrency-${i}.com` },
        (resp) => { resolve(resp); }
      );
      syncReturnValues.push(syncVal);
    });
    concurrentPromises.push(p);
  }

  reportTest(
    `All ${CONCURRENT_COUNT} concurrent messages return true synchronously`,
    syncReturnValues.length === CONCURRENT_COUNT &&
    syncReturnValues.every((v) => v === true && typeof v === 'boolean')
  );

  const concurrentResults = await Promise.all(concurrentPromises);
  reportTest(
    `All ${CONCURRENT_COUNT} concurrent messages deliver successful async responses`,
    concurrentResults.length === CONCURRENT_COUNT &&
    concurrentResults.every((r) => r?.success === true && r?.data?.hasApiKey !== undefined)
  );

  // -------------------------------------------------------------------------
  // FINAL VERIFICATION SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(` EMPIRICAL VERIFICATION COMPLETE: ${passedTests} / ${totalTests} Passed`);
  console.log(` Unhandled Rejections: ${unhandledRejections}`);
  console.log('===============================================================\n');

  assert.strictEqual(unhandledRejections, 0, 'Zero unhandled rejections allowed');
  assert.strictEqual(passedTests, totalTests, 'All empirical tests must pass');
  console.log('✅ ALL WAVE 4 LIFECYCLE, BADGE & SECURITY STRESS TESTS PASSED!\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ EMPIRICAL TEST SUITE FAILED:', err);
  process.exit(1);
});
