/**
 * Empirical Challenge Harness (Round 2): Wave 2 Utilities
 * Targets:
 *   - src/utils/legacy-importer.ts
 *   - src/utils/importer.ts
 *   - src/utils/exporter.ts
 *
 * Suites:
 *   1. Corrupt & Adversarial Import Payloads
 *   2. Schema & Format Compatibility (v1, v2, array, generic, round-trip, ReDoS)
 *   3. Large & Stress Datasets (500 profiles, 10k fields, 1x10k profile, massive text)
 *   4. Data Integrity & Unicode/XSS Resistance
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
    console.error(`    ${err instanceof Error ? err.stack || err.message : String(err)}`);
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

// ============================================================================
// SUITE 1: Corrupt & Adversarial Import Payloads
// ============================================================================
async function runSuite1CorruptAdversarial() {
  console.log('\n================================================================');
  console.log('SUITE 1: Corrupt & Adversarial Import Payloads');
  console.log('================================================================');

  await resetStorage();

  await it('1.1: Truncated JSON input string returns graceful error without crashing', async () => {
    const brokenCases = [
      '{"smartform_version": "1.0.0", "profiles": [',
      '{"smartform_version": "1.0.0", "profiles": [{"id": "p1"',
      '{"settings": {"geminiApiKey": "AIzaSy',
      '{"activeProfileId": "p1'
    ];
    for (const broken of brokenCases) {
      const res = await importConfiguration(broken);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.2: Empty string and whitespace strings return graceful error', async () => {
    const emptyCases = ['', '   ', '\n\t  \r\n'];
    for (const empty of emptyCases) {
      const res = await importConfiguration(empty);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.3: Non-JSON raw strings (HTML, Shell, Markdown) return graceful error', async () => {
    const rawStrings = [
      '<html><head><title>Bad</title></head><body>Error 500</body></html>',
      '#!/bin/bash\necho "exploit"',
      '# Markdown header\n- List item 1\n- List item 2',
      'eval("alert(1)");',
      'SELECT * FROM profiles WHERE id = 1;'
    ];
    for (const s of rawStrings) {
      const res = await importConfiguration(s);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.4: Null, undefined, and non-object inputs return graceful error', async () => {
    const nonObjects = [null, undefined, 0, 42, -99.9, true, false, Symbol('test'), () => {}];
    for (const item of nonObjects) {
      const res = await importConfiguration(item);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.5: Stringified primitive values return graceful error', async () => {
    const primitives = ['null', 'undefined', 'true', 'false', '0', '12345', '-42.8', '"bare string"'];
    for (const prim of primitives) {
      const res = await importConfiguration(prim);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.toLowerCase().includes('invalid json format'));
    }
  });

  await it('1.6: Prototype pollution payloads do not pollute Object.prototype', async () => {
    const pollutionJson = JSON.stringify({
      smartform_version: '1.0.0',
      __proto__: { polluted: 'yes' },
      constructor: { prototype: { polluted2: 'yes' } },
      profiles: [
        {
          id: 'p_safe',
          name: 'Safe Profile',
          __proto__: { profilePollution: 'yes' },
          data: {
            businessName: 'Safe Biz',
            __proto__: { dataPollution: 'yes' }
          }
        }
      ]
    });

    const res = await importConfiguration(pollutionJson, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 1);

    // Verify global prototype is not polluted
    const cleanObj = {};
    assert.strictEqual(cleanObj['polluted'], undefined);
    assert.strictEqual(cleanObj['polluted2'], undefined);
    assert.strictEqual(cleanObj['profilePollution'], undefined);
    assert.strictEqual(cleanObj['dataPollution'], undefined);
  });

  await it('1.7: Missing or invalid version and profiles fields surface gracefully without crashing', async () => {
    // Native payloads with missing or invalid profiles return domain error
    const nativeMissingProfiles = [
      { smartform_version: '1.0.0' },
      { smartform_version: '1.0.0', profiles: null },
      { smartform_version: '1.0.0', profiles: 12345 },
      { smartform_version: '1.0.0', profiles: 'not an array' },
      { smartform_version: '1.0.0', profiles: true },
      { smartform_version: '1.0.0', profiles: [] }
    ];

    for (const payload of nativeMissingProfiles) {
      const res = await importConfiguration(payload);
      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('Could not extract any profiles'));
    }

    // Generic JSON payload (empty object or non-native) falls back gracefully to single knowledge base profile
    const genericRes = await importConfiguration({});
    assert.strictEqual(genericRes.success, true);
    assert.strictEqual(genericRes.formatDetected, 'generic-json');
    assert.strictEqual(genericRes.profilesImported, 1);
    assert.strictEqual(genericRes.activeProfileName, 'Imported Knowledge Base');
  });

  await it('1.8: Corrupted profile elements in array are safely handled or filtered without crashing', async () => {
    const dirtyPayload = {
      smartform_version: '1.0.0',
      profiles: [
        null,
        undefined,
        12345,
        'string element',
        true,
        {}, // empty profile object normalized with fallback values
        { id: 'clean_1', name: 'Clean Profile', data: { businessName: 'Clean Co' } }
      ]
    };

    const res = await importConfiguration(dirtyPayload, 'replace');
    assert.strictEqual(res.success, true);
    // Non-objects are filtered out; empty object {} normalized into a profile
    assert.strictEqual(res.profilesImported, 2);
    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 2);
    assert.ok(profiles[0].id.startsWith('prof_'));
    assert.strictEqual(profiles[0].name, 'Imported Profile');
    assert.strictEqual(profiles[1].id, 'clean_1');
    assert.strictEqual(profiles[1].name, 'Clean Profile');
  });

  await it('1.9: Profiles with invalid date timestamps and negative values handle gracefully', async () => {
    const timestampEdgeCases = {
      smartform_version: '1.0.0',
      profiles: [
        { id: 'ts_str', name: 'Timestamp String', createdAt: '2026-01-01', updatedAt: '2026-02-01', data: {} },
        { id: 'ts_neg', name: 'Timestamp Negative', createdAt: -1e9, updatedAt: -5e8, data: {} },
        { id: 'ts_flt', name: 'Timestamp Float', createdAt: 1710000000.12345, updatedAt: 1710000001.99, data: {} },
        { id: 'ts_null', name: 'Timestamp Null', createdAt: null, updatedAt: undefined, data: {} }
      ]
    };

    const res = await importConfiguration(timestampEdgeCases, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 4);

    const stored = await getProfiles();
    assert.strictEqual(stored.length, 4);
    for (const p of stored) {
      assert.ok(typeof p.createdAt === 'number', `Profile ${p.id} createdAt should be number`);
      assert.ok(!Number.isNaN(p.createdAt), `Profile ${p.id} createdAt should not be NaN`);
      assert.ok(typeof p.updatedAt === 'number', `Profile ${p.id} updatedAt should be number`);
      assert.ok(!Number.isNaN(p.updatedAt), `Profile ${p.id} updatedAt should not be NaN`);
    }

    // Verify negative timestamp is preserved
    const negProfile = stored.find((p) => p.id === 'ts_neg');
    assert.strictEqual(negProfile.createdAt, -1e9);

    // Verify null timestamp safely defaulted to current timestamp number
    const nullProfile = stored.find((p) => p.id === 'ts_null');
    assert.ok(nullProfile.createdAt > 1700000000000);
  });

  await it('1.10: Encrypted vault payload error handling (tampered ciphertext / missing salt)', async () => {
    // Missing passphrase
    const vaultMissingPw = {
      format: 'smartform-encrypted-vault',
      kdf: { name: 'PBKDF2', salt: 'AAAA', iterations: 100000 },
      iv: 'AAAA',
      ciphertext: 'AAAA'
    };
    const r1 = await importConfiguration(vaultMissingPw);
    assert.strictEqual(r1.success, false);
    assert.strictEqual(r1.needsPassword, true);

    // Wrong passphrase
    const validVault = await exportConfiguration({ passphrase: 'MySecretPassword#123', encrypt: true });
    const r2 = await importConfiguration(validVault, 'replace', { passphrase: 'WrongPassword!' });
    assert.strictEqual(r2.success, false);
    assert.strictEqual(r2.needsPassword, true);

    // Corrupted ciphertext with correct passphrase
    const tamperedVault = JSON.parse(JSON.stringify(validVault));
    tamperedVault.ciphertext = 'CORRUPTED_BASE64_CIPHERTEXT_XYZ123';
    const r3 = await importConfiguration(tamperedVault, 'replace', { passphrase: 'MySecretPassword#123' });
    assert.strictEqual(r3.success, false);
    assert.ok(r3.message.toLowerCase().includes('password') || r3.error?.includes('Decryption failed'));
  });
}

// ============================================================================
// SUITE 2: Schema & Format Compatibility
// ============================================================================
async function runSuite2SchemaCompatibility() {
  console.log('\n================================================================');
  console.log('SUITE 2: Schema & Format Compatibility');
  console.log('================================================================');

  await resetStorage();

  await it('2.1: Legacy v1 format (array of fields) with contact, address, faqs, hours', async () => {
    const v1Data = {
      local: {
        activeFlexibleProfileId: 'leg_v1_001',
        flexibleProfiles: [
          {
            id: 'leg_v1_001',
            name: 'Personal',
            createdAt: '2025-01-15T08:30:00Z',
            updatedAt: '2025-01-16T09:45:00Z',
            fields: [
              { id: 'firstname', name: 'First Name', value: 'Sherlock' },
              { id: 'lastname', name: 'Last Name', value: 'Holmes' },
              { id: 'fullname', name: 'Full Name', value: 'Sherlock Holmes' },
              { id: 'email', name: 'Email Address', value: 'sherlock@bakerstreet.co.uk' },
              { id: 'tel', name: 'Phone', value: '+44 20 7224 3688' },
              { id: 'website', name: 'Website', value: 'https://bakerstreetconsulting.co.uk' },
              { id: 'address', name: 'Address', value: '221B Baker St' },
              { id: 'city', name: 'City', value: 'London' },
              { id: 'postcode', name: 'Postcode', value: 'NW1 6XE' },
              { id: 'country', name: 'Country', value: 'United Kingdom' },
              { id: 'services', name: 'Services Provided', value: 'Consulting Detective, Deduction, Forensics' },
              { id: 'hours', name: 'Opening Hours', value: '24/7 By Appointment' },
              { id: 'faq', name: 'FAQs', value: 'Q) How do you solve crimes? A) Elementary, my dear Watson.\nQ) Do you take cases? A) If interesting.' },
              { id: 'description', name: 'About', value: 'The world\'s only consulting detective.' }
            ]
          }
        ]
      }
    };

    const res = await importConfiguration(v1Data, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'legacy-extension');
    assert.strictEqual(res.profilesImported, 1);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    const p = profiles[0];
    assert.strictEqual(p.id, 'leg_v1_001');
    assert.strictEqual(p.name, 'Bakerstreetconsulting Profile');
    assert.strictEqual(p.data.firstName, 'Sherlock');
    assert.strictEqual(p.data.lastName, 'Holmes');
    assert.strictEqual(p.data.contactName, 'Sherlock Holmes');
    assert.strictEqual(p.data.email, 'sherlock@bakerstreet.co.uk');
    assert.strictEqual(p.data.phone, '+44 20 7224 3688');
    assert.strictEqual(p.data.address.street, '221B Baker St');
    assert.strictEqual(p.data.address.city, 'London');
    assert.strictEqual(p.data.address.postalCode, 'NW1 6XE');
    assert.strictEqual(p.data.address.country, 'United Kingdom');
    assert.deepStrictEqual(p.data.services, ['Consulting Detective', 'Deduction', 'Forensics']);
    assert.strictEqual(p.data.faqs.length, 2);
    assert.strictEqual(p.data.faqs[0].q, 'How do you solve crimes?');
    assert.strictEqual(p.data.faqs[0].a, 'Elementary, my dear Watson.');
    assert.strictEqual(p.data.openingHours.rawHoursText, '24/7 By Appointment');
    assert.strictEqual(p.data.descriptions.full, 'The world\'s only consulting detective.');
  });

  await it('2.2: Legacy v2 format (keyed object map of fields) and BYOK settings', async () => {
    const v2Data = {
      local: {
        activeFlexibleProfileId: 'leg_v2_002',
        'byok-v2': {
          ai_provider: 'google',
          google_api_key: 'AIzaSyTEST_KEY_LEGACY_V2_9999',
          model: 'gemini-1.5-flash'
        },
        flexibleProfiles: [
          {
            id: 'leg_v2_002',
            name: 'Baker Street Investigations',
            createdAt: 1720000000000,
            updatedAt: 1720000100000,
            fields: {
              '0': { id: 'fullname', name: 'Full Name', value: 'John H. Watson' },
              '1': { id: 'email', name: 'Email Address', value: 'watson@bakerstreet.co.uk' },
              '2': { id: 'c_title', name: 'Title', value: 'Medical Doctor & Chronicler' }
            }
          }
        ]
      }
    };

    const res = await importConfiguration(v2Data, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.formatDetected, 'legacy-extension');
    assert.strictEqual(res.profilesImported, 1);
    assert.strictEqual(res.apiKeyDetected, true);

    const profiles = await getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].id, 'leg_v2_002');
    assert.strictEqual(profiles[0].name, 'Baker Street Investigations');
    assert.strictEqual(profiles[0].data.contactName, 'John H. Watson');

    const settings = await getSettings();
    assert.strictEqual(settings.geminiApiKey, 'AIzaSyTEST_KEY_LEGACY_V2_9999');
    assert.strictEqual(settings.geminiModel, 'gemini-3.8-flash');
  });

  await it('2.3: ReDoS stress test on parseLegacyProfile FAQ parser', () => {
    // Adversarial string with repeated "Q)" prefixes and no matching "A)"
    const evilFaq = 'Q) '.repeat(2000) + 'Some arbitrary question text here without answers';
    const t0 = Date.now();
    const parsed = parseLegacyProfile({
      fields: [{ id: 'faq', name: 'FAQ Block', value: evilFaq }]
    });
    const elapsed = Date.now() - t0;
    console.log(`    ReDoS parse time for 2000 Q) blocks: ${elapsed}ms`);
    assert.ok(elapsed < 2000, `ReDoS took too long: ${elapsed}ms > 2000ms`);
    assert.ok(parsed.data.faqs.length > 0);
  });

  await it('2.4: Website domain inferencer resilience with bizarre URLs', () => {
    const weirdUrls = [
      'https://',
      'http://',
      'localhost:8080',
      'https://user:pass@domain.com:8080/path',
      'https://192.168.1.1/admin',
      'not a url at all !!!',
      'http://[::1]:8080/',
      'https://sub-domain.deep.nested.example.co.uk/path?q=1#hash',
      'X'.repeat(5000)
    ];

    for (const url of weirdUrls) {
      const p = parseLegacyProfile({
        name: 'Personal',
        fields: [{ id: 'website', name: 'Website', value: url }]
      });
      assert.ok(typeof p.name === 'string');
      assert.ok(p.name.length > 0);
      assert.ok(typeof p.data.businessName === 'string');
      assert.ok(p.data.businessName.length > 0);
    }
  });

  await it('2.5: Lossless Plaintext Round-Trip (Export -> Import -> Verify)', async () => {
    await resetStorage();

    const originalProfiles = [
      {
        id: 'prof_lossless_1',
        name: 'Alpha Clean HQ',
        createdAt: 1715000000000,
        updatedAt: 1715000060000,
        data: createSampleProfileData('Alpha')
      },
      {
        id: 'prof_lossless_2',
        name: 'Beta Clean Branch',
        createdAt: 1715000100000,
        updatedAt: 1715000160000,
        data: createSampleProfileData('Beta')
      }
    ];

    await saveProfiles(originalProfiles);
    await setActiveProfileId('prof_lossless_2');
    await saveSettings({
      geminiApiKey: 'AIzaSyLOSSLESS_ROUNDTRIP_KEY_444',
      geminiModel: 'gemini-3.8-flash'
    });

    const exported = await exportConfiguration({ includeApiKey: true });
    assert.strictEqual(exported.smartform_version, '1.0.0');
    assert.strictEqual(exported.activeProfileId, 'prof_lossless_2');
    assert.strictEqual(exported.profiles.length, 2);

    await resetStorage();
    const emptyCheck = await getProfiles();
    assert.strictEqual(emptyCheck.length, 0);

    const importRes = await importConfiguration(exported, 'replace');
    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.profilesImported, 2);

    const reimportedProfiles = await getProfiles();
    assert.strictEqual(reimportedProfiles.length, 2);

    for (let i = 0; i < originalProfiles.length; i++) {
      const orig = originalProfiles[i];
      const reimp = reimportedProfiles[i];
      assert.strictEqual(reimp.id, orig.id);
      assert.strictEqual(reimp.name, orig.name);
      assert.strictEqual(reimp.createdAt, orig.createdAt);
      assert.strictEqual(reimp.updatedAt, orig.updatedAt);
      assert.deepStrictEqual(reimp.data, orig.data);
    }

    const reimportedActiveId = await getActiveProfileId();
    assert.strictEqual(reimportedActiveId, 'prof_lossless_2');

    const reimportedSettings = await getSettings();
    assert.strictEqual(reimportedSettings.geminiApiKey, 'AIzaSyLOSSLESS_ROUNDTRIP_KEY_444');
  });

  await it('2.6: Exporter sanitization without includeApiKey excludes secret keys', async () => {
    await resetStorage();
    await saveSettings({
      geminiApiKey: 'AIzaSySECRET_GEMINI',
      openaiApiKey: 'sk-SECRET_OPENAI',
      claudeApiKey: 'sk-ant-SECRET_CLAUDE',
      customHeaders: 'Authorization: Bearer SECRET'
    });

    const exportedUnsafe = await exportConfiguration({ includeApiKey: false });
    assert.strictEqual(exportedUnsafe.settings.geminiApiKey, '');
    assert.strictEqual(exportedUnsafe.settings.openaiApiKey, '');
    assert.strictEqual(exportedUnsafe.settings.claudeApiKey, '');
    assert.strictEqual(exportedUnsafe.settings.customHeaders, '');

    const exportedSafe = await exportConfiguration({ includeApiKey: true });
    assert.strictEqual(exportedSafe.settings.geminiApiKey, 'AIzaSySECRET_GEMINI');
    assert.strictEqual(exportedSafe.settings.openaiApiKey, 'sk-SECRET_OPENAI');
    assert.strictEqual(exportedSafe.settings.claudeApiKey, 'sk-ant-SECRET_CLAUDE');
    assert.strictEqual(exportedSafe.settings.customHeaders, 'Authorization: Bearer SECRET');
  });

  await it('2.7: Merge mode does not overwrite existing profiles with duplicate IDs', async () => {
    await resetStorage();
    await saveProfiles([
      { id: 'p_original', name: 'Original Profile', createdAt: 10, updatedAt: 10, data: createSampleProfileData('Orig') }
    ]);

    const newIncoming = {
      smartform_version: '1.0.0',
      profiles: [
        { id: 'p_new', name: 'New Profile', createdAt: 20, updatedAt: 20, data: createSampleProfileData('New') }
      ]
    };

    const res = await importConfiguration(newIncoming, 'merge');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.modeApplied, 'merge');

    const combined = await getProfiles();
    assert.strictEqual(combined.length, 2);
    assert.strictEqual(combined[0].id, 'p_original');
    assert.strictEqual(combined[1].id, 'p_new');
  });
}

// ============================================================================
// SUITE 3: Large & Stress Datasets
// ============================================================================
async function runSuite3LargeStressDatasets() {
  console.log('\n================================================================');
  console.log('SUITE 3: Large & Stress Datasets');
  console.log('================================================================');

  await resetStorage();

  const NUM_PROFILES = 500;
  const FIELDS_PER_PROFILE = 20;
  const TOTAL_FIELDS = NUM_PROFILES * FIELDS_PER_PROFILE;

  await it(`3.1: Import 500 profiles with ${TOTAL_FIELDS} custom fields without OOM/stack overflow`, async () => {
    console.log(`    Generating ${NUM_PROFILES} profiles with ${FIELDS_PER_PROFILE} fields each...`);
    const profiles = [];
    for (let i = 0; i < NUM_PROFILES; i++) {
      const cFields = [];
      for (let j = 0; j < FIELDS_PER_PROFILE; j++) {
        cFields.push({
          key: `field_${i}_${j}`,
          value: `Custom field value ${j} for profile ${i}`,
          category: 'stress'
        });
      }
      const data = createSampleProfileData(`Stress_${i}`);
      data.customFields = cFields;
      profiles.push({
        id: `stress_p_${i}`,
        name: `Stress Profile #${i}`,
        createdAt: 1700000000000 + i,
        updatedAt: 1700000000000 + i,
        data
      });
    }

    const payload = {
      smartform_version: '1.0.0',
      activeProfileId: 'stress_p_250',
      profiles,
      settings: { geminiApiKey: 'AIzaSySTRESS_KEY_500' }
    };

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    const res = await importConfiguration(payload, 'replace');
    const elapsed = Date.now() - t0;
    const memDeltaMb = ((process.memoryUsage().heapUsed - memBefore) / 1024 / 1024).toFixed(2);

    console.log(`    Import 500 profiles completed in ${elapsed}ms | Heap delta: ${memDeltaMb} MB`);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 500);
    assert.strictEqual(res.activeProfileName, 'Stress Profile #250');
    assert.ok(elapsed < 15000, `Import took too long: ${elapsed}ms > 15000ms`);

    const stored = await getProfiles();
    assert.strictEqual(stored.length, 500);
    assert.strictEqual(stored[0].id, 'stress_p_0');
    assert.strictEqual(stored[499].id, 'stress_p_499');
  });

  await it('3.2: Exporter handles 500 profiles without OOM or serialization failure', async () => {
    const t0 = Date.now();
    const exported = await exportConfiguration({ includeApiKey: true });
    const elapsed = Date.now() - t0;

    console.log(`    Export 500 profiles completed in ${elapsed}ms`);
    assert.strictEqual(exported.smartform_version, '1.0.0');
    assert.strictEqual(exported.profiles.length, 500);
    assert.strictEqual(exported.activeProfileId, 'stress_p_250');
    assert.ok(elapsed < 10000, `Export took too long: ${elapsed}ms > 10000ms`);
  });

  await it('3.3: Single Profile with 10,000 custom fields parses and imports cleanly', async () => {
    await resetStorage();

    const megaFields = [];
    for (let k = 0; k < 10000; k++) {
      megaFields.push({
        key: `mega_attr_${k}`,
        value: `Mega attribute test value #${k}`,
        category: 'mega'
      });
    }

    const megaProfile = {
      id: 'mega_prof_001',
      name: 'Mega Enterprise Knowledge Base',
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
      data: {
        ...createSampleProfileData('Mega'),
        customFields: megaFields
      }
    };

    const payload = {
      smartform_version: '1.0.0',
      activeProfileId: 'mega_prof_001',
      profiles: [megaProfile]
    };

    const t0 = Date.now();
    const res = await importConfiguration(payload, 'replace');
    const elapsed = Date.now() - t0;

    console.log(`    Import 1 profile with 10k custom fields in ${elapsed}ms`);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.profilesImported, 1);

    const stored = await getProfiles();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].data.customFields.length, 10000);
    assert.strictEqual(stored[0].data.customFields[9999].key, 'mega_attr_9999');
  });

  await it('3.4: Massive text payloads (100KB description and 500 FAQs) without overflow', async () => {
    await resetStorage();

    const massiveDescription = 'A'.repeat(100000);
    const massiveFaqs = [];
    for (let f = 0; f < 500; f++) {
      massiveFaqs.push({
        q: `Question #${f} ${'Q'.repeat(50)}?`,
        a: `Answer #${f} ${'A'.repeat(100)}.`
      });
    }

    const massiveProfile = {
      id: 'massive_prof_001',
      name: 'Massive Text Profile',
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
      data: {
        ...createSampleProfileData('Massive'),
        descriptions: {
          short: 'Short summary',
          full: massiveDescription,
          tagline: 'Tagline'
        },
        faqs: massiveFaqs
      }
    };

    const payload = {
      smartform_version: '1.0.0',
      profiles: [massiveProfile]
    };

    const res = await importConfiguration(payload, 'replace');
    assert.strictEqual(res.success, true);

    const stored = await getProfiles();
    assert.strictEqual(stored[0].data.descriptions.full.length, 100000);
    assert.strictEqual(stored[0].data.faqs.length, 500);
  });
}

// ============================================================================
// SUITE 4: Data Integrity, Unicode & Security
// ============================================================================
async function runSuite4DataIntegrityAndSecurity() {
  console.log('\n================================================================');
  console.log('SUITE 4: Data Integrity, Unicode & Security');
  console.log('================================================================');

  await resetStorage();

  await it('4.1: Unicode, Emojis, RTL text and Multilingual Scripts preserved losslessly', async () => {
    const unicodeData = {
      businessName: '株式会社クリーン 🌟 (Clean Inc.)',
      tradingName: 'تنظيف المستقبل (Future Cleaning) 🚀',
      contactName: 'Éléonore-Marie d\'Hôtel-Dieu 🌺',
      firstName: 'Éléonore-Marie',
      lastName: 'd\'Hôtel-Dieu',
      email: 'élégant@example.com',
      phone: '+33 1 42 68 55 00',
      mobile: '+33 6 12 34 56 78',
      website: 'https://xn--e1afmkfd.xn--p1ai', // Punycode
      address: {
        street: 'Улица Ленина, д. 42, кв. 7',
        city: 'Москва',
        state: 'Московская область',
        postalCode: '101000',
        country: 'Россия'
      },
      services: ['Офисный клининг', 'Limpieza profunda 🧹', '窓拭き (Window Cleaning)'],
      openingHours: {
        monday: { open: '08:00', close: '20:00', closed: false },
        tuesday: { open: '08:00', close: '20:00', closed: false },
        wednesday: { open: '08:00', close: '20:00', closed: false },
        thursday: { open: '08:00', close: '20:00', closed: false },
        friday: { open: '08:00', close: '20:00', closed: false },
        saturday: { open: '09:00', close: '18:00', closed: false },
        sunday: { open: '', close: '', closed: true, onCall24_7: true },
        alwaysOpen: false,
        rawHoursText: 'Пн-Пт: 8:00-20:00, Сб: 9:00-18:00'
      },
      descriptions: {
        short: 'الخدمة الأفضل في تنظيف المكاتب والمنازل',
        full: 'Полный комплекс услуг по профессиональной уборке помещений любой сложности.',
        tagline: '✨ Чистота — залог успеха! ✨'
      },
      faqs: [
        { q: 'Сколько стоит уборка?', a: 'От 5000 рублей в зависимости от площади.' }
      ],
      customFields: [
        { key: 'ИНН / КПП', value: '7701234567 / 770101001', category: 'реквизиты' },
        { key: 'Emoji Key 🎯', value: 'Values with emojis 🍕🌮🎉 and newlines\nLine 2\r\nLine 3', category: 'fun' }
      ]
    };

    const profile = {
      id: 'prof_unicode_001',
      name: 'Unicode & Multilingual Profile',
      createdAt: 1718000000000,
      updatedAt: 1718000000000,
      data: unicodeData
    };

    await saveProfiles([profile]);
    await setActiveProfileId('prof_unicode_001');

    const exported = await exportConfiguration();
    await resetStorage();

    const importRes = await importConfiguration(exported, 'replace');
    assert.strictEqual(importRes.success, true);

    const reimported = await getProfiles();
    assert.strictEqual(reimported.length, 1);
    assert.deepStrictEqual(reimported[0].data, unicodeData);
  });

  await it('4.2: HTML and Script injection strings stored safely without execution or stripping', async () => {
    const xssPayload = {
      businessName: '<script>alert("xss")</script>',
      contactName: '"><img src=x onerror=alert(1)>',
      email: 'test+<script>@example.com',
      descriptions: {
        short: '<svg onload=alert(document.domain)>',
        full: '<iframe src="javascript:alert(1)"></iframe>',
        tagline: 'javascript:void(0)'
      },
      faqs: [
        { q: '<a href="javascript:alert(1)">Click me</a>', a: '<b>Bold</b> and <script>bad</script>' }
      ],
      customFields: [
        { key: 'onload', value: 'alert(1)', category: '<evil>' }
      ]
    };

    const profile = {
      id: 'prof_xss_001',
      name: 'XSS Test Profile',
      createdAt: 1718000000000,
      updatedAt: 1718000000000,
      data: {
        ...createSampleProfileData('XSS'),
        ...xssPayload
      }
    };

    await saveProfiles([profile]);
    const exported = await exportConfiguration();
    await resetStorage();

    const importRes = await importConfiguration(exported, 'replace');
    assert.strictEqual(importRes.success, true);

    const stored = await getProfiles();
    assert.strictEqual(stored[0].data.businessName, '<script>alert("xss")</script>');
    assert.strictEqual(stored[0].data.contactName, '"><img src=x onerror=alert(1)>');
    assert.strictEqual(stored[0].data.descriptions.short, '<svg onload=alert(document.domain)>');
  });

  await it('4.3: Active profile fallback when activeProfileId in payload is invalid or absent', async () => {
    await resetStorage();

    const payload = {
      smartform_version: '1.0.0',
      activeProfileId: 'non_existent_profile_id_9999',
      profiles: [
        { id: 'first_p', name: 'First Profile', createdAt: 1, updatedAt: 1, data: createSampleProfileData('1') },
        { id: 'second_p', name: 'Second Profile', createdAt: 2, updatedAt: 2, data: createSampleProfileData('2') }
      ]
    };

    const res = await importConfiguration(payload, 'replace');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.activeProfileName, 'First Profile');

    const activeId = await getActiveProfileId();
    assert.strictEqual(activeId, 'first_p');
  });
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('Starting Empirical Challenge: Wave 2 Utilities (Round 2)...');
  const tStart = Date.now();

  await runSuite1CorruptAdversarial();
  await runSuite2SchemaCompatibility();
  await runSuite3LargeStressDatasets();
  await runSuite4DataIntegrityAndSecurity();

  const totalTime = Date.now() - tStart;
  console.log('\n================================================================');
  console.log(`ROUND 2 CHALLENGE HARNESS COMPLETE: ${passed}/${total} passed in ${totalTime}ms`);
  console.log('================================================================');

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} CHALLENGE TEST(S) FAILED:`);
    for (const f of failures) {
      console.error(`  - ${f.desc}: ${f.err?.message || f.err}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ROUND 2 ADVERSARIAL STRESS & EMPIRICAL CHALLENGES PASSED!');
  }
}

main().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
