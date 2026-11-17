/**
 * Empirical Challenge Harness: Wave 1 Iteration 2 Gate Evaluation
 * Critic / Specialist: challenger_wave1_it2_2
 *
 * Stress-testing:
 * 1. Defect 2: Vault Auto-Lock Expiration in storage-vault.ts
 * 2. Defect 3: Vault Re-encryption Overwrite Protection in storage-vault-setup.ts
 */

import assert from 'assert';
import {
  setupVaultEncryption,
  disableVaultEncryption,
  changeVaultPassphrase
} from '../src/services/storage/storage-vault-setup.js';
import {
  isVaultEncrypted,
  isVaultLocked,
  unlockVault,
  lockVault,
  getVaultMeta,
  readDecryptedVaultData,
  writeEncryptedVaultData
} from '../src/services/storage/storage-vault.js';
import {
  getProfiles,
  saveProfiles,
  getSettings,
  saveSettings
} from '../src/services/storage.js';
import {
  getStorageBackend,
  getSessionBackend,
  STORAGE_KEYS,
  SESSION_KEYS
} from '../src/services/storage/storage-base.js';

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(
        () => {
          passed++;
          console.log(`  ✓ ${desc}`);
        },
        (err) => {
          console.error(`  ✗ ${desc}`);
          console.error(err);
          throw err;
        }
      );
    }
    passed++;
    console.log(`  ✓ ${desc}`);
    return Promise.resolve();
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    throw err;
  }
}

async function resetBackends() {
  const disk = getStorageBackend();
  const session = getSessionBackend();
  await disk.clear();
  await session.clear();
}

