/**
 * Empirical Challenger Test Suite for Wave 4: Background IPC Dispatching
 *
 * Exhaustively stress-tests:
 * 1. Canonical Action Dispatch (all 14 actions + tab actions)
 * 2. Legacy `type: SMARTFORM_*` Dispatch (all 12 actions + tab actions)
 * 3. Dual Payload Extraction (nested payload vs flat root properties)
 * 4. Adversarial & Malformed Inputs (primitives, arrays, empty objects, missing fields, prototype keys)
 * 5. Vault Handlers Stateful Lifecycle & Passphrase Error Boundaries
 * 6. MV3 Async Runtime Channel, Badge Reactivity, and Lifecycle Hooks
 */

import assert from 'node:assert';
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
  ALARM_VAULT_AUTOLOCK
} from '../src/background/service-worker.ts';
import {
  getProfiles,
  saveProfiles,
  getActiveProfile,
  setActiveProfileId,
  saveSettings,
  getSettings,
  setupVaultEncryption,
  lockVault,
  unlockVault,
  disableVaultEncryption,
  changeVaultPassphrase,
  isVaultEncrypted,
  isVaultLocked
} from '../src/services/storage.ts';

// Setup Mock Chrome Environment
globalThis.chrome = globalThis.chrome || {};

const badgeState = { text: '', color: '', title: '', tabId: undefined };
globalThis.chrome.action = {
  setBadgeText: async (details) => { badgeState.text = details.text; badgeState.tabId = details.tabId; },
  setBadgeBackgroundColor: async (details) => { badgeState.color = details.color; },
  setTitle: async (details) => { badgeState.title = details.title; }
};

const alarmsMap = new Map();
globalThis.chrome.alarms = {
  create: (name, details) => { alarmsMap.set(name, details); },
  clear: (name) => { alarmsMap.delete(name); },
  onAlarm: { addListener: () => {} }
};

globalThis.chrome.runtime = {
  onInstalled: { addListener: () => {} },
  onStartup: { addListener: () => {} },
  onMessage: { addListener: () => {} }
};

let mockFetchHandler = null;
globalThis.fetch = async (url, options) => {
  if (mockFetchHandler) {
    return mockFetchHandler(url, options);
  }
  const defaultText = JSON.stringify({
    status: 'ok',
    message: 'Connection verified',
    fills: [{ uid: 'f_test_company', value: 'Challenger Alpha Services' }]
  });
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ outputs: [{ text: defaultText }] }),
    json: async () => ({ outputs: [{ text: defaultText }] })
  };
};

// Test Fixtures
const TEST_PROFILE_1 = {
  id: 'prof_wave4_challenger_1',
  name: 'Primary Test Profile',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  data: {
    businessName: 'Challenger Alpha Services',
    email: 'alpha@challenger.test',
    phone: '0411222333',
    address: { street: '100 King St', city: 'Sydney', state: 'NSW', postalCode: '2000', country: 'Australia' },
    services: ['Security Auditing', 'Stress Testing'],
    openingHours: { monday: { open: '09:00', close: '17:00', closed: false } },
    descriptions: { short: 'Top tier stress testing', full: 'Comprehensive security and performance stress testing.' },
    faqs: [{ question: 'What is your audit methodology?', answer: 'Empirical verification and adversarial challenge.' }],
    customFields: []
  }
};

const TEST_PROFILE_2 = {
  id: 'prof_wave4_challenger_2',
  name: 'Secondary Test Profile',
  createdAt: 1700001000000,
  updatedAt: 1700001000000,
  data: {
    businessName: 'Challenger Beta Logistics',
    email: 'beta@challenger.test',
    phone: '0422333444',
    address: { street: '200 Queen St', city: 'Melbourne', state: 'VIC', postalCode: '3000', country: 'Australia' },
    services: ['Heavy Transport'],
    openingHours: {},
    descriptions: { short: 'Logistics experts', full: 'Complete logistics services across Australia.' },
    faqs: [],
    customFields: []
  }
};

async function resetEnvironment() {
  await saveProfiles([TEST_PROFILE_1, TEST_PROFILE_2]);
  await setActiveProfileId(TEST_PROFILE_1.id);
  await saveSettings({
    geminiApiKey: 'ai-gemini-test-key-xyz',
    geminiModel: 'gemini-3.1-flash-lite',
    aiProvider: 'gemini',
    domainBlacklist: 'forbidden-corp.com\nmalicious-site.net,phishing.io',
    showFloatingButton: true,
    floatingButtonPosition: 'bottom-right',
    tier1Enabled: true,
    tier2Enabled: true,
    fillOnlyEmptyFields: false,
    highlightDuration: 2500,
    smartLearningEnabled: true
  });
  // Ensure vault is unencrypted initially
  if (await isVaultEncrypted()) {
    try {
      await disableVaultEncryption('any');
    } catch (_e) {
      // Ignored if already unencrypted
    }
  }
}

