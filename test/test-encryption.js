/**
 * Unit Tests for SmartForm AI Cryptography Engine
 * Verifies PBKDF2 key derivation, AES-256-GCM AEAD encryption/decryption,
 * short PIN support, tamper rejection, and export payload round-trips.
 */

import assert from 'node:assert/strict';
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptObject,
  decryptObject,
  createAuthVerifier,
  verifyAuthKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptExportPayload,
  decryptExportPayload,
  isEncryptedExport,
  evaluatePassphraseStrength
} from '../src/services/crypto.js';

import {
  setupVaultEncryption,
  disableVaultEncryption,
  unlockVault,
  lockVault,
  isVaultEncrypted,
  isVaultLocked,
  changeVaultPassphrase,
  getProfiles,
  saveProfiles,
  getSettings,
  saveSettings,
  STORAGE_KEYS
} from '../src/services/storage.js';

import { exportConfiguration, importConfiguration } from '../src/utils/importer.js';
import { getStorageBackend, SESSION_KEYS } from '../src/services/storage/storage-base.js';

async function runEncryptionTests() {
  console.log('=== SMARTFORM AI ENCRYPTION & SECURITY TEST SUITE ===\n');

  console.log('--- TEST 1: Key Derivation & Fast PIN Support ---');
  const salt = generateSalt();
  assert.ok(salt && salt.length >= 20, 'Salt should be generated as base64 string');

  // Test with a 4-digit PIN (fast derivation iterations for test speed)
  const pinKey = await deriveKeyFromPassphrase('1234', salt, 50000);
  assert.ok(pinKey, 'Should successfully derive key from 4-digit PIN');

  // Test with single character
  const singleCharKey = await deriveKeyFromPassphrase('X', salt, 50000);
  assert.ok(singleCharKey, 'Should successfully derive key from single character');

  // Test with long passphrase
  const longPassKey = await deriveKeyFromPassphrase('super-secret-complex-passphrase-with-symbols-!@#$%^&*()_+', salt, 50000);
  assert.ok(longPassKey, 'Should successfully derive key from long complex passphrase');
  console.log('✓ Successfully derived keys for 4-digit PIN, single character, and long passphrases');

  console.log('\n--- TEST 2: AES-256-GCM Object Encryption & Decryption ---');
  const sampleProfileData = {
    businessName: 'Vault Protected Commercial Services',
    abn: '12 345 678 901',
    sensitiveNotes: 'Master vault test payload containing sensitive keys and hours',
    apiKeys: {
      geminiApiKey: 'AIzaSyTestApiKey1234567890',
      customSecret: 'Bearer confidential-token-xyz'
    }
  };

  const encrypted = await encryptObject(sampleProfileData, pinKey);
  assert.ok(encrypted.iv, 'Encrypted envelope must contain IV');
  assert.ok(encrypted.ciphertext, 'Encrypted envelope must contain ciphertext');
  assert.notStrictEqual(encrypted.ciphertext, JSON.stringify(sampleProfileData), 'Ciphertext must not be plaintext');

  const decrypted = await decryptObject(encrypted, pinKey);
  assert.deepStrictEqual(decrypted, sampleProfileData, 'Decrypted data must match original exactly');
  console.log('✓ Successfully encrypted and decrypted complex profile and API key data');

  console.log('\n--- TEST 3: Auth Verifier Sentinel Validation ---');
  const verifier = await createAuthVerifier(pinKey);
  const isValidCorrectKey = await verifyAuthKey(pinKey, verifier);
  assert.strictEqual(isValidCorrectKey, true, 'Auth verifier must return true for correct key');

  const wrongKey = await deriveKeyFromPassphrase('9999', salt, 50000);
  const isValidWrongKey = await verifyAuthKey(wrongKey, verifier);
  assert.strictEqual(isValidWrongKey, false, 'Auth verifier must return false for wrong key');
  console.log('✓ Auth verifier successfully confirms valid key and rejects invalid key');

  console.log('\n--- TEST 4: Tamper Resistance (AEAD Integrity Guard) ---');
  // Corrupt one character in the ciphertext to simulate disk corruption or tampering
  const tamperedCiphertext = encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 4) + 'AAAA';
  let tamperCaught = false;
  try {
    await decryptObject({ iv: encrypted.iv, ciphertext: tamperedCiphertext }, pinKey);
  } catch (err) {
    tamperCaught = true;
    assert.ok(err.message.includes('Decryption failed'));
  }
  assert.strictEqual(tamperCaught, true, 'Tampered ciphertext must be rejected by AES-GCM AEAD verification');
  console.log('✓ Successfully rejected tampered ciphertext with AEAD authentication failure');

  console.log('\n--- TEST 5: Session Key Export & Import (RAM Caching) ---');
  const exportedRaw = await exportKeyToBase64(pinKey);
  assert.strictEqual(typeof exportedRaw, 'string');
  const reimportedKey = await importKeyFromBase64(exportedRaw);

  const testEnvelope = await encryptObject({ check: 'session-ram-test' }, reimportedKey);
  const reDecrypted = await decryptObject(testEnvelope, pinKey);
  assert.strictEqual(reDecrypted.check, 'session-ram-test');
  console.log('✓ Successfully exported and re-imported CryptoKey for session storage caching');

  console.log('\n--- TEST 6: Encrypted Export & Import Round-trip ---');
  const exportPayload = {
    profiles: [sampleProfileData],
    activeProfileId: 'test-profile-uuid',
    settings: { showFloatingButton: true }
  };

  const encryptedExport = await encryptExportPayload(exportPayload, 'MySecretPass123', 50000);
  assert.strictEqual(isEncryptedExport(encryptedExport), true, 'Must detect as encrypted export');
  assert.strictEqual(encryptedExport.format, 'smartform-encrypted-vault');

  // Verify wrong password rejects
  let wrongPassCaught = false;
  try {
    await decryptExportPayload(encryptedExport, 'WrongPassword');
  } catch (err) {
    wrongPassCaught = true;
  }
  assert.strictEqual(wrongPassCaught, true, 'Wrong password must be rejected on export decryption');

  // Verify correct password restores original payload
  const restored = await decryptExportPayload(encryptedExport, 'MySecretPass123');
  assert.deepStrictEqual(restored, exportPayload, 'Restored export must match original payload exactly');

  // Verify malformed export payload rejection (Defect 4 regression)
  assert.strictEqual(isEncryptedExport({ format: 'smartform-encrypted-vault' }), false);
  assert.strictEqual(isEncryptedExport({ format: 'smartform-encrypted-vault', kdf: {}, iv: 'iv', ciphertext: 'ct' }), false);
  assert.strictEqual(isEncryptedExport({ format: 'smartform-encrypted-vault', kdf: { salt: 123 }, iv: 'iv', ciphertext: 'ct' }), false);
  assert.strictEqual(isEncryptedExport({ format: 'smartform-encrypted-vault', kdf: { salt: 's' }, ciphertext: 'ct' }), false);
  assert.strictEqual(isEncryptedExport({ format: 'smartform-encrypted-vault', kdf: { salt: 's' }, iv: 'iv' }), false);

  let malformedCaught = false;
  try {
    await decryptExportPayload({ format: 'smartform-encrypted-vault' }, 'pass');
  } catch (err) {
    malformedCaught = true;
    assert.strictEqual(err.constructor.name, 'Error');
    assert.strictEqual(err.message, 'Payload is not an encrypted SmartForm vault.');
  }
  assert.strictEqual(malformedCaught, true, 'Malformed payload must throw domain Error, not TypeError');
  console.log('✓ Successfully exported encrypted vault backup and restored with password validation');

  console.log('\n--- TEST 7: Passphrase Strength Evaluator ---');
  assert.strictEqual(evaluatePassphraseStrength('').level, 'empty');
  assert.strictEqual(evaluatePassphraseStrength('1234').level, 'pin');
  assert.strictEqual(evaluatePassphraseStrength('Pass1234').level, 'good');
  assert.strictEqual(evaluatePassphraseStrength('Correct-Horse-Battery-Staple-2026').level, 'strong');
  console.log('✓ Evaluated passphrase strength informatively across PINs and passphrases');

  console.log('\n--- TEST 8: Vault Storage Lifecycle & Migration ---');
  // 1. Start with plaintext data
  const initialProfiles = [
    { id: 'prof_1', name: 'Alpha Cleaning', data: { email: 'alpha@example.com' } }
  ];
  await saveProfiles(initialProfiles);
  await saveSettings({ geminiApiKey: 'AIzaSyPlaintextKey123', openaiApiKey: 'sk-secret-open-ai' });

  assert.strictEqual(await isVaultEncrypted(), false, 'Vault must start unencrypted');

  // 2. Enable encryption with 4-digit PIN
  const setupRes = await setupVaultEncryption('4321');
  assert.strictEqual(setupRes.success, true);
  assert.strictEqual(await isVaultEncrypted(), true, 'Vault must be marked encrypted');
  assert.strictEqual(await isVaultLocked(), false, 'Vault should be unlocked immediately after setup');

  // 2b. Verify re-encryption overwrite protection throws without erasing vault data (Defect 3 regression)
  let overwriteAttemptThrew = false;
  try {
    await setupVaultEncryption('9999');
  } catch (err) {
    overwriteAttemptThrew = true;
    assert.ok(err.message.includes('already encrypted'), 'Error message must inform caller vault is already encrypted');
  }
  assert.strictEqual(overwriteAttemptThrew, true, 'setupVaultEncryption must reject on already encrypted vault');

  // 3. Verify disk storage does not contain plaintext profiles or sensitive API keys
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.PROFILES], undefined, 'Plaintext profiles key must be removed from disk');
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.SETTINGS].geminiApiKey, '', 'Plaintext geminiApiKey on disk must be empty');
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.SETTINGS].openaiApiKey, '', 'Plaintext openaiApiKey on disk must be empty');
  assert.ok(globalThis._mockStorage[STORAGE_KEYS.VAULT_DATA], 'Encrypted vault data must exist on disk');

  // 4. Verify unlocked read returns decrypted data
  const decryptedProfiles = await getProfiles();
  assert.strictEqual(decryptedProfiles.length, 1);
  assert.strictEqual(decryptedProfiles[0].name, 'Alpha Cleaning');

  const decryptedSettings = await getSettings();
  assert.strictEqual(decryptedSettings.geminiApiKey, 'AIzaSyPlaintextKey123');
  assert.strictEqual(decryptedSettings.openaiApiKey, 'sk-secret-open-ai');
  console.log('✓ Successfully migrated plaintext storage to AES-256-GCM vault with masked disk storage');

  // 5. Test lock vault
  await lockVault();
  assert.strictEqual(await isVaultLocked(), true, 'Vault must report locked');
  assert.deepStrictEqual(await getProfiles(), [], 'Locked vault must return empty profiles');
  const lockedSettings = await getSettings();
  assert.strictEqual(lockedSettings.geminiApiKey, '', 'Locked settings must mask API keys');
  console.log('✓ Vault locking strictly prevents reading profiles and masks API keys');

  // 6. Test wrong PIN rejection
  const wrongUnlock = await unlockVault('0000');
  assert.strictEqual(wrongUnlock.success, false);
  assert.strictEqual(await isVaultLocked(), true, 'Wrong PIN must keep vault locked');

  // 7. Test correct PIN unlock
  const correctUnlock = await unlockVault('4321');
  assert.strictEqual(correctUnlock.success, true);
  assert.strictEqual(await isVaultLocked(), false, 'Correct PIN must unlock vault');
  const reUnlockedProfiles = await getProfiles();
  assert.strictEqual(reUnlockedProfiles[0].name, 'Alpha Cleaning');

  // 7b. Test Auto-Lock Expiration Enforcement (Defect 2 regression)
  globalThis._mockStorage[STORAGE_KEYS.VAULT_META].autoLockMinutes = 5;
  assert.strictEqual(await isVaultLocked(), false);
  // Fast forward past 5-minute timeout (60 minutes ago)
  globalThis._mockSessionStorage[SESSION_KEYS.UNLOCKED_AT] = Date.now() - (60 * 60 * 1000);
  assert.strictEqual(await isVaultLocked(), true, 'Vault must auto-lock after expiration timeout');
  assert.strictEqual(globalThis._mockSessionStorage[SESSION_KEYS.SESSION_KEY], undefined, 'Session key must be cleared on auto-lock');
  // Re-unlock and disable auto-lock timeout for subsequent steps
  await unlockVault('4321');
  globalThis._mockStorage[STORAGE_KEYS.VAULT_META].autoLockMinutes = 0;
  assert.strictEqual(await isVaultLocked(), false);
  console.log('✓ PIN authentication verified correctly with session caching and auto-lock enforcement');

  // 8. Test Dual-Mode Export & Encrypted Import
  const encExport = await exportConfiguration({ includeApiKey: true, encrypt: true, passphrase: '4321' });
  assert.strictEqual(isEncryptedExport(encExport), true);

  const plainExport = await exportConfiguration({ includeApiKey: false, encrypt: false });
  assert.strictEqual(isEncryptedExport(plainExport), false);
  assert.strictEqual(plainExport.settings.geminiApiKey, '');

  // Import encrypted backup
  const importNeedPass = await importConfiguration(encExport, 'replace');
  assert.strictEqual(importNeedPass.needsPassword, true);

  const importWrongPass = await importConfiguration(encExport, 'replace', { passphrase: 'Wrong' });
  assert.strictEqual(importWrongPass.needsPassword, true);

  const importSuccess = await importConfiguration(encExport, 'replace', { passphrase: '4321' });
  assert.strictEqual(importSuccess.success, true);
  console.log('✓ Dual-mode export (encrypted & plaintext) and password-protected import verified');

  // 9. Test Change Passphrase
  const changeRes = await changeVaultPassphrase('4321', 'NewSecurePass2026!');
  assert.strictEqual(changeRes.success, true);

  await lockVault();
  const oldPassUnlock = await unlockVault('4321');
  assert.strictEqual(oldPassUnlock.success, false, 'Old PIN must be rejected');

  const newPassUnlock = await unlockVault('NewSecurePass2026!');
  assert.strictEqual(newPassUnlock.success, true, 'New passphrase must unlock');
  console.log('✓ Changed passphrase re-encrypted vault data and updated auth verifier');

  // 10. Test Disable Vault Encryption
  const disableRes = await disableVaultEncryption('NewSecurePass2026!');
  assert.strictEqual(disableRes.success, true);
  assert.strictEqual(await isVaultEncrypted(), false, 'Vault must be unencrypted');
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.VAULT_META], undefined);
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.VAULT_DATA], undefined);
  assert.ok(globalThis._mockStorage[STORAGE_KEYS.PROFILES], 'Plaintext profiles restored on disk');
  assert.strictEqual(globalThis._mockStorage[STORAGE_KEYS.SETTINGS].geminiApiKey, 'AIzaSyPlaintextKey123');
  console.log('✓ Disabled vault encryption cleanly restored plaintext storage');

  console.log('\n--- TEST 11: In-Memory Storage Backend Clear Synchronization ---');
  const s1 = getStorageBackend();
  await s1.set({ test_clear_key: 'active_value' });
  await s1.clear();
  const readCleared = await s1.get(['test_clear_key']);
  assert.strictEqual(Object.keys(readCleared).length, 0, 's1 must see empty data after clear');
  await s1.set({ test_sync_key: 'sync_value' });
  const s2 = getStorageBackend();
  const readS2 = await s2.get(['test_sync_key']);
  assert.strictEqual(readS2.test_sync_key, 'sync_value', 'Subsequent backend instances must share storage');
  await s1.clear();
  console.log('✓ In-memory storage clear preserves object reference and synchronizes callers');

  console.log('\n✅ All Encryption & Security Unit Tests Passed Successfully!');
}

runEncryptionTests().catch((err) => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