async function runDefect2Tests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 1: Defect 2 — Vault Auto-Lock Expiration');
  console.log('======================================================');

  await resetBackends();

  const originalNow = Date.now;
  let simulatedTime = 1_700_000_000_000;
  Date.now = () => simulatedTime;

  try {
    await it('1.1: Setup vault with autoLockMinutes = 5, initial state is unlocked', async () => {
      await saveProfiles([{ id: 'p1', name: 'AutoLock Profile', data: { biz: 'Test' } }]);
      await saveSettings({ geminiApiKey: 'test-api-key-1' });

      const res = await setupVaultEncryption('pin1234', { autoLockMinutes: 5 });
      assert.strictEqual(res.success, true);
      assert.strictEqual(await isVaultEncrypted(), true);
      assert.strictEqual(await isVaultLocked(), false);

      const session = getSessionBackend();
      const sData = await session.get([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT]);
      assert.ok(sData[SESSION_KEYS.SESSION_KEY], 'Session key must be present');
      assert.strictEqual(sData[SESSION_KEYS.UNLOCKED_AT], simulatedTime);
    });

    await it('1.2: Elapsed time < 5 min (e.g. 4m 59s / 299,000 ms) -> vault remains unlocked', async () => {
      simulatedTime += 299_000;
      assert.strictEqual(await isVaultLocked(), false, 'Vault must remain unlocked at 4m 59s');
      const data = await readDecryptedVaultData();
      assert.ok(data, 'Decrypted vault data must be accessible');
      assert.strictEqual(data?.profiles[0].name, 'AutoLock Profile');
    });

    await it('1.3: Boundary condition: exactly 5 min (300,000 ms) -> strict inequality keeps unlocked', async () => {
      simulatedTime += 1_000; // now exactly +300,000 ms from unlock
      assert.strictEqual(await isVaultLocked(), false, 'Vault remains unlocked at exact 5-min boundary');
    });

    await it('1.4: Elapsed time > 5 min (300,001 ms) -> isVaultLocked() returns true and purges session', async () => {
      simulatedTime += 1; // now +300,001 ms (> 5 min)
      const locked = await isVaultLocked();
      assert.strictEqual(locked, true, 'Vault must report locked when elapsed > 5m');

      // Verify session keys were purged from session storage backend
      const session = getSessionBackend();
      const sData = await session.get([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT]);
      assert.strictEqual(sData[SESSION_KEYS.SESSION_KEY], undefined, 'Session key must be purged');
      assert.strictEqual(sData[SESSION_KEYS.UNLOCKED_AT], undefined, 'UnlockedAt timestamp must be purged');
    });

    await it('1.5: Subsequent reads and writes fail when vault is auto-locked', async () => {
      const data = await readDecryptedVaultData();
      assert.strictEqual(data, null, 'readDecryptedVaultData must return null when locked');

      let writeFailed = false;
      try {
        await writeEncryptedVaultData({ profiles: [], credentials: {}, logs: [] });
      } catch (err) {
        writeFailed = true;
        assert.ok(err.message.includes('locked'), 'Must throw error specifying vault is locked');
      }
      assert.strictEqual(writeFailed, true, 'writeEncryptedVaultData must throw when locked');
    });

    await it('1.6: Re-unlocking refreshes UNLOCKED_AT and starts a fresh timeout window', async () => {
      simulatedTime += 60_000;
      const unlockRes = await unlockVault('pin1234');
      assert.strictEqual(unlockRes.success, true);
      assert.strictEqual(await isVaultLocked(), false);

      const session = getSessionBackend();
      const sData = await session.get([SESSION_KEYS.UNLOCKED_AT]);
      assert.strictEqual(sData[SESSION_KEYS.UNLOCKED_AT], simulatedTime, 'UNLOCKED_AT must be refreshed');

      // Fast forward 4 minutes from new unlock time -> still unlocked
      simulatedTime += 4 * 60 * 1000;
      assert.strictEqual(await isVaultLocked(), false);

      // Fast forward past 5 minutes from new unlock time -> locked again
      simulatedTime += 2 * 60 * 1000; // total 6 min
      assert.strictEqual(await isVaultLocked(), true);
    });

    await it('1.7: autoLockMinutes = 0 disables auto-lock indefinitely', async () => {
      await resetBackends();
      await saveProfiles([{ id: 'p2', name: 'Indefinite Profile', data: {} }]);
      await setupVaultEncryption('pin0000', { autoLockMinutes: 0 });

      assert.strictEqual(await isVaultLocked(), false);

      // Advance time by 1 hour, 1 day, 100 days
      simulatedTime += 100 * 24 * 60 * 60 * 1000;
      assert.strictEqual(await isVaultLocked(), false, 'Vault must remain unlocked indefinitely when autoLockMinutes is 0');

      const data = await readDecryptedVaultData();
      assert.ok(data);
      assert.strictEqual(data?.profiles[0].name, 'Indefinite Profile');
    });

    await it('1.8: autoLockMinutes omitted (default) defaults to 0 (disabled)', async () => {
      await resetBackends();
      await setupVaultEncryption('defaultPass');
      const meta = await getVaultMeta();
      assert.strictEqual(meta?.autoLockMinutes, 0, 'Default autoLockMinutes must be 0');

      simulatedTime += 86400000;
      assert.strictEqual(await isVaultLocked(), false, 'Omitted autoLockMinutes remains unlocked');
    });

    await it('1.9: Concurrent access when expired behaves consistently without race errors', async () => {
      await resetBackends();
      await setupVaultEncryption('pinConc', { autoLockMinutes: 1 });
      assert.strictEqual(await isVaultLocked(), false);

      // Advance past 1 minute
      simulatedTime += 61_000;

      // Trigger 10 concurrent operations
      const results = await Promise.all([
        isVaultLocked(),
        isVaultLocked(),
        readDecryptedVaultData(),
        isVaultLocked(),
        readDecryptedVaultData(),
        isVaultLocked()
      ]);

      assert.strictEqual(results[0], true);
      assert.strictEqual(results[1], true);
      assert.strictEqual(results[2], null);
      assert.strictEqual(results[3], true);
      assert.strictEqual(results[4], null);
      assert.strictEqual(results[5], true);

      const session = getSessionBackend();
      const sData = await session.get([SESSION_KEYS.SESSION_KEY, SESSION_KEYS.UNLOCKED_AT]);
      assert.strictEqual(sData[SESSION_KEYS.SESSION_KEY], undefined);
    });

    await it('1.10: Negative autoLockMinutes (-5) does not auto-lock', async () => {
      await resetBackends();
      await setupVaultEncryption('pinNeg', { autoLockMinutes: -5 });
      assert.strictEqual(await isVaultLocked(), false);

      simulatedTime += 600_000;
      assert.strictEqual(await isVaultLocked(), false, 'Negative autoLockMinutes should not trigger auto-lock');
    });

    await it('1.11: Higher-level getProfiles() and getSettings() mask data when auto-lock triggers', async () => {
      await resetBackends();
      await saveProfiles([{ id: 'p_sec', name: 'Secret Customer Profile', data: { biz: 'CleanCorp' } }]);
      await saveSettings({ geminiApiKey: 'AIzaSyTopSecret12345', openaiApiKey: 'sk-secret-abcdef' });
      await setupVaultEncryption('lockCheckPass', { autoLockMinutes: 2 });

      // Immediately after setup: unlocked, profiles & api keys visible
      assert.strictEqual(await isVaultLocked(), false);
      const profilesBefore = await getProfiles();
      assert.strictEqual(profilesBefore.length, 1);
      assert.strictEqual(profilesBefore[0].name, 'Secret Customer Profile');
      const settingsBefore = await getSettings();
      assert.strictEqual(settingsBefore.geminiApiKey, 'AIzaSyTopSecret12345');

      // Fast forward past 2 minutes (e.g. 2m 1s)
      simulatedTime += 121_000;

      // Now auto-lock should trigger on access
      const profilesAfter = await getProfiles();
      assert.deepStrictEqual(profilesAfter, [], 'getProfiles must return empty array when auto-locked');

      const settingsAfter = await getSettings();
      assert.strictEqual(settingsAfter.geminiApiKey, '', 'Sensitive geminiApiKey must be masked when auto-locked');
      assert.strictEqual(settingsAfter.openaiApiKey, '', 'Sensitive openaiApiKey must be masked when auto-locked');

      // saveProfiles should throw
      let saveThrew = false;
      try {
        await saveProfiles([{ id: 'p_new', name: 'Illegal Save', data: {} }]);
      } catch (err) {
        saveThrew = true;
        assert.ok(err.message.includes('locked'));
      }
      assert.strictEqual(saveThrew, true, 'saveProfiles must throw when auto-locked');

      // Now unlock and verify data returns
      const unlockRes = await unlockVault('lockCheckPass');
      assert.strictEqual(unlockRes.success, true);
      const profilesRestored = await getProfiles();
      assert.strictEqual(profilesRestored.length, 1);
      assert.strictEqual(profilesRestored[0].name, 'Secret Customer Profile');
      const settingsRestored = await getSettings();
      assert.strictEqual(settingsRestored.geminiApiKey, 'AIzaSyTopSecret12345');
    });
  } finally {
    Date.now = originalNow;
  }
}

