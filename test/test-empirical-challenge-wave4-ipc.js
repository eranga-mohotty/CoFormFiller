/**
 * Empirical Challenge Unit Test Suite for Wave 4
 * Verifies Background Service Worker and Message Handlers:
 * - Canonical & legacy action routing
 * - Dual payload extraction
 * - Dual response envelope shapes
 * - Strict null safety & error handling
 * - Vault locks, blacklist enforcement, and lifecycle hooks
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
  setActiveProfileId,
  saveSettings,
  getSettings,
  setupVaultEncryption,
  lockVault,
  unlockVault,
  disableVaultEncryption
} from '../src/services/storage.ts';

// Setup mock chrome API for testing environment
globalThis.chrome = globalThis.chrome || {};
globalThis.chrome.runtime = globalThis.chrome.runtime || {
  onInstalled: { addListener: () => {} },
  onStartup: { addListener: () => {} },
  onMessage: { addListener: () => {} }
};
const badgeState = { text: '', color: '', title: '' };
globalThis.chrome.action = globalThis.chrome.action || {
  setBadgeText: async (details) => { badgeState.text = details.text; },
  setBadgeBackgroundColor: async (details) => { badgeState.color = details.color; },
  setTitle: async (details) => { badgeState.title = details.title; }
};
const alarmsState = new Map();
globalThis.chrome.alarms = globalThis.chrome.alarms || {
  create: (name, details) => { alarmsState.set(name, details); },
  clear: (name) => { alarmsState.delete(name); },
  onAlarm: { addListener: () => {} }
};

async function runTests() {
  console.log('=== WAVE 4 EMPIRICAL CHALLENGE IPC TEST SUITE ===\n');

  // Seed sample profile and reset settings
  const baseProfile = {
    id: 'prof_test_wave4',
    name: 'Wave 4 Test Business',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      businessName: 'Wave 4 Test Cleaning',
      email: 'wave4@test.com',
      phone: '0400123456',
      address: { street: '123 Test St', city: 'Perth', state: 'WA', postalCode: '6000', country: 'Australia' },
      services: ['Commercial Cleaning'],
      openingHours: { monday: { open: '08:00', close: '17:00', closed: false } },
      descriptions: { short: 'Commercial cleaning', full: 'Top commercial cleaning' },
      faqs: [],
      customFields: []
    }
  };
  await saveProfiles([baseProfile]);
  await setActiveProfileId(baseProfile.id);
  await saveSettings({
    geminiApiKey: 'test-gemini-key',
    aiProvider: 'gemini',
    domainBlacklist: 'blocked.com\nmalicious.org'
  });

  // --- TEST 1: Canonical & Legacy Action Routing (handleGetStatus) ---
  console.log('--- TEST 1: Status Action Routing & Dual Envelope ---');
  const resCanonical = await routeMessage({ action: 'GET_STATUS' }, { url: 'https://example.com' });
  assert.strictEqual(resCanonical.success, true);
  assert(resCanonical.data !== undefined, 'Missing res.data in canonical response');
  assert.strictEqual(resCanonical.hasApiKey, true, 'Missing root hasApiKey');
  assert.strictEqual(resCanonical.data.hasApiKey, true, 'Mismatch in data.hasApiKey');
  assert.strictEqual(resCanonical.isBlacklisted, false);
  assert.strictEqual(resCanonical.activeProfile.id, baseProfile.id);

  const resLegacy = await routeMessage({ type: MSG.GET_STATUS }, { url: 'https://example.com' });
  assert.strictEqual(resLegacy.success, true);
  assert.strictEqual(resLegacy.hasApiKey, true);
  assert.strictEqual(resLegacy.data.provider, 'gemini');
  console.log('✓ Canonical GET_STATUS and legacy SMARTFORM_GET_STATUS both resolve with dual envelope');

  // --- TEST 2: Blacklist Detection in GET_STATUS ---
  console.log('\n--- TEST 2: Blacklist Detection ---');
  const resBlacklisted = await routeMessage({ action: 'GET_STATUS' }, { url: 'https://sub.blocked.com/contact' });
  assert.strictEqual(resBlacklisted.isBlacklisted, true);
  assert.strictEqual(resBlacklisted.data.isBlacklisted, true);
  console.log('✓ Blacklist correctly detected from sender URL in handleGetStatus');

  // --- TEST 3: GET_ACTIVE_PROFILE ---
  console.log('\n--- TEST 3: GET_ACTIVE_PROFILE Routing ---');
  const resProfile = await routeMessage({ action: 'GET_ACTIVE_PROFILE' }, {});
  assert.strictEqual(resProfile.success, true);
  assert.strictEqual(resProfile.data.id, baseProfile.id);
  assert.strictEqual(resProfile.profile.id, baseProfile.id);
  console.log('✓ GET_ACTIVE_PROFILE returned active profile in dual envelope');

  // --- TEST 4: SWITCH_PROFILE Dual Payload Extraction ---
  console.log('\n--- TEST 4: SWITCH_PROFILE Dual Payload Extraction ---');
  const profile2 = { ...baseProfile, id: 'prof_test_wave4_2', name: 'Second Profile' };
  await saveProfiles([baseProfile, profile2]);

  // Nested payload
  const resSwitchNested = await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: 'prof_test_wave4_2' } }, {});
  assert.strictEqual(resSwitchNested.success, true);
  assert.strictEqual(resSwitchNested.activeProfile.id, 'prof_test_wave4_2');
  assert.strictEqual(resSwitchNested.data.activeProfile.name, 'Second Profile');

  // Flat payload
  const resSwitchFlat = await routeMessage({ type: MSG.SWITCH_PROFILE, profileId: 'prof_test_wave4' }, {});
  assert.strictEqual(resSwitchFlat.success, true);
  assert.strictEqual(resSwitchFlat.activeProfile.id, 'prof_test_wave4');
  console.log('✓ SWITCH_PROFILE succeeds with both nested payload and flat root profileId');

  // Malformed switch requests
  const resMissingId = await routeMessage({ action: 'SWITCH_PROFILE' }, {});
  assert.strictEqual(resMissingId.success, false);
  assert(resMissingId.error.includes('profileId required'));

  const resNotFoundId = await routeMessage({ action: 'SWITCH_PROFILE', payload: { profileId: 'non_existent_id' } }, {});
  assert.strictEqual(resNotFoundId.success, false);
  assert(resNotFoundId.error.includes('Profile not found'));
  console.log('✓ SWITCH_PROFILE rejects missing profileId and non-existent profileId cleanly without crash');

  // --- TEST 5: SAVE_LEARNED_FIELDS Dual Payload Extraction ---
  console.log('\n--- TEST 5: SAVE_LEARNED_FIELDS Dual Payload Extraction ---');
  // Nested payload
  const resLearnNested = await routeMessage({
    action: 'SAVE_LEARNED_FIELDS',
    payload: { key: 'abn_number', value: '12 345 678 901' }
  }, {});
  assert.strictEqual(resLearnNested.success, true);
  assert.strictEqual(resLearnNested.result.key, 'abn_number');
  assert.strictEqual(resLearnNested.data.result.value, '12 345 678 901');

  // Flat payload
  const resLearnFlat = await routeMessage({
    type: MSG.LEARN_FIELD,
    key: 'tax_number',
    value: '987654321'
  }, {});
  assert.strictEqual(resLearnFlat.success, true);
  assert.strictEqual(resLearnFlat.result.key, 'tax_number');
  console.log('✓ SAVE_LEARNED_FIELDS succeeds with both nested payload and flat key/value');

  // --- TEST 6: Unknown Actions & Malformed Messages ---
  console.log('\n--- TEST 6: Unknown Actions & Malformed Messages ---');
  const resUnknown = await routeMessage({ action: 'UNKNOWN_BOGUS_ACTION' }, {});
  assert.strictEqual(resUnknown.success, false);
  assert(resUnknown.error.includes('Unknown action'));

  const resNull = await routeMessage(null, {});
  assert.strictEqual(resNull.success, false);
  assert.strictEqual(resNull.error, 'Invalid message payload');

  const resNumber = await routeMessage(12345, {});
  assert.strictEqual(resNumber.success, false);
  assert.strictEqual(resNumber.error, 'Invalid message payload');
  console.log('✓ Handled unknown action, null, and primitive payloads safely');

  // --- TEST 7: Vault Operations & Reactive Action Badge ---
  console.log('\n--- TEST 7: Vault Operations & Badge Reactivity ---');
  // Check vault status initially
  const vaultStatus = await routeMessage({ action: 'GET_VAULT_STATUS' }, {});
  assert.strictEqual(vaultStatus.success, true);
  assert.strictEqual(vaultStatus.isEncrypted, false);

  // Setup vault
  const resSetup = await routeMessage({ action: 'SETUP_VAULT', payload: { passphrase: '1234', options: { autoLockMinutes: 15 } } }, {});
  assert.strictEqual(resSetup.success, true);

  // Lock vault
  const resLock = await routeMessage({ action: 'LOCK_VAULT' }, {});
  assert.strictEqual(resLock.success, true);

  await updateActionBadge();
  assert.strictEqual(badgeState.text, '🔒');

  // Run AI fill while vault is locked -> must reject
  const resAiLocked = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], url: 'https://example.com', domain: 'example.com' }
  }, {});
  assert.strictEqual(resAiLocked.success, false);
  assert(resAiLocked.error.includes('Vault is locked'));
  console.log('✓ RUN_AI_FILL safely blocked when vault is locked');

  // Unlock vault
  const resUnlock = await routeMessage({ action: 'UNLOCK_VAULT', payload: { passphrase: '1234' } }, {});
  assert.strictEqual(resUnlock.success, true);

  await updateActionBadge();
  assert.strictEqual(badgeState.text, '');

  // Cleanup: disable encryption
  const resDisable = await routeMessage({ action: 'DISABLE_VAULT', payload: { passphrase: '1234' } }, {});
  assert.strictEqual(resDisable.success, true);
  console.log('✓ Vault lifecycle (setup, lock, unlock, disable) and toolbar badge synchronization verified');

  // --- TEST 8: Blacklist Guardrail on RUN_AI_FILL ---
  console.log('\n--- TEST 8: Blacklist Guardrail on RUN_AI_FILL ---');
  const resBlockedAi = await routeMessage({
    action: 'RUN_AI_FILL',
    payload: { fields: [], domain: 'blocked.com' }
  }, {});
  assert.strictEqual(resBlockedAi.success, false);
  assert(resBlockedAi.error.includes('Form filling is disabled on blacklisted domain'));
  console.log('✓ RUN_AI_FILL throws error on blacklisted domain');

  // --- TEST 9: Async Message Channel (handleRuntimeMessage) ---
  console.log('\n--- TEST 9: MV3 Async Message Channel ---');
  let responseSent = null;
  const syncReturn = handleRuntimeMessage(
    { action: 'GET_STATUS' },
    {},
    (resp) => { responseSent = resp; }
  );
  assert.strictEqual(syncReturn, true, 'handleRuntimeMessage must return true synchronously');

  // Wait for async dispatch
  await new Promise((r) => setTimeout(r, 50));
  assert(responseSent !== null, 'sendResponse was not called asynchronously');
  assert.strictEqual(responseSent.success, true);
  console.log('✓ handleRuntimeMessage returned synchronous true; and executed async sendResponse callback');

  // --- TEST 10: Alarms and Lifecycle Hooks ---
  console.log('\n--- TEST 10: Alarms and Lifecycle Hooks ---');
  scheduleVaultAutoLock(15);
  assert(alarmsState.has(ALARM_VAULT_AUTOLOCK));
  cancelVaultAutoLock();
  assert(!alarmsState.has(ALARM_VAULT_AUTOLOCK));

  await handleAlarm({ name: ALARM_VAULT_AUTOLOCK });
  await handleInstalled({ reason: 'install' });
  await handleStartup();
  console.log('✓ Alarm scheduling and lifecycle handlers execute cleanly');

  console.log('\n✅ All Wave 4 Empirical Challenge Tests Passed Successfully!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
