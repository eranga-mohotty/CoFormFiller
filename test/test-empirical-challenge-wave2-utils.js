/**
 * Empirical Challenge Harness: Wave 2 Utilities (importer, legacy-importer, exporter)
 * Critic / Specialist: challenger_wave2_1
 *
 * Test Suites:
 * 1. Corrupt & Adversarial Import Payloads
 * 2. Schema & Format Compatibility (Legacy v1, v2, Round-trip, Encryption)
 * 3. Large & Stress Datasets (500 profiles, 10,000 custom fields, OOM / Stack Overflow)
 * 4. Adversarial Edge Cases in Legacy Profile Parsing
 */

import assert from 'node:assert';
import {
  importConfiguration,
  detectFormat
} from '../src/utils/importer.js';
import {
  exportConfiguration
} from '../src/utils/exporter.js';
import {
  parseLegacyProfile
} from '../src/utils/legacy-importer.js';
import {
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getSettings,
  saveSettings
} from '../src/services/storage.js';
import {
  getStorageBackend,
  getSessionBackend
} from '../src/services/storage/storage-base.js';

let passed = 0;
let total = 0;
const failures = [];

async function it(desc, fn) {
  total++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    passed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failures.push({ desc, err });
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function resetStorage() {
  const disk = getStorageBackend();
  const session = getSessionBackend();
  await disk.clear();
  await session.clear();
}

function createSampleProfileData(suffix = '') {
  return {
    businessName: `Acme Cleaning Solutions ${suffix}`.trim(),
    tradingName: `Acme Clean ${suffix}`.trim(),
    contactName: `Jordan Miller ${suffix}`.trim(),
    firstName: 'Jordan',
    lastName: 'Miller',
    email: `jordan${suffix ? '.' + suffix : ''}@acmecleaning.example.com`,
    phone: '+1-555-0199',
    mobile: '+1-555-0198',
    website: 'https://www.acmecleaning.example.com',
    address: {
      street: '123 Market Street, Suite 400',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'United States'
    },
    services: [
      'Commercial Cleaning',
      'Janitorial Services',
      'Window Washing',
      'Carpet Shampooing',
      'Disinfection & Sanitizing'
    ],
    openingHours: {
      monday: { open: '08:00', close: '18:00', closed: false },
      tuesday: { open: '08:00', close: '18:00', closed: false },
      wednesday: { open: '08:00', close: '18:00', closed: false },
      thursday: { open: '08:00', close: '18:00', closed: false },
      friday: { open: '08:00', close: '17:00', closed: false },
      saturday: { open: '09:00', close: '15:00', closed: false },
      sunday: { open: '', close: '', closed: true, onCall24_7: false },
      alwaysOpen: false,
      rawHoursText: 'Mon-Fri 8am-6pm, Sat 9am-3pm, Sun Closed'
    },
    descriptions: {
      short: 'Reliable commercial cleaning services across SF Bay Area.',
      full: 'Acme Cleaning Solutions provides premier commercial, industrial, and post-construction cleaning. Licensed, bonded, and insured.',
      tagline: 'Spotless results, every single time.'
    },
    faqs: [
      { q: 'What areas do you service?', a: 'Greater San Francisco and Oakland metro area.' },
      { q: 'Are you insured?', a: 'Yes, fully insured up to $5M general liability.' }
    ],
    customFields: [
      { key: 'Tax ID', value: 'XX-XXXXXXX', category: 'compliance' },
      { key: 'EPA License', value: 'EPA-99882', category: 'certifications' }
    ]
  };
}

async function runSuite1CorruptAdversarial() {
  console.log('\n================================================================');
  console.log('SUITE 1: Corrupt & Adversarial Import Payloads');
  console.log('================================================================');

  await resetStorage();

  await it('1.1: Truncated JSON input string returns graceful error without crashing', async () => {
    const truncated = '{"smartform_version": "1.0.0", "profiles": [{"id": "p1", "name": "Broken"';
    const res = await importConfiguration(truncated);
    assert.strictEqual(res.success, false);
    assert.ok(res.message.toLowerCase().includes('invalid json format'));
  });

  await it('1.2: Empty string input returns graceful error', async () => {
    const res = await importConfiguration('');
    assert.strictEqual(res.success, false);
    assert.ok(res.message.toLowerCase().includes('invalid json format'));
  });

  await it('1.3: Non-JSON raw strings return graceful error', async () => {
    const nonJsonInputs = [
      'Hello world, this is definitely not JSON',
      '<html><body><h1>404 Not Found</h1></body></html>',
      'undefined',
      'NaN'
    ];
    for (const input of nonJsonInputs) {
      const res = await importConfiguration(input);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.4: Null and undefined raw inputs return graceful error without crashing', async () => {
    const nullRes = await importConfiguration(null);
    assert.strictEqual(nullRes.success, false);
    assert.ok(nullRes.message.toLowerCase().includes('invalid json format'));

    const undefRes = await importConfiguration(undefined);
    assert.strictEqual(undefRes.success, false);
    assert.ok(undefRes.message.toLowerCase().includes('invalid json format'));
  });

  await it('1.5: Stringified primitive types ("null", "true", "false", "12345", "-42.5") return graceful error', async () => {
    const primitives = ['null', 'true', 'false', '12345', '-42.5', '"plain string"'];
    for (const prim of primitives) {
      const res = await importConfiguration(prim);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.6: Direct primitive numbers and booleans return graceful error', async () => {
    const directPrimitives = [123, -42, 0, true, false, 3.14159];
    for (const prim of directPrimitives) {
      const res = await importConfiguration(prim);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.7: Empty array input `[]` returns error indicating no profiles found', async () => {
    const res = await importConfiguration([]);
    assert.strictEqual(res.success, false);
    assert.ok(res.message.toLowerCase().includes('could not extract any profiles'));
  });

  await it('1.8: Native format missing `profiles` field returns error indicating no profiles found', async () => {
    const res = await importConfiguration({ smartform_version: '1.0.0', settings: {} });
    assert.strictEqual(res.success, false);
    assert.ok(res.message.toLowerCase().includes('could not extract any profiles'));
  });

  await it('1.9: Native format with `profiles` as null, number, boolean, or string returns error', async () => {
    const invalidProfilesFields = [null, 123, true, 'profiles_string', {}];
    for (const val of invalidProfilesFields) {
      const res = await importConfiguration({ smartform_version: '1.0.0', profiles: val });
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('could not extract any profiles'));
    }
  });

  await it('1.10: Profiles array containing corrupted non-object elements filters them out', async () => {
    const mixedPayload = {
      smartform_version: '1.0.0',
      profiles: [
        null,
        undefined,
        123,
        'string profile',
        false,
        { id: 'valid_1', name: 'Valid Profile 1', data: { businessName: 'Valid Biz' } }
      ]
    };
    const res = await importConfiguration(mixedPayload, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 1);
    assert.strictEqual(res.activeProfileName, 'Valid Profile 1');
    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].id, 'valid_1');
  });

  await it('1.11: Profile missing all required fields (empty object) handles defaults gracefully', async () => {
    const emptyProfilePayload = {
      smartform_version: '1.0.0',
      profiles: [{}]
    };
    const res = await importConfiguration(emptyProfilePayload, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 1);
    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.ok(profiles[0].id.startsWith('prof_'));
    assert.strictEqual(profiles[0].name, 'Imported Profile');
    assert.ok(typeof profiles[0].createdAt === 'number');
    assert.ok(typeof profiles[0].updatedAt === 'number');
  });

  await it('1.12: Profile with corrupted timestamps (strings, null, negative numbers, NaN)', async () => {
    const timestampEdgeCases = {
      smartform_version: '1.0.0',
      profiles: [
        { id: 'p_nan', name: 'Profile NaN', createdAt: 'not-a-number', updatedAt: null, data: {} },
        { id: 'p_neg', name: 'Profile Negative', createdAt: -1000000, updatedAt: -500000, data: {} }
      ]
    };
    const res = await importConfiguration(timestampEdgeCases, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 2);
    const profiles = await getProfiles();
    const pNan = profiles.find((p) => p.id === 'p_nan');
    assert.ok(pNan);
    assert.ok(typeof pNan.createdAt === 'number');
    assert.ok(!Number.isNaN(pNan.createdAt));
    assert.ok(typeof pNan.updatedAt === 'number');
    assert.ok(!Number.isNaN(pNan.updatedAt));
  });

  await it('1.13: Encrypted vault payload without passphrase returns needsPassword error result', async () => {
    const fakeEncrypted = {
      format: 'smartform-encrypted-vault',
      kdf: { name: 'PBKDF2', salt: 'AAAA', iterations: 1000 },
      iv: 'AAAA',
      ciphertext: 'AAAA'
    };
    const res = await importConfiguration(fakeEncrypted);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.needsPassword, true);
    assert.strictEqual(res.formatDetected, 'encrypted-vault');
    assert.ok(res.message.includes('master password'));
  });

  await it('1.14: Encrypted vault payload with bad passphrase returns decryption error', async () => {
    const payload = await exportConfiguration({ passphrase: 'CorrectPassphrase123', encrypt: true });
    const res = await importConfiguration(payload, 'replace', { passphrase: 'WrongPassword456' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.needsPassword, true);
    assert.ok(res.message.includes('Incorrect password'));
  });
}

async function runSuite2SchemaCompatibility() {
  console.log('\n================================================================');
  console.log('SUITE 2: Schema & Format Compatibility');
  console.log('================================================================');

  await resetStorage();

  await it('2.1: Legacy v1 format (array of fields) parses correctly into Profile domain model', async () => {
    const legacyV1Json = {
      local: {
        activeFlexibleProfileId: 'v1-active-id',
        flexibleProfiles: [
          {
            id: 'v1-active-id',
            name: 'Personal',
            createdAt: '2025-05-10T10:00:00Z',
            updatedAt: '2025-05-11T12:00:00Z',
            fields: [
              { id: 'fullname', name: 'Full Name', value: 'Arthur Dent', category: 'personal' },
              { id: 'email', name: 'Email Address', value: 'arthur@hitchhiker.galaxy', category: 'personal' },
              { id: 'tel', name: 'Telephone', value: '+44 20 7946 0991', category: 'personal' },
              { id: 'address', name: 'Street Address', value: '15 Country Lane', category: 'address' },
              { id: 'city', name: 'City / Town', value: 'Cottington', category: 'address' },
              { id: 'state', name: 'County / State', value: 'West Country', category: 'address' },
              { id: 'postcode', name: 'Postcode', value: 'CT1 2AB', category: 'address' },
              { id: 'country', name: 'Country', value: 'United Kingdom', category: 'address' },
              { id: 'website', name: 'Website URL', value: 'https://arthurdent.co.uk', category: 'web' },
              { id: 'services', name: 'Services Provided', value: 'Tea Making, Towel Management, Hitchhiking', category: 'business' },
              { id: 'faq', name: 'Frequently Asked Questions', value: 'Q) Where is your towel? A) Always with me.\nQ) Do you panic? A) Never panic.', category: 'business' },
              { id: 'description', name: 'About Business', value: 'Sandwich making and space hitchhiking services since 1978.', category: 'business' },
              { id: 'hours', name: 'Operating Hours', value: 'Mon-Sun: 42 hours a week', category: 'business' },
              { id: 'custom_f1', name: 'Favorite Beverage', value: 'Tea (Hot)', category: 'preferences' }
            ]
          }
        ]
      }
    };

    const res = await importConfiguration(legacyV1Json, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'legacy-extension');
    assert.strictEqual(res.profilesImported, 1);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    const p = profiles[0];
    assert.strictEqual(p.id, 'v1-active-id');
    assert.strictEqual(p.name, 'Arthurdent Profile');
    assert.strictEqual(p.data.contactName, 'Arthur Dent');
    assert.strictEqual(p.data.email, 'arthur@hitchhiker.galaxy');
    assert.strictEqual(p.data.phone, '+44 20 7946 0991');
    assert.strictEqual(p.data.address.street, '15 Country Lane');
    assert.strictEqual(p.data.address.city, 'Cottington');
    assert.strictEqual(p.data.address.state, 'West Country');
    assert.strictEqual(p.data.address.postalCode, 'CT1 2AB');
    assert.strictEqual(p.data.address.country, 'United Kingdom');
    assert.strictEqual(p.data.website, 'https://arthurdent.co.uk');
    assert.strictEqual(p.data.services.length, 3);
    assert.deepStrictEqual(p.data.services, ['Tea Making', 'Towel Management', 'Hitchhiking']);
    assert.strictEqual(p.data.faqs.length, 2);
    assert.strictEqual(p.data.faqs[0].q, 'Where is your towel?');
    assert.strictEqual(p.data.faqs[0].a, 'Always with me.');
    assert.strictEqual(p.data.descriptions.full, 'Sandwich making and space hitchhiking services since 1978.');
    assert.strictEqual(p.data.openingHours.rawHoursText, 'Mon-Sun: 42 hours a week');
    assert.ok(p.data.customFields.some((cf) => cf.key === 'Favorite Beverage' && cf.value === 'Tea (Hot)'));
  });

  await it('2.2: Legacy v2 format (numeric keyed object map) parses fields and BYOK settings', async () => {
    const legacyV2Json = {
      local: {
        activeFlexibleProfileId: 'v2-prof-id',
        'byok-v2': {
          ai_provider: 'google',
          google_api_key: 'AIzaSyMOCK_V2_TEST_KEY_12345',
          model: 'gemini-pro-hydrogen'
        },
        flexibleProfiles: [
          {
            id: 'v2-prof-id',
            name: 'Ford Prefect Enterprises',
            createdAt: 1700000000000,
            updatedAt: 1700000100000,
            fields: {
              '0': { id: 'fullname', name: 'Full Name', value: 'Ford Prefect' },
              '1': { id: 'email', name: 'Email Address', value: 'ford@betelgeuse.galaxy' },
              '2': { id: 'c_role', name: 'Galactic Role', value: 'Field Researcher' }
            }
          }
        ]
      }
    };

    const res = await importConfiguration(legacyV2Json, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'legacy-extension');
    assert.strictEqual(res.profilesImported, 1);
    assert.strictEqual(res.apiKeyDetected, true);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].id, 'v2-prof-id');
    assert.strictEqual(profiles[0].name, 'Ford Prefect Enterprises');
    assert.strictEqual(profiles[0].data.contactName, 'Ford Prefect');
    assert.strictEqual(profiles[0].data.email, 'ford@betelgeuse.galaxy');

    const settings = await getSettings();
    assert.strictEqual(settings.geminiApiKey, 'AIzaSyMOCK_V2_TEST_KEY_12345');
    assert.strictEqual(settings.geminiModel, 'gemini-4-hydrogen');

    const activeId = await getActiveProfileId();
    assert.strictEqual(activeId, 'v2-prof-id');
  });

  await it('2.3: Array-of-profiles format imports correctly', async () => {
    const arrayPayload = [
      { id: 'arr_1', name: 'Array Profile One', data: createSampleProfileData('One') },
      { id: 'arr_2', name: 'Array Profile Two', data: createSampleProfileData('Two') }
    ];

    const res = await importConfiguration(arrayPayload, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'array-of-profiles');
    assert.strictEqual(res.profilesImported, 2);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 2);
    assert.strictEqual(profiles[0].id, 'arr_1');
    assert.strictEqual(profiles[1].id, 'arr_2');
  });

  await it('2.4: Generic JSON format imports single business or map correctly', async () => {
    const singleBusiness = {
      businessName: 'Apex Cleaning Specialists',
      email: 'contact@apexcleaning.example.com',
      phone: '+1 800 555 0199'
    };

    const res = await importConfiguration(singleBusiness, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'generic-json');
    assert.strictEqual(res.profilesImported, 1);
    assert.strictEqual(res.activeProfileName, 'Apex Cleaning Specialists');
  });

  await it('2.5: Standard Plaintext Export/Import Round-Trip (Lossless Fidelity)', async () => {
    await resetStorage();

    const originalProfiles = [
      {
        id: 'prof_roundtrip_1',
        name: 'Primary HQ Profile',
        createdAt: 1710000000000,
        updatedAt: 1710000050000,
        data: createSampleProfileData('HQ')
      },
      {
        id: 'prof_roundtrip_2',
        name: 'Secondary Branch Profile',
        createdAt: 1710000100000,
        updatedAt: 1710000150000,
        data: createSampleProfileData('Branch')
      }
    ];

    await saveProfiles(originalProfiles);
    await setActiveProfileId('prof_roundtrip_2');
    await saveSettings({
      geminiApiKey: 'AIzaSyTEST_KEY_ROUNDTRIP_12345678',
      geminiModel: 'gemini-3.1-flash-lite'
    });

    const exported = await exportConfiguration({ includeApiKey: true });
    assert.strictEqual(exported.smartform_version, '1.0.0');
    assert.strictEqual(exported.activeProfileId, 'prof_roundtrip_2');
    assert.strictEqual(exported.profiles.length, 2);
    assert.strictEqual(exported.settings.geminiApiKey, 'AIzaSyTEST_KEY_ROUNDTRIP_12345678');

    await resetStorage();
    const wiped = await getProfiles();
    assert.strictEqual(wiped.length, 0);

    const importRes = await importConfiguration(exported, 'replace');
    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.profilesImported, 2);
    assert.strictEqual(importRes.activeProfileName, 'Secondary Branch Profile');

    const restoredProfiles = await getProfiles();
    assert.strictEqual(restoredProfiles.length, 2);

    for (let i = 0; i < originalProfiles.length; i++) {
      const orig = originalProfiles[i];
      const rest = restoredProfiles[i];
      assert.strictEqual(rest.id, orig.id);
      assert.strictEqual(rest.name, orig.name);
      assert.strictEqual(rest.createdAt, orig.createdAt);
      assert.strictEqual(rest.updatedAt, orig.updatedAt);
      assert.deepStrictEqual(rest.data, orig.data);
    }

    const restoredActiveId = await getActiveProfileId();
    assert.strictEqual(restoredActiveId, 'prof_roundtrip_2');

    const restoredSettings = await getSettings();
    assert.strictEqual(restoredSettings.geminiApiKey, 'AIzaSyTEST_KEY_ROUNDTRIP_12345678');
  });

  await it('2.6: Merge mode preserves existing profiles and appends new ones', async () => {
    await resetStorage();
    await saveProfiles([
      { id: 'existing_p1', name: 'Existing One', createdAt: 1, updatedAt: 1, data: createSampleProfileData('Existing') }
    ]);
    await setActiveProfileId('existing_p1');

    const newIncoming = {
      smartform_version: '1.0.0',
      profiles: [
        { id: 'incoming_p2', name: 'Incoming Two', createdAt: 2, updatedAt: 2, data: createSampleProfileData('Incoming') }
      ]
    };

    const res = await importConfiguration(newIncoming, 'merge');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 1);
    assert.strictEqual(res.modeApplied, 'merge');

    const combined = await getProfiles();
    assert.strictEqual(combined.length, 2);
    assert.strictEqual(combined[0].id, 'existing_p1');
    assert.strictEqual(combined[1].id, 'incoming_p2');
  });

  await it('2.7: Encrypted Vault Export & Import Round-trip with Passphrase', async () => {
    await resetStorage();
    const sampleProfiles = [
      { id: 'enc_p1', name: 'Encrypted Profile', createdAt: 100, updatedAt: 100, data: createSampleProfileData('Enc') }
    ];
    await saveProfiles(sampleProfiles);
    await setActiveProfileId('enc_p1');
    await saveSettings({ geminiApiKey: 'AIzaSySECRET_VAULT_KEY' });

    const passphrase = 'SuperStrongVaultPassphrase#2026';
    const encryptedExport = await exportConfiguration({
      includeApiKey: true,
      encrypt: true,
      passphrase
    });

    assert.ok(encryptedExport.format === 'smartform-encrypted-vault' || Boolean(encryptedExport.kdf));
    assert.strictEqual(detectFormat(encryptedExport), 'encrypted-vault');

    await resetStorage();

    const badPassRes = await importConfiguration(encryptedExport, 'replace', { passphrase: 'WrongPassword!' });
    assert.strictEqual(badPassRes.success, false);
    assert.strictEqual(badPassRes.needsPassword, true);

    const goodPassRes = await importConfiguration(encryptedExport, 'replace', { passphrase });
    assert.strictEqual(goodPassRes.success, true);
    assert.strictEqual(goodPassRes.profilesImported, 1);

    const restored = await getProfiles();
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].id, 'enc_p1');
    assert.deepStrictEqual(restored[0].data, sampleProfiles[0].data);

    const restoredSettings = await getSettings();
    assert.strictEqual(restoredSettings.geminiApiKey, 'AIzaSySECRET_VAULT_KEY');
  });
}