async function runDefect3Tests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 2: Defect 3 — Vault Re-encryption Protection');
  console.log('======================================================');

  await resetBackends();

  await it('2.1: setupVaultEncryption aborts with Error when vault is already encrypted', async () => {
    const originalProfiles = [
      { id: 'prof_alpha', name: 'Alpha Cleaning Co', data: { email: 'info@alphaclean.com', phone: '0400111222' } },
      { id: 'prof_beta', name: 'Beta Commercial Ltd', data: { email: 'contact@betaclean.com' } }
    ];
    await saveProfiles(originalProfiles);
    await saveSettings({
      geminiApiKey: 'AIzaSyTopSecretKey98765',
      openaiApiKey: 'sk-secret-token-12345',
      fillSpeed: 'fast'
    });

    // 1. Initial encryption
    const setupRes = await setupVaultEncryption('OriginalMasterPassword123!', { autoLockMinutes: 10 });
    assert.strictEqual(setupRes.success, true);
    assert.strictEqual(await isVaultEncrypted(), true);

    // Snapshot existing storage state
    const disk = getStorageBackend();
    const diskDataBefore = await disk.get([
      STORAGE_KEYS.VAULT_META,
      STORAGE_KEYS.VAULT_DATA,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.LOGS
    ]);

    const metaBefore = JSON.stringify(diskDataBefore[STORAGE_KEYS.VAULT_META]);
    const dataBefore = JSON.stringify(diskDataBefore[STORAGE_KEYS.VAULT_DATA]);
    const settingsBefore = JSON.stringify(diskDataBefore[STORAGE_KEYS.SETTINGS]);

    // 2. Attempt to re-encrypt with a completely different passphrase
    let errorThrown = false;
    let errorMessage = '';
    try {
      await setupVaultEncryption('AttackerNewPassphrase999!');
    } catch (err) {
      errorThrown = true;
      errorMessage = err.message;
    }

    assert.strictEqual(errorThrown, true, 'setupVaultEncryption MUST throw an error');
    assert.ok(
      errorMessage.includes('Vault is already encrypted'),
      `Error message must indicate vault is already encrypted. Got: "${errorMessage}"`
    );

    // 3. Verify storage was NOT modified in any way
    const diskDataAfter = await disk.get([
      STORAGE_KEYS.VAULT_META,
      STORAGE_KEYS.VAULT_DATA,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.LOGS
    ]);

    assert.strictEqual(
      JSON.stringify(diskDataAfter[STORAGE_KEYS.VAULT_META]),
      metaBefore,
      'VAULT_META must not be modified by aborted setup'
    );
    assert.strictEqual(
      JSON.stringify(diskDataAfter[STORAGE_KEYS.VAULT_DATA]),
      dataBefore,
      'VAULT_DATA must not be modified by aborted setup'
    );
    assert.strictEqual(
      JSON.stringify(diskDataAfter[STORAGE_KEYS.SETTINGS]),
      settingsBefore,
      'SETTINGS must not be modified by aborted setup'
    );
    assert.strictEqual(
      diskDataAfter[STORAGE_KEYS.PROFILES],
      undefined,
      'Plaintext PROFILES must remain undefined on disk'
    );

    // 4. Verify original data remains 100% intact and decryptable
    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 2);
    assert.strictEqual(profiles[0].name, 'Alpha Cleaning Co');
    assert.strictEqual(profiles[0].data.email, 'info@alphaclean.com');
    assert.strictEqual(profiles[1].name, 'Beta Commercial Ltd');

    const settings = await getSettings();
    assert.strictEqual(settings.geminiApiKey, 'AIzaSyTopSecretKey98765');
    assert.strictEqual(settings.openaiApiKey, 'sk-secret-token-12345');
    assert.strictEqual(settings.fillSpeed, 'fast');
  });

  await it('2.2: setupVaultEncryption aborts even if vault is LOCKED', async () => {
    // Lock the vault
    await lockVault();
    assert.strictEqual(await isVaultLocked(), true);

    let errorThrown = false;
    try {
      await setupVaultEncryption('AnotherPasscode777');
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('already encrypted'));
    }
    assert.strictEqual(errorThrown, true, 'Must reject even when vault is locked');

    // Unlock with original credentials and verify intactness
    const unlockRes = await unlockVault('OriginalMasterPassword123!');
    assert.strictEqual(unlockRes.success, true);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 2);
    assert.strictEqual(profiles[0].name, 'Alpha Cleaning Co');

    const settings = await getSettings();
    assert.strictEqual(settings.geminiApiKey, 'AIzaSyTopSecretKey98765');
  });

  await it('2.3: Storage write spy confirms ZERO calls to storage.set or storage.remove during rejected setup', async () => {
    const disk = getStorageBackend();
    let setCalls = 0;
    let removeCalls = 0;

    const origSet = disk.set;
    const origRemove = disk.remove;

    disk.set = (items, cb) => {
      setCalls++;
      return origSet(items, cb);
    };
    disk.remove = (keys, cb) => {
      removeCalls++;
      return origRemove(keys, cb);
    };

    try {
      await setupVaultEncryption('SpyTestPass');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('already encrypted'));
    } finally {
      disk.set = origSet;
      disk.remove = origRemove;
    }

    assert.strictEqual(setCalls, 0, 'storage.set must NOT be called when setupVaultEncryption is rejected');
    assert.strictEqual(removeCalls, 0, 'storage.remove must NOT be called when setupVaultEncryption is rejected');
  });

  await it('2.4: Empty passphrase is rejected before checking encryption status', async () => {
    let emptyCaught = false;
    try {
      await setupVaultEncryption('');
    } catch (err) {
      emptyCaught = true;
      assert.strictEqual(err.message, 'Passphrase or PIN cannot be empty.');
    }
    assert.strictEqual(emptyCaught, true);
  });

  await it('2.5: Legitimate lifecycle: changeVaultPassphrase preserves autoLockMinutes, and setup works after disable', async () => {
    // Check autoLockMinutes before rotation
    const metaBefore = await getVaultMeta();
    assert.strictEqual(metaBefore?.autoLockMinutes, 10);

    // Rotate passphrase via changeVaultPassphrase
    const changeRes = await changeVaultPassphrase('OriginalMasterPassword123!', 'NewRotatedPassword456!');
    assert.strictEqual(changeRes.success, true);

    // Verify autoLockMinutes is preserved across password change
    const metaAfter = await getVaultMeta();
    assert.strictEqual(metaAfter?.autoLockMinutes, 10, 'changeVaultPassphrase must preserve autoLockMinutes');

    // Verify data decryptable with new passphrase
    const profilesAfterRotation = await getProfiles();
    assert.strictEqual(profilesAfterRotation[0].name, 'Alpha Cleaning Co');

    // Attempting setupVaultEncryption still fails after rotation
    let stillRejected = false;
    try {
      await setupVaultEncryption('IllegalOverridePass');
    } catch (err) {
      stillRejected = true;
    }
    assert.strictEqual(stillRejected, true);

    // Now legitimately disable encryption
    const disableRes = await disableVaultEncryption('NewRotatedPassword456!');
    assert.strictEqual(disableRes.success, true);
    assert.strictEqual(await isVaultEncrypted(), false);

    // Plaintext profiles should now be restored
    const profilesPlain = await getProfiles();
    assert.strictEqual(profilesPlain[0].name, 'Alpha Cleaning Co');

    // Now that vault is unencrypted, setupVaultEncryption should SUCCEED
    const reSetupRes = await setupVaultEncryption('BrandNewPassphrase789!', { autoLockMinutes: 15 });
    assert.strictEqual(reSetupRes.success, true);
    assert.strictEqual(await isVaultEncrypted(), true);

    const reEncryptedProfiles = await getProfiles();
    assert.strictEqual(reEncryptedProfiles[0].name, 'Alpha Cleaning Co');
  });
}

async function main() {
  try {
    await runDefect2Tests();
    await runDefect3Tests();
    console.log('\n======================================================');
    console.log(`EMPIRICAL CHALLENGE RESULTS: ${passed}/${total} assertions PASSED`);
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\nEMPIRICAL CHALLENGE FAILED:', err);
    process.exit(1);
  }
}

main();
