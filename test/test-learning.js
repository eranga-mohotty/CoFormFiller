import assert from 'assert';
import {
  saveLearnedFieldToActiveProfile,
  createProfile,
  getActiveProfile,
  saveProfiles,
  setActiveProfileId
} from '../src/services/storage.js';
import { isLearnableField, isSensitiveField } from '../src/engine/scanner.js';

console.log('--- TEST 1: Storage saveLearnedFieldToActiveProfile ---');

// Setup mock profile
const testProfile = await createProfile('Test Profile', {
  business: { businessName: 'Test Inc' },
  customFields: [
    { key: 'Trading License', value: 'TL-12345', category: 'compliance' }
  ]
});

// 1. Add new learned field
const res1 = await saveLearnedFieldToActiveProfile('Direct Line', '+61 8 9999 0000');
assert.strictEqual(res1.success, true);
assert.strictEqual(res1.key, 'Direct Line');
assert.strictEqual(res1.value, '+61 8 9999 0000');

let updated = await getActiveProfile();
assert.strictEqual(updated.data.customFields.length, 2);
const directLine = updated.data.customFields.find((f) => f.key === 'Direct Line');
assert.ok(directLine, 'Direct Line should exist');
assert.strictEqual(directLine.value, '+61 8 9999 0000');
assert.strictEqual(directLine.category, 'learned');
console.log('✓ Successfully added new learned field');

// 2. Case-insensitive update of existing learned field
const res2 = await saveLearnedFieldToActiveProfile('direct line', '+61 8 1111 2222');
assert.strictEqual(res2.success, true);

updated = await getActiveProfile();
assert.strictEqual(updated.data.customFields.length, 2, 'Should update existing entry without duplicate');
const directLineUpdated = updated.data.customFields.find((f) => f.key.toLowerCase() === 'direct line');
assert.strictEqual(directLineUpdated.value, '+61 8 1111 2222');
console.log('✓ Successfully updated existing field case-insensitively');

// 3. Validation rejects empty keys or values
await assert.rejects(async () => {
  await saveLearnedFieldToActiveProfile('', 'Some value');
}, /Valid field key is required/);

await assert.rejects(async () => {
  await saveLearnedFieldToActiveProfile('Some Key', null);
}, /Field value is required/);
console.log('✓ Rejected invalid empty key and null value');


console.log('\n--- TEST 2: isLearnableField Security & Utility Guardrails ---');

// Mock element helper
function createMockEl(attrs = {}) {
  return {
    isConnected: true,
    type: attrs.type || 'text',
    name: attrs.name || '',
    id: attrs.id || '',
    autocomplete: attrs.autocomplete || '',
    placeholder: attrs.placeholder || '',
    getAttribute: (name) => attrs[name] || null
  };
}

// Positive cases: Safe business/personal fields
const safeFields = [
  { info: { label: 'Direct Office Line', type: 'tel' }, el: createMockEl({ type: 'tel', name: 'office_direct' }) },
  { info: { label: 'Years in Business', type: 'number' }, el: createMockEl({ type: 'number', name: 'years_active' }) },
  { info: { label: 'Emergency Contact Person', type: 'text' }, el: createMockEl({ type: 'text', name: 'emergency_name' }) },
  { info: { label: 'Preferred Contact Method', type: 'select-one' }, el: createMockEl({ type: 'select-one', name: 'contact_pref' }) }
];

for (const { info, el } of safeFields) {
  assert.strictEqual(isLearnableField(info, el), true, `Should allow safe field: "${info.label}"`);
}
console.log('✓ Allowed all safe business and personal fields');

// Negative cases 1: Sensitive security fields (passwords, cards, CVV, OTP)
const sensitiveFields = [
  { info: { label: 'Account Password', type: 'password' }, el: createMockEl({ type: 'password', name: 'pwd' }) },
  { info: { label: 'Credit Card Number', type: 'text' }, el: createMockEl({ name: 'card_number', autocomplete: 'cc-number' }) },
  { info: { label: 'Security Code (CVV)', type: 'text' }, el: createMockEl({ name: 'cvv', placeholder: '123' }) },
  { info: { label: 'One Time Password', type: 'text' }, el: createMockEl({ name: 'otp_code' }) },
  { info: { label: 'Social Security Number', type: 'text' }, el: createMockEl({ name: 'ssn' }) }
];

for (const { info, el } of sensitiveFields) {
  assert.strictEqual(isLearnableField(info, el), false, `Must reject sensitive field: "${info.label}"`);
}
console.log('✓ Successfully blocked sensitive password, payment, OTP, and SSN fields');

// Negative cases 2: Ephemeral/utility fields (search, captcha, discount code, terms checkbox)
const utilityFields = [
  { info: { label: 'Search Directory', type: 'search' }, el: createMockEl({ name: 'query', placeholder: 'Search...' }) },
  { info: { label: 'Enter Captcha Code', type: 'text' }, el: createMockEl({ name: 'captcha_val' }) },
  { info: { label: 'Promotional / Coupon Code', type: 'text' }, el: createMockEl({ name: 'promo_code' }) },
  { info: { label: 'I agree to the Terms & Conditions', type: 'checkbox' }, el: createMockEl({ type: 'checkbox', name: 'terms_agree' }) }
];

for (const { info, el } of utilityFields) {
  assert.strictEqual(isLearnableField(info, el), false, `Must reject utility field: "${info.label}"`);
}
console.log('✓ Successfully blocked ephemeral search, captcha, coupon, and terms agreement fields');

// Negative cases 3: Disconnected elements and invalid labels
assert.strictEqual(
  isLearnableField({ label: 'Valid Label' }, { isConnected: false, type: 'text' }),
  false,
  'Must reject disconnected element'
);
assert.strictEqual(
  isLearnableField({ label: 'A' }, createMockEl()),
  false,
  'Must reject label shorter than 2 chars'
);
assert.strictEqual(
  isLearnableField({ label: 'X'.repeat(95) }, createMockEl()),
  false,
  'Must reject label exceeding 90 chars'
);
console.log('✓ Successfully blocked disconnected elements and invalid label lengths');

console.log('\n✅ All Smart Learning Mode Tests Passed Successfully!');