async function runSuite3LargeStressDatasets() {
  console.log('\n================================================================');
  console.log('SUITE 3: Large & Stress Datasets (500 Profiles, 10,000 Custom Fields)');
  console.log('================================================================');

  await resetStorage();

  const NUM_PROFILES = 500;
  const FIELDS_PER_PROFILE = 20;
  const TOTAL_CUSTOM_FIELDS = NUM_PROFILES * FIELDS_PER_PROFILE;

  console.log(`  Generating synthetic stress payload: ${NUM_PROFILES} profiles, ${TOTAL_CUSTOM_FIELDS} custom fields...`);
  const startTime = Date.now();
  const initialMem = process.memoryUsage().heapUsed;

  const largeProfiles = [];
  for (let i = 0; i < NUM_PROFILES; i++) {
    const customFields = [];
    for (let j = 0; j < FIELDS_PER_PROFILE; j++) {
      customFields.push({
        key: `custom_attribute_${i}_${j}`,
        value: `Value for attribute ${j} of profile ${i}: ` + 'X'.repeat(50),
        category: j % 2 === 0 ? 'compliance' : 'operational'
      });
    }

    const data = createSampleProfileData(`Stress_${i}`);
    data.customFields = customFields;

    largeProfiles.push({
      id: `stress_prof_${i}`,
      name: `Stress Profile #${i}`,
      createdAt: 1700000000000 + i * 1000,
      updatedAt: 1700000000000 + i * 1000 + 500,
      data
    });
  }

  const largePayload = {
    smartform_version: '1.0.0',
    exportedAt: new Date().toISOString(),
    activeProfileId: 'stress_prof_250',
    profiles: largeProfiles,
    settings: {
      geminiApiKey: 'AIzaSySTRESS_TEST_KEY_ALL_PROFILES',
      geminiModel: 'gemini-3.1-flash-lite'
    }
  };

  const payloadString = JSON.stringify(largePayload);
  const payloadSizeMB = (Buffer.byteLength(payloadString, 'utf8') / (1024 * 1024)).toFixed(2);
  console.log(`  Payload serialized: ${payloadSizeMB} MB in ${Date.now() - startTime}ms`);

  await it(`3.1: Import 500 profiles with 10,000 custom fields (${payloadSizeMB} MB) without OOM or stack overflow`, async () => {
    const t0 = Date.now();
    const res = await importConfiguration(payloadString, 'replace');
    const elapsed = Date.now() - t0;
    const finalMem = process.memoryUsage().heapUsed;
    const deltaMB = ((finalMem - initialMem) / (1024 * 1024)).toFixed(2);

    console.log(`  Import execution time: ${elapsed}ms | Heap delta: ${deltaMB} MB`);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, NUM_PROFILES);
    assert.strictEqual(res.activeProfileName, 'Stress Profile #250');
    assert.ok(elapsed < 15000, `Import took too long: ${elapsed}ms > 15000ms`);
  });

  await it('3.2: Verify data integrity of boundary and middle profiles (0, 249, 499)', async () => {
    const storedProfiles = await getProfiles();
    assert.strictEqual(storedProfiles.length, NUM_PROFILES);

    const checkIndices = [0, 249, 499];
    for (const idx of checkIndices) {
      const p = storedProfiles[idx];
      assert.strictEqual(p.id, `stress_prof_${idx}`);
      assert.strictEqual(p.name, `Stress Profile #${idx}`);
      assert.strictEqual(p.data.customFields.length, FIELDS_PER_PROFILE);
      assert.strictEqual(p.data.customFields[0].key, `custom_attribute_${idx}_0`);
      assert.strictEqual(p.data.customFields[FIELDS_PER_PROFILE - 1].key, `custom_attribute_${idx}_${FIELDS_PER_PROFILE - 1}`);
    }

    const activeId = await getActiveProfileId();
    assert.strictEqual(activeId, 'stress_prof_250');
  });

  await it('3.3: Exporter handles 500 profiles with 10,000 custom fields without failure', async () => {
    const t0 = Date.now();
    const exported = await exportConfiguration({ includeApiKey: true });
    const elapsed = Date.now() - t0;

    console.log(`  Export execution time: ${elapsed}ms`);
    assert.strictEqual(exported.smartform_version, '1.0.0');
    assert.strictEqual(exported.profiles.length, NUM_PROFILES);
    assert.strictEqual(exported.activeProfileId, 'stress_prof_250');
    assert.strictEqual(exported.settings.geminiApiKey, 'AIzaSySTRESS_TEST_KEY_ALL_PROFILES');
    assert.ok(elapsed < 10000, `Export took too long: ${elapsed}ms > 10000ms`);
  });
}