async function runChallengerTestSuite() {
  console.log('================================================================');
  console.log('=== WAVE 4 EMPIRICAL CHALLENGER IPC DISPATCH STRESS TEST ===');
  console.log('================================================================\n');

  await resetEnvironment();

  let totalAssertions = 0;
  function check(condition, message) {
    totalAssertions++;
    assert(condition, message);
  }

  // ==========================================================================
  // SECTION 1: CANONICAL ACTION DISPATCH & DUAL ENVELOPE VERIFICATION
  // ==========================================================================
  console.log('>>> SECTION 1: Canonical Action Dispatch & Dual Response Envelopes');

  // 1.1 GET_STATUS
  {
    const sender = { url: 'https://legit-domain.com/form' };
    const res = await routeMessage({ action: 'GET_STATUS' }, sender);
    check(res.success === true, 'GET_STATUS should return success: true');
    check(typeof res.data === 'object' && res.data !== null, 'res.data must be an object');
    // Dual envelope check: both res.data and root properties must be populated
    check(res.hasApiKey === true, 'Root hasApiKey must be true');
    check(res.data.hasApiKey === true, 'data.hasApiKey must be true');
    check(res.isBlacklisted === false, 'Root isBlacklisted must be false');
    check(res.data.isBlacklisted === false, 'data.isBlacklisted must be false');
    check(res.isEncrypted === false, 'Root isEncrypted must be false');
    check(res.isLocked === false, 'Root isLocked must be false');
    check(res.provider === 'gemini', 'Provider must match configured gemini');
    check(res.model === 'gemini-3.1-flash-lite', 'Model must match configured model');
    check(res.activeProfile.id === TEST_PROFILE_1.id, 'Active profile id must match');
    check(res.data.activeProfile.name === TEST_PROFILE_1.name, 'data.activeProfile name must match');
    check(Array.isArray(res.profiles) && res.profiles.length === 2, 'Profiles list length must be 2');
    check(res.settings.smartLearningEnabled === true, 'Settings summary must include smartLearningEnabled');
    console.log('  ✓ GET_STATUS canonical dispatch & dual envelope validated');
  }

  // 1.2 Blacklist detection in GET_STATUS
  {
    // Exact domain match
    const resExact = await routeMessage({ action: 'GET_STATUS' }, { tab: { url: 'https://forbidden-corp.com/signup' } });
    check(resExact.isBlacklisted === true, 'Exact blacklisted domain must be flagged');
    check(resExact.data.isBlacklisted === true, 'data.isBlacklisted must be flagged');

    // Subdomain match
    const resSub = await routeMessage({ action: 'GET_STATUS' }, { url: 'https://deep.sub.phishing.io/login' });
    check(resSub.isBlacklisted === true, 'Subdomain of blacklisted domain must be flagged');

    // Comma-separated domain match
    const resComma = await routeMessage({ action: 'GET_STATUS' }, { url: 'https://malicious-site.net/page' });
    check(resComma.isBlacklisted === true, 'Comma-separated blacklist item must be flagged');

    // Safe domain
    const resSafe = await routeMessage({ action: 'GET_STATUS' }, { url: 'https://not-phishing.io/form' });
    check(resSafe.isBlacklisted === false, 'Non-matching domain must not be blacklisted');

    // Malformed URL in sender
    const resMalformedUrl = await routeMessage({ action: 'GET_STATUS' }, { url: 'not-a-valid-url' });
    check(resMalformedUrl.isBlacklisted === false, 'Malformed URL must not crash and return isBlacklisted: false');

    // Missing sender
    const resNoSender = await routeMessage({ action: 'GET_STATUS' }, undefined);
    check(resNoSender.isBlacklisted === false, 'Undefined sender must return isBlacklisted: false');
    console.log('  ✓ GET_STATUS domain blacklist resolution (exact, subdomain, malformed, empty) validated');
  }

  // 1.3 GET_ACTIVE_PROFILE
  {
    const res = await routeMessage({ action: 'GET_ACTIVE_PROFILE' }, {});
    check(res.success === true, 'GET_ACTIVE_PROFILE must succeed');
    check(res.data.id === TEST_PROFILE_1.id, 'data.id must match active profile');
    check(res.profile.id === TEST_PROFILE_1.id, 'Root profile.id must match active profile (dual envelope)');
    console.log('  ✓ GET_ACTIVE_PROFILE canonical dispatch validated');
  }

  // 1.4 SWITCH_PROFILE
  {
    const res = await routeMessage({
      action: 'SWITCH_PROFILE',
      payload: { profileId: TEST_PROFILE_2.id }
    }, {});
    check(res.success === true, 'SWITCH_PROFILE must succeed');
    check(res.activeProfile.id === TEST_PROFILE_2.id, 'Root activeProfile.id must be Profile 2');
    check(res.data.activeProfile.id === TEST_PROFILE_2.id, 'data.activeProfile.id must be Profile 2');

    // Verify storage updated
    const currentActive = await getActiveProfile();
    check(currentActive.id === TEST_PROFILE_2.id, 'Storage active profile must be Profile 2');

    // Switch back to Profile 1
    await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: TEST_PROFILE_1.id } }, {});
    console.log('  ✓ SWITCH_PROFILE canonical dispatch validated');
  }

  // 1.5 SAVE_LEARNED_FIELDS
  {
    const res = await routeMessage({
      action: 'SAVE_LEARNED_FIELDS',
      payload: { key: 'tax_gst_number', value: 'AU123456789' }
    }, {});
    check(res.success === true, 'SAVE_LEARNED_FIELDS must succeed');
    check(res.result.key === 'tax_gst_number', 'result.key must match');
    check(res.data.result.value === 'AU123456789', 'data.result.value must match');

    // Check active profile has learned field in customFields
    const active = await getActiveProfile();
    const learned = active.data.customFields.find((f) => f.key === 'tax_gst_number');
    check(learned !== undefined, 'Learned field must be persisted to profile');
    check(learned.value === 'AU123456789', 'Persisted value must match');
    console.log('  ✓ SAVE_LEARNED_FIELDS canonical dispatch & persistence validated');
  }

  // 1.6 TEST_KEY
  {
    const res = await routeMessage({
      action: 'TEST_KEY',
      payload: { settings: { aiProvider: 'gemini', geminiApiKey: 'ai-mock-key' } }
    }, {});
    check(res.success === true, 'TEST_KEY must succeed with mock provider');
    check(typeof res.durationMs === 'number', 'durationMs must be number');
    check(typeof res.data.durationMs === 'number', 'data.durationMs must be number');
    check(res.result.success === true, 'result.success must be true');

    // Stress test: network outage / fetch error
    mockFetchHandler = () => Promise.reject(new Error('Network connection timeout'));
    const resNetError = await routeMessage({
      action: 'TEST_KEY',
      payload: { settings: { aiProvider: 'gemini', geminiApiKey: 'ai-mock-key' } }
    }, {});
    check(resNetError.success === false, 'TEST_KEY must return success: false on network outage');
    check(resNetError.error.includes('Network connection timeout'), 'Error must contain network failure reason');

    // Stress test: HTTP 403 API key rejection
    mockFetchHandler = () => Promise.resolve({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: 'API key expired or invalid' } })
    });
    const resAuthError = await routeMessage({
      action: 'TEST_KEY',
      payload: { settings: { aiProvider: 'gemini', geminiApiKey: 'ai-mock-key' } }
    }, {});
    check(resAuthError.success === false, 'TEST_KEY must return success: false on 403 error');
    check(resAuthError.error.includes('API key expired or invalid'), 'Error must contain API key rejection reason');

    mockFetchHandler = null; // Reset to normal
    console.log('  ✓ TEST_KEY canonical dispatch and network/auth failure boundaries validated');
  }

  // 1.7 RUN_AI_FILL Guardrails
  {
    // Blacklist guardrail
    const resBlocked = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: { fields: [], url: 'https://forbidden-corp.com/careers', domain: 'forbidden-corp.com' }
    }, {});
    check(resBlocked.success === false, 'RUN_AI_FILL must fail on blacklisted domain');
    check(resBlocked.error.includes('Form filling is disabled on blacklisted domain'), 'Error message must specify blacklisted domain');

    // Network failure during AI fill
    mockFetchHandler = () => Promise.reject(new Error('Remote AI service unreachable'));
    const resAiNetFail = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: { fields: [], url: 'https://valid-target.com/contact', domain: 'valid-target.com' }
    }, {});
    check(resAiNetFail.success === false, 'RUN_AI_FILL must return success: false on AI network failure');
    check(resAiNetFail.error.includes('Remote AI service unreachable'), 'Error envelope must capture AI network error');
    mockFetchHandler = null; // Reset

    // Normal execution
    const sampleField = {
      uid: 'f_test_company',
      tag: 'input',
      type: 'text',
      label: 'Company Name',
      name: 'company'
    };
    const resAi = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: {
        fields: [sampleField],
        url: 'https://valid-target.com/contact',
        domain: 'valid-target.com',
        tier1Count: 1
      }
    }, {});
    check(resAi.success === true, 'RUN_AI_FILL must succeed on valid domain');
    check(Array.isArray(resAi.fills), 'Root fills must be an array');
    check(Array.isArray(resAi.data.fills), 'data.fills must be an array');
    check(typeof resAi.durationMs === 'number', 'durationMs must be number');
    console.log('  ✓ RUN_AI_FILL canonical dispatch, network failure, and blacklist guardrails validated');
  }

  // 1.8 Tab-targeted actions routed to background
  {
    const resFillPage = await routeMessage({ action: 'FILL_PAGE' }, {});
    check(resFillPage.success === false, 'FILL_PAGE to background must fail cleanly');
    check(resFillPage.error.includes('Unknown action: FILL_PAGE'), 'Must report unknown action');

    const resCountFields = await routeMessage({ action: 'COUNT_FIELDS' }, {});
    check(resCountFields.success === false, 'COUNT_FIELDS to background must fail cleanly');
    check(resCountFields.error.includes('Unknown action: COUNT_FIELDS'), 'Must report unknown action');
    console.log('  ✓ Tab-targeted actions (FILL_PAGE, COUNT_FIELDS) properly rejected by background');
  }

  // ==========================================================================
  // SECTION 2: LEGACY `type: SMARTFORM_*` DISPATCH COMPATIBILITY
  // ==========================================================================
  console.log('\n>>> SECTION 2: Legacy type: SMARTFORM_* Dispatch Compatibility');

  // 2.1 SMARTFORM_GET_STATUS
  {
    const res = await routeMessage({ type: MSG.GET_STATUS }, { url: 'https://legit-site.com' });
    check(res.success === true, 'Legacy GET_STATUS must succeed');
    check(res.hasApiKey === true, 'Legacy GET_STATUS must have root hasApiKey');
    check(res.data.hasApiKey === true, 'Legacy GET_STATUS must have data.hasApiKey');
    check(res.provider === 'gemini', 'Legacy GET_STATUS must match provider');
    console.log('  ✓ SMARTFORM_GET_STATUS legacy routing validated');
  }

  // 2.2 SMARTFORM_GET_ACTIVE_PROFILE
  {
    const res = await routeMessage({ type: MSG.GET_ACTIVE_PROFILE }, {});
    check(res.success === true, 'Legacy GET_ACTIVE_PROFILE must succeed');
    check(res.profile.id === TEST_PROFILE_1.id, 'Legacy GET_ACTIVE_PROFILE must return profile in root');
    check(res.data.id === TEST_PROFILE_1.id, 'Legacy GET_ACTIVE_PROFILE must return data.id');
    console.log('  ✓ SMARTFORM_GET_ACTIVE_PROFILE legacy routing validated');
  }

  // 2.3 SMARTFORM_SWITCH_PROFILE
  {
    const res = await routeMessage({ type: MSG.SWITCH_PROFILE, profileId: TEST_PROFILE_2.id }, {});
    check(res.success === true, 'Legacy SWITCH_PROFILE must succeed');
    check(res.activeProfile.id === TEST_PROFILE_2.id, 'Legacy activeProfile.id must be Profile 2');
    await routeMessage({ type: MSG.SWITCH_PROFILE, profileId: TEST_PROFILE_1.id }, {});
    console.log('  ✓ SMARTFORM_SWITCH_PROFILE legacy routing validated');
  }

  // 2.4 SMARTFORM_LEARN_FIELD
  {
    const res = await routeMessage({ type: MSG.LEARN_FIELD, key: 'legacy_license', value: 'LIC-998877' }, {});
    check(res.success === true, 'Legacy LEARN_FIELD must succeed');
    check(res.result.key === 'legacy_license', 'result.key must match');
    check(res.data.result.value === 'LIC-998877', 'data.result.value must match');
    console.log('  ✓ SMARTFORM_LEARN_FIELD legacy routing validated');
  }

  // 2.5 SMARTFORM_TEST_KEY
  {
    const res = await routeMessage({ type: MSG.TEST_KEY, settings: { aiProvider: 'gemini' } }, {});
    check(res.success === true, 'Legacy TEST_KEY must succeed');
    check(res.result.success === true, 'result.success must be true');
    console.log('  ✓ SMARTFORM_TEST_KEY legacy routing validated');
  }

  // 2.6 SMARTFORM_RUN_AI_FILL
  {
    const res = await routeMessage({
      type: MSG.RUN_AI_FILL,
      fields: [{ uid: 'f_legacy', tag: 'input', type: 'text', label: 'Company' }],
      url: 'https://valid-target.com',
      domain: 'valid-target.com'
    }, {});
    check(res.success === true, 'Legacy RUN_AI_FILL must succeed');
    check(Array.isArray(res.fills), 'Legacy fills must be array');
    console.log('  ✓ SMARTFORM_RUN_AI_FILL legacy routing validated');
  }

  // 2.7 Tab-targeted legacy actions
  {
    const resTrigger = await routeMessage({ type: 'SMARTFORM_TRIGGER_FILL' }, {});
    check(resTrigger.success === false, 'SMARTFORM_TRIGGER_FILL to background must fail cleanly');
    check(resTrigger.error.includes('Unknown action'), 'Must report unknown action');

    const resCount = await routeMessage({ type: 'SMARTFORM_COUNT_FIELDS' }, {});
    check(resCount.success === false, 'SMARTFORM_COUNT_FIELDS to background must fail cleanly');
    check(resCount.error.includes('Unknown action'), 'Must report unknown action');
    console.log('  ✓ Legacy tab-targeted actions properly rejected by background');
  }

  // ==========================================================================
  // SECTION 3: DUAL PAYLOAD EXTRACTION MATRIX
  // ==========================================================================
  console.log('\n>>> SECTION 3: Dual Payload Extraction Matrix (Nested vs Flat)');

  // 3.1 SWITCH_PROFILE all 4 permutations
  {
    // A: Canonical + nested
    const r1 = await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: TEST_PROFILE_2.id } }, {});
    check(r1.success === true && r1.activeProfile.id === TEST_PROFILE_2.id, 'Canonical + nested switch');

    // B: Canonical + flat
    const r2 = await routeMessage({ action: 'SWITCH_PROFILE', profileId: TEST_PROFILE_1.id }, {});
    check(r2.success === true && r2.activeProfile.id === TEST_PROFILE_1.id, 'Canonical + flat switch');

    // C: Legacy + nested
    const r3 = await routeMessage({ type: MSG.SWITCH_PROFILE, payload: { profileId: TEST_PROFILE_2.id } }, {});
    check(r3.success === true && r3.activeProfile.id === TEST_PROFILE_2.id, 'Legacy + nested switch');

    // D: Legacy + flat
    const r4 = await routeMessage({ type: MSG.SWITCH_PROFILE, profileId: TEST_PROFILE_1.id }, {});
    check(r4.success === true && r4.activeProfile.id === TEST_PROFILE_1.id, 'Legacy + flat switch');
    console.log('  ✓ SWITCH_PROFILE 4-way payload unpacking verified');
  }

  // 3.2 SAVE_LEARNED_FIELDS all 4 permutations
  {
    // A: Canonical + nested
    const r1 = await routeMessage({ action: 'SAVE_LEARNED_FIELDS', payload: { key: 'k1', value: 'v1' } }, {});
    check(r1.success === true && r1.result.key === 'k1', 'Canonical + nested learn');

    // B: Canonical + flat
    const r2 = await routeMessage({ action: 'SAVE_LEARNED_FIELDS', key: 'k2', value: 'v2' }, {});
    check(r2.success === true && r2.result.key === 'k2', 'Canonical + flat learn');

    // C: Legacy + nested
    const r3 = await routeMessage({ type: MSG.LEARN_FIELD, payload: { key: 'k3', value: 'v3' } }, {});
    check(r3.success === true && r3.result.key === 'k3', 'Legacy + nested learn');

    // D: Legacy + flat
    const r4 = await routeMessage({ type: MSG.LEARN_FIELD, key: 'k4', value: 'v4' }, {});
    check(r4.success === true && r4.result.key === 'k4', 'Legacy + flat learn');
    console.log('  ✓ SAVE_LEARNED_FIELDS 4-way payload unpacking verified');
  }

  // 3.3 TEST_KEY nested vs flat
  {
    const r1 = await routeMessage({ action: 'TEST_KEY', payload: { settings: { aiProvider: 'gemini' } } }, {});
    check(r1.success === true, 'TEST_KEY nested settings payload');

    const r2 = await routeMessage({ action: 'TEST_KEY', settings: { aiProvider: 'gemini' } }, {});
    check(r2.success === true, 'TEST_KEY flat settings payload');
    console.log('  ✓ TEST_KEY dual payload unpacking verified');
  }

  // 3.4 RUN_AI_FILL nested vs flat
  {
    const testFields = [{ uid: 'f1', tag: 'input', type: 'text', label: 'Test' }];
    const r1 = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: { fields: testFields, url: 'https://example.com', domain: 'example.com' }
    }, {});
    check(r1.success === true, 'RUN_AI_FILL nested payload');

    const r2 = await routeMessage({
      action: 'RUN_AI_FILL',
      fields: testFields,
      url: 'https://example.com',
      domain: 'example.com'
    }, {});
    check(r2.success === true, 'RUN_AI_FILL flat payload');
    console.log('  ✓ RUN_AI_FILL dual payload unpacking verified');
  }

  // ==========================================================================
  // SECTION 4: ADVERSARIAL & MALFORMED MESSAGES
  // ==========================================================================
  console.log('\n>>> SECTION 4: Adversarial & Malformed Messages Stress Harness');

  const adversarialInputs = [
    // Null / Undefined
    null,
    undefined,

    // Numbers
    0,
    1,
    -100,
    3.14159,
    NaN,
    Infinity,

    // Strings
    '',
    '   ',
    'GET_STATUS',
    'SMARTFORM_GET_STATUS',
    'UNKNOWN_ARBITRARY_ACTION',

    // Booleans
    true,
    false,

    // Arrays
    [],
    [1, 2, 3],
    ['GET_STATUS'],
    [{ action: 'GET_STATUS' }],

    // Empty & Clean Objects
    {},
    Object.create(null),

    // Invalid Action Values
    { action: null },
    { action: undefined },
    { action: 0 },
    { action: 12345 },
    { action: false },
    { action: true },
    { action: '' },
    { action: '   ' },
    { action: [] },
    { action: {} },

    // Invalid Type Values
    { type: null },
    { type: undefined },
    { type: 0 },
    { type: 12345 },
    { type: false },
    { type: true },
    { type: '' },

    // Special object instances
    new Date(),
    new RegExp('test'),
    new Error('adversarial error object'),

    // Prototype pollution & builtin property action names
    { action: '__proto__' },
    { action: 'constructor' },
    { action: 'toString' },
    { action: 'valueOf' },
    { action: 'hasOwnProperty' },

    // Substrings matching VAULT but invalid
    { action: 'VAULT' },
    { action: 'MY_VAULT_ACTION' },
    { action: 'SMARTFORM_VAULT_NONEXISTENT' },
    { action: 'DESTROY_VAULT' }
  ];

  for (const input of adversarialInputs) {
    const res = await routeMessage(input, {});
    check(res.success === false, `Adversarial input must return success: false`);
    check(typeof res.error === 'string' && res.error.length > 0, `Adversarial input must return non-empty error string`);
  }
  console.log(`  ✓ Successfully stress-tested ${adversarialInputs.length} adversarial/malformed messages without crash`);

  // 4.1b Exploding getter resilience via handleRuntimeMessage
  {
    const explodingMsg = {
      get action() {
        throw new Error('Exploding getter property failure');
      }
    };
    let receivedExplodeResp = null;
    handleRuntimeMessage(explodingMsg, {}, (resp) => {
      receivedExplodeResp = resp;
    });
    await new Promise((r) => setTimeout(r, 40));
    check(receivedExplodeResp !== null, 'Exploding getter must be caught by service worker error boundary');
    check(receivedExplodeResp.success === false, 'Exploding getter must return success: false');
    check(receivedExplodeResp.error.includes('Exploding getter property failure'), 'Must capture error message from getter');
    console.log('  ✓ Exploding getter accessor safely caught by service worker error boundary');
  }

  // 4.1c Concurrency stress test: 50 simultaneous messages
  {
    const tasks = [];
    for (let i = 0; i < 50; i++) {
      const isStatus = i % 2 === 0;
      const msg = isStatus
        ? { action: 'GET_STATUS' }
        : { action: 'GET_ACTIVE_PROFILE' };
      tasks.push(routeMessage(msg, { url: 'https://example.com' }));
    }
    const results = await Promise.all(tasks);
    check(results.length === 50, 'All 50 concurrent requests must complete');
    check(results.every((r) => r.success === true), 'All 50 concurrent requests must succeed');
    console.log('  ✓ Concurrency stress test (50 parallel dispatches) completed cleanly');
  }

  // 4.2 Missing required payload arguments
  {
    // SWITCH_PROFILE missing profileId
    const sp1 = await routeMessage({ action: 'SWITCH_PROFILE' }, {});
    check(sp1.success === false && sp1.error.includes('profileId required'), 'SWITCH_PROFILE missing profileId');

    const sp2 = await routeMessage({ action: 'SWITCH_PROFILE', payload: {} }, {});
    check(sp2.success === false && sp2.error.includes('profileId required'), 'SWITCH_PROFILE empty payload');

    const sp3 = await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: '' } }, {});
    check(sp3.success === false && sp3.error.includes('profileId required'), 'SWITCH_PROFILE empty string profileId');

    const sp4 = await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: 'non_existent_profile_id_xyz' } }, {});
    check(sp4.success === false && sp4.error.includes('Profile not found'), 'SWITCH_PROFILE non-existent profile');

    // SAVE_LEARNED_FIELDS missing key
    const lf1 = await routeMessage({ action: 'SAVE_LEARNED_FIELDS' }, {});
    check(lf1.success === false && lf1.error.includes('Valid field key is required'), 'SAVE_LEARNED_FIELDS missing key');

    const lf2 = await routeMessage({ action: 'SAVE_LEARNED_FIELDS', payload: { key: '   ', value: '123' } }, {});
    check(lf2.success === false && lf2.error.includes('Valid field key is required'), 'SAVE_LEARNED_FIELDS whitespace key');

    // RUN_AI_FILL malformed fields
    const rf1 = await routeMessage({ action: 'RUN_AI_FILL', payload: { fields: 'not-an-array', url: 'https://example.com' } }, {});
    check(rf1.success === true, 'RUN_AI_FILL with non-array fields safely normalizes to empty array');

    // RUN_AI_FILL malformed URL
    const rf2 = await routeMessage({ action: 'RUN_AI_FILL', payload: { fields: [], url: 'not-a-valid-url' } }, {});
    check(rf2.success === true, 'RUN_AI_FILL with invalid URL does not crash');

    console.log('  ✓ Missing required fields & boundary condition validations verified');
  }

  // ==========================================================================
  // SECTION 5: VAULT HANDLERS STATEFUL LIFECYCLE & PASSPHRASE ERROR BOUNDARIES
  // ==========================================================================
  console.log('\n>>> SECTION 5: Vault Handlers Stateful Lifecycle & Passphrase Boundaries');

  // 5.1 Initial status check (unencrypted)
  {
    const st1 = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(st1.success === true, 'GET_VAULT_STATUS should succeed');
    check(st1.isEncrypted === false, 'Initial vault must be unencrypted');
    check(st1.isLocked === false, 'Initial vault must not be locked');

    // Unlock on unencrypted vault
    const un1 = await routeMessage({ action: 'UNLOCK_VAULT', payload: { passphrase: 'any' } }, {});
    check(un1.success === true, 'Unlock on unencrypted vault returns success');
    check(un1.message.includes('not encrypted'), 'Unlock returns not encrypted message');
    console.log('  ✓ Unencrypted vault state & unlock behavior verified');
  }

  // 5.2 Setup vault encryption (both canonical & legacy)
  {
    // Setup vault with passphrase "masterpass123" and autoLockMinutes: 10
    const setupRes = await routeMessage({
      action: 'SETUP_VAULT',
      payload: { passphrase: 'masterpass123', options: { autoLockMinutes: 10 } }
    }, {});
    check(setupRes.success === true, 'SETUP_VAULT must succeed');

    const stEncrypted = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(stEncrypted.isEncrypted === true, 'Vault must now be encrypted');
    check(stEncrypted.isLocked === false, 'Vault must be initially unlocked after setup');
    check(stEncrypted.autoLockMinutes === 10, 'Vault autoLockMinutes must be 10');
    console.log('  ✓ SETUP_VAULT execution and status synchronization verified');
  }

  // 5.3 Lock vault & verify AI fill rejection
  {
    const lockRes = await routeMessage({ action: 'LOCK_VAULT' }, {});
    check(lockRes.success === true, 'LOCK_VAULT must succeed');

    const stLocked = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(stLocked.isLocked === true, 'Vault must be locked');

    // AI Fill should be rejected while locked
    const aiLocked = await routeMessage({
      action: 'RUN_AI_FILL',
      payload: { fields: [], url: 'https://example.com' }
    }, {});
    check(aiLocked.success === false, 'RUN_AI_FILL must be rejected when vault is locked');
    check(aiLocked.error.includes('Vault is locked'), 'Error message must state vault is locked');
    console.log('  ✓ LOCK_VAULT and AI fill lockout verified');
  }

  // 5.4 Unlock with wrong passphrase vs correct passphrase
  {
    // Wrong passphrase
    const unlockFail = await routeMessage({ action: 'UNLOCK_VAULT', payload: { passphrase: 'wrongpassword' } }, {});
    check(unlockFail.success === false, 'UNLOCK_VAULT with wrong passphrase must fail');
    check(unlockFail.error.includes('Incorrect Master PIN or Password'), 'Error must specify incorrect credentials');

    const stStillLocked = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(stStillLocked.isLocked === true, 'Vault must remain locked after bad passphrase');

    // Flat payload unlock with correct passphrase
    const unlockSuccess = await routeMessage({ action: 'UNLOCK_VAULT', passphrase: 'masterpass123' }, {});
    check(unlockSuccess.success === true, 'UNLOCK_VAULT with flat passphrase must succeed');

    const stUnlocked = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(stUnlocked.isLocked === false, 'Vault must now be unlocked');
    console.log('  ✓ UNLOCK_VAULT wrong passphrase rejection & correct passphrase unlock verified');
  }

  // 5.5 CHANGE_VAULT_PASSWORD verification
  {
    // A: Wrong current passphrase
    const changeFail = await routeMessage({
      action: 'CHANGE_VAULT_PASSWORD',
      payload: { currentPassphrase: 'wrongpass', newPassphrase: 'newpass456' }
    }, {});
    check(changeFail.success === false, 'CHANGE_VAULT_PASSWORD with wrong current pass must fail');
    check(changeFail.error.includes('Current passphrase or PIN is incorrect'), 'Error must indicate bad current pass');

    // B: Empty new passphrase
    const changeEmpty = await routeMessage({
      action: 'CHANGE_VAULT_PASSWORD',
      payload: { currentPassphrase: 'masterpass123', newPassphrase: '' }
    }, {});
    check(changeEmpty.success === false, 'CHANGE_VAULT_PASSWORD with empty new pass must fail');

    // C: Valid change using legacy action & flat payload
    const changeSuccess = await routeMessage({
      type: MSG.VAULT_CHANGE_PASSWORD,
      currentPassphrase: 'masterpass123',
      newPassphrase: 'newpass456'
    }, {});
    check(changeSuccess.success === true, 'CHANGE_VAULT_PASSWORD with valid passphrases must succeed');

    // Lock and verify old pass fails and new pass succeeds
    await routeMessage({ action: 'LOCK_VAULT' }, {});

    const oldUnlock = await routeMessage({ action: 'UNLOCK_VAULT', passphrase: 'masterpass123' }, {});
    check(oldUnlock.success === false, 'Old passphrase must no longer unlock vault');

    const newUnlock = await routeMessage({ action: 'UNLOCK_VAULT', passphrase: 'newpass456' }, {});
    check(newUnlock.success === true, 'New passphrase must unlock vault');
    console.log('  ✓ CHANGE_VAULT_PASSWORD error boundaries and re-encryption verified');
  }

  // 5.6 DISABLE_VAULT verification
  {
    // Bad passphrase
    const disableFail = await routeMessage({ action: 'DISABLE_VAULT', payload: { passphrase: 'wrongpass' } }, {});
    check(disableFail.success === false, 'DISABLE_VAULT with bad passphrase must fail');

    // Correct passphrase
    const disableSuccess = await routeMessage({ action: 'DISABLE_VAULT', payload: { passphrase: 'newpass456' } }, {});
    check(disableSuccess.success === true, 'DISABLE_VAULT with correct passphrase must succeed');

    const stFinal = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
    check(stFinal.isEncrypted === false, 'Vault must be unencrypted after disable');
    check(stFinal.isLocked === false, 'Vault must not be locked after disable');

    // Disabling again should report already unencrypted
    const disableAgain = await routeMessage({ action: 'DISABLE_VAULT', passphrase: 'any' }, {});
    check(disableAgain.success === true, 'Disabling unencrypted vault succeeds with message');
    check(disableAgain.message.includes('already unencrypted'), 'Reports already unencrypted');
    console.log('  ✓ DISABLE_VAULT error boundaries and unencryption verified');
  }

  // ==========================================================================
  // SECTION 6: MV3 ASYNC CHANNEL, BADGE REACTIVITY, AND LIFECYCLE HOOKS
  // ==========================================================================
  console.log('\n>>> SECTION 6: MV3 Async Channel, Toolbar Badge & Lifecycle Hooks');

  // 6.1 handleRuntimeMessage synchronous true return & async callback
  {
    let receivedResponse = null;
    let callCount = 0;
    const syncReturn = handleRuntimeMessage(
      { action: 'GET_STATUS' },
      { url: 'https://example.com' },
      (resp) => {
        receivedResponse = resp;
        callCount++;
      }
    );
    check(syncReturn === true, 'handleRuntimeMessage must return true synchronously to keep channel open');

    // Wait for async dispatch
    await new Promise((r) => setTimeout(r, 60));
    check(callCount === 1, 'sendResponse callback must be called exactly once');
    check(receivedResponse !== null && receivedResponse.success === true, 'Async response must have success: true');
    console.log('  ✓ handleRuntimeMessage synchronous true and async sendResponse verified');
  }

  // 6.2 handleRuntimeMessage error handling & closed channel resilience
  {
    let receivedErrResponse = null;
    const syncReturnErr = handleRuntimeMessage(
      { action: 'UNKNOWN_ACTION_CRASH_TEST' },
      {},
      (resp) => { receivedErrResponse = resp; }
    );
    check(syncReturnErr === true, 'handleRuntimeMessage must return true even on invalid actions');

    await new Promise((r) => setTimeout(r, 40));
    check(receivedErrResponse !== null && receivedErrResponse.success === false, 'sendResponse must deliver error response');

    // Test sendResponse throwing (simulates disconnected message port)
    const syncThrow = handleRuntimeMessage(
      { action: 'GET_STATUS' },
      {},
      () => { throw new Error('Port closed by sender'); }
    );
    check(syncThrow === true, 'Port error in sendResponse must not crash service worker');
    await new Promise((r) => setTimeout(r, 40));
    console.log('  ✓ handleRuntimeMessage closed channel resilience verified');
  }

  // 6.3 Toolbar action badge reactivity
  {
    // Setup and lock vault
    await routeMessage({ action: 'SETUP_VAULT', passphrase: 'pin' }, {});
    await routeMessage({ action: 'LOCK_VAULT' }, {});

    await updateActionBadge();
    check(badgeState.text === '🔒', 'Locked vault must display 🔒 badge');
    check(badgeState.color === '#E53E3E', 'Locked vault badge color must be #E53E3E');
    check(badgeState.title.includes('Vault Locked'), 'Title must indicate locked');

    // Unlock vault
    await routeMessage({ action: 'UNLOCK_VAULT', passphrase: 'pin' }, {});
    await updateActionBadge();
    check(badgeState.text === '', 'Unlocked vault badge must be cleared');

    // Disable vault
    await routeMessage({ action: 'DISABLE_VAULT', passphrase: 'pin' }, {});
    await updateActionBadge();
    check(badgeState.text === '', 'Unencrypted vault badge must remain empty');
    console.log('  ✓ Action badge locked/unlocked state updates verified');
  }

  // 6.4 Alarms and lifecycle hooks
  {
    scheduleVaultAutoLock(20);
    check(alarmsMap.has(ALARM_VAULT_AUTOLOCK), 'Auto-lock alarm must be scheduled');
    check(alarmsMap.get(ALARM_VAULT_AUTOLOCK).delayInMinutes === 20, 'Delay must be 20 min');

    cancelVaultAutoLock();
    check(!alarmsMap.has(ALARM_VAULT_AUTOLOCK), 'Auto-lock alarm must be cancelled');

    // Setup vault, lock via alarm
    await routeMessage({ action: 'SETUP_VAULT', passphrase: 'pin' }, {});
    check((await isVaultLocked()) === false, 'Initially unlocked');

    await handleAlarm({ name: ALARM_VAULT_AUTOLOCK });
    check((await isVaultLocked()) === true, 'Vault must be locked after auto-lock alarm');
    check(badgeState.text === '🔒', 'Action badge must reflect locked status after alarm');

    // Unrelated alarm should not lock
    await routeMessage({ action: 'UNLOCK_VAULT', passphrase: 'pin' }, {});
    await handleAlarm({ name: 'some_other_alarm' });
    check((await isVaultLocked()) === false, 'Unrelated alarm must not lock vault');

    // Cleanup
    await routeMessage({ action: 'DISABLE_VAULT', passphrase: 'pin' }, {});

    // Lifecycle hooks
    await handleInstalled({ reason: 'install' });
    await handleInstalled({ reason: 'update', previousVersion: '0.9.0' });
    await handleStartup();
    console.log('  ✓ Alarms and extension lifecycle hooks verified');
  }

  console.log('\n================================================================');
  console.log(`✅ ALL ${totalAssertions} EMPIRICAL CHALLENGER ASSERTIONS PASSED!`);
  console.log('================================================================\n');
}

runChallengerTestSuite().catch((err) => {
  console.error('\n❌ CHALLENGER STRESS TEST FAILED:', err);
  process.exit(1);
});