async function runSuite4AdversarialEdgeCases() {
  console.log('\n================================================================');
  console.log('SUITE 4: Adversarial Edge Cases in Legacy Profile Parsing');
  console.log('================================================================');

  await it('4.1: parseLegacyProfile handles empty, primitive, and null inputs', () => {
    const pNull = parseLegacyProfile(null);
    assert.ok(pNull.id.startsWith('prof_'));
    assert.strictEqual(pNull.name, 'Imported Profile');
    assert.strictEqual(pNull.data.businessName, 'Imported Profile');

    const pStr = parseLegacyProfile('random string');
    assert.ok(pStr.id.startsWith('prof_'));
    assert.strictEqual(pStr.name, 'Imported Profile');

    const pNum = parseLegacyProfile(42);
    assert.ok(pNum.id.startsWith('prof_'));
    assert.strictEqual(pNum.name, 'Imported Profile');
  });

  await it('4.2: parseLegacyProfile inferBusinessName handles bizarre website values without throwing', () => {
    const weirdWebsites = [
      'javascript:alert(1)',
      'data:text/html,test',
      'invalid-url-without-domain',
      '://missing-protocol',
      'https://',
      'http://localhost:3000',
      'https://sub.domain.company.com/path/to/page?param=1#hash',
      'www.acme-solutions.org'
    ];

    for (const site of weirdWebsites) {
      const profile = parseLegacyProfile({
        name: 'Personal',
        fields: [{ id: 'portfolio', name: 'Website', value: site }]
      });
      assert.ok(typeof profile.name === 'string');
      assert.ok(typeof profile.data.businessName === 'string');
      assert.ok(profile.data.businessName.length > 0);
    }
  });

  await it('4.3: FAQ parsing handles malformed Q&A blocks, missing answers, and multiline text', () => {
    const malformedFaq = `
      Just some random introductory text without questions
      Q) What is your pricing model? A) We charge flat rates.
      Q) Are you available weekends?
      Notice this question has no explicit A) delimiter here.
      Q) Last question? A) Simple answer.
    `;
    const profile = parseLegacyProfile({
      name: 'FAQ Test',
      fields: [{ id: 'faq', name: 'FAQ Block', value: malformedFaq }]
    });

    assert.ok(profile.data.faqs.length >= 3);
    const q1 = profile.data.faqs.find((f) => f.q.includes('pricing model'));
    assert.ok(q1);
    assert.strictEqual(q1.a, 'We charge flat rates.');
  });

  await it('4.4: Description parsing handles sentence splitting and character truncation boundaries', () => {
    // Exactly 140 chars (kept intact in short description)
    const desc140 = 'A'.repeat(140);
    const p140 = parseLegacyProfile({
      fields: [{ id: 'desc', name: 'Description', value: desc140 }]
    });
    assert.strictEqual(p140.data.descriptions.full, desc140);
    assert.strictEqual(p140.data.descriptions.short, desc140);

    // Over 140 chars (151 chars) with sentence period at position 39
    const descSentence = 'First short sentence about the company. ' + 'B'.repeat(111);
    assert.ok(descSentence.length > 140);
    const pSent = parseLegacyProfile({
      fields: [{ id: 'desc', name: 'Description', value: descSentence }]
    });
    assert.strictEqual(pSent.data.descriptions.short, 'First short sentence about the company.');

    // Over 140 chars without period (single long sentence takes firstSentence.trim() + '.')
    const descNoPeriod = 'C'.repeat(150);
    const pNoPeriod = parseLegacyProfile({
      fields: [{ id: 'desc', name: 'Description', value: descNoPeriod }]
    });
    assert.strictEqual(pNoPeriod.data.descriptions.short, 'C'.repeat(150) + '.');

    // Over 140 chars starting with delimiter (firstSentence is empty string, falls back to substring(0, 140))
    const descEmptyFirst = '. ' + 'D'.repeat(150);
    const pEmptyFirst = parseLegacyProfile({
      fields: [{ id: 'desc', name: 'Description', value: descEmptyFirst }]
    });
    assert.strictEqual(pEmptyFirst.data.descriptions.short, descEmptyFirst.substring(0, 140));
  });

  await it('4.5: Services parsing handles comma separated, newline separated, and mixed whitespace', () => {
    const rawServices = '  Window Cleaning , Carpet Shampooing\n Deep Sanitizing, \n\n Floor Polishing ,  ';
    const profile = parseLegacyProfile({
      fields: [{ id: 'services', name: 'Services Provided', value: rawServices }]
    });
    assert.deepStrictEqual(profile.data.services, [
      'Window Cleaning',
      'Carpet Shampooing',
      'Deep Sanitizing',
      'Floor Polishing'
    ]);
  });
}

async function main() {
  console.log('Starting Empirical Challenge: Wave 2 Utilities Verification...');
  const overallStart = Date.now();

  await runSuite1CorruptAdversarial();
  await runSuite2SchemaCompatibility();
  await runSuite3LargeStressDatasets();
  await runSuite4AdversarialEdgeCases();

  const totalTime = Date.now() - overallStart;
  console.log('\n================================================================');
  console.log(`CHALLENGE HARNESS COMPLETE: ${passed}/${total} passed in ${totalTime}ms`);
  console.log('================================================================');

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} CHALLENGE TEST(S) FAILED:`);
    for (const f of failures) {
      console.error(`  - ${f.desc}: ${f.err.message}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADVERSARIAL STRESS & EMPIRICAL CHALLENGES PASSED!');
  }
}

main().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
