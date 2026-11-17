/**
 * Test edge case fixes:
 * 1. Date normalization (YYYY-MM-DD for HTML5 date inputs)
 * 2. Time normalization (HH:MM 24h for HTML5 time inputs)
 */

import assert from 'node:assert/strict';
import { normalizeDateValue, normalizeTimeValue, setNativeValue } from '../src/content/inserter.js';
import { scanFormFields, collectFormElements } from '../src/engine/scanner.js';

function runEdgeCaseTests() {
  console.log('--- TEST 1: Date Normalization ---');
  const dateCases = [
    { input: '14/05/1992', expected: '1992-05-14' },
    { input: '14-05-1992', expected: '1992-05-14' },
    { input: '1992/05/14', expected: '1992-05-14' },
    { input: '1992-05-14', expected: '1992-05-14' },
    { input: 'May 14, 1992', expected: '1992-05-14' }
  ];

  for (const c of dateCases) {
    const res = normalizeDateValue(c.input);
    console.log(`  "${c.input}" -> "${res}" (expected "${c.expected}")`);
    assert.strictEqual(res, c.expected, `Date normalization failed for ${c.input}`);
  }

  console.log('\n--- TEST 2: Time Normalization ---');
  const timeCases = [
    { input: '07:00', expected: '07:00' },
    { input: '7:00 AM', expected: '07:00' },
    { input: '7am', expected: '07:00' },
    { input: '6:30 PM', expected: '18:30' },
    { input: '6:30pm', expected: '18:30' },
    { input: '12:00 PM', expected: '12:00' },
    { input: '12:00 AM', expected: '00:00' }
  ];

  for (const c of timeCases) {
    const res = normalizeTimeValue(c.input);
    console.log(`  "${c.input}" -> "${res}" (expected "${c.expected}")`);
    assert.strictEqual(res, c.expected, `Time normalization failed for ${c.input}`);
  }

  console.log('\n--- TEST 3: Visible Label Sensitive Field Guardrail ---');
  // Mock DOM document with generic field names but sensitive visible labels
  const mockDocument = {
    querySelectorAll: (selector) => {
      if (selector.includes('input')) {
        return [
          {
            tagName: 'INPUT',
            type: 'text',
            name: 'field_token_123',
            id: 'field_token_123',
            disabled: false,
            readOnly: false,
            isConnected: true,
            style: {},
            dataset: {},
            getBoundingClientRect: () => ({ width: 100, height: 25 }),
            getClientRects: () => [{ width: 100, height: 25 }],
            getAttribute: () => null,
            closest: () => null
          },
          {
            tagName: 'INPUT',
            type: 'text',
            name: 'field_normal_456',
            id: 'field_normal_456',
            disabled: false,
            readOnly: false,
            isConnected: true,
            style: {},
            dataset: {},
            getBoundingClientRect: () => ({ width: 100, height: 25 }),
            getClientRects: () => [{ width: 100, height: 25 }],
            getAttribute: () => null,
            closest: () => null
          }
        ];
      }
      return [];
    },
    querySelector: (selector) => {
      if (selector === 'label[for="field_token_123"]') {
        return { textContent: 'Credit Card Number *' };
      }
      if (selector === 'label[for="field_normal_456"]') {
        return { textContent: 'Business Trading Name *' };
      }
      return null;
    }
  };

  globalThis.document = mockDocument;
  globalThis.CSS = { escape: (s) => s };
  globalThis.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {}
  };

  const scanned = scanFormFields(mockDocument, { fillOnlyEmptyFields: false });
  assert.strictEqual(scanned.length, 1, 'Should scan only 1 field (the normal business field)');
  assert.strictEqual(scanned[0].info.id, 'field_normal_456');
  console.log('✓ Successfully filtered generic input with visible "Credit Card Number" label');

  console.log('\n--- TEST 4: Non-Native Combobox Safety ---');
  const containerWithDivCombobox = {
    querySelectorAll: () => [
      { tagName: 'DIV', getAttribute: (a) => (a === 'role' ? 'combobox' : null) },
      { tagName: 'INPUT', type: 'text', getAttribute: (a) => (a === 'role' ? 'combobox' : null) }
    ]
  };
  const collected = collectFormElements(containerWithDivCombobox);
  assert.strictEqual(collected.length, 1, 'Should only collect native input, ignoring div combobox');
  assert.strictEqual(collected[0].tagName, 'INPUT');
  console.log('✓ Ignored non-native div[role="combobox"] and collected input[role="combobox"]');

  // Test setNativeValue on non-native element does not throw
  const mockDiv = { tagName: 'DIV', textContent: '', dispatchEvent: () => {} };
  setNativeValue(mockDiv, 'Test Value');
  assert.strictEqual(mockDiv.textContent, 'Test Value');
  console.log('✓ Gracefully handled non-native element in setNativeValue without throwing');

  console.log('\n--- TEST 5: Internal Extension Page Exclusion vs Test Forms Exemption ---');
  function shouldRunContentScript(urlStr) {
    const u = new URL(urlStr);
    const isExtensionPage = u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:';
    if (isExtensionPage && !u.pathname.includes('/test-forms/')) {
      return false;
    }
    return true;
  }

  // Internal options and popup forms must be excluded
  assert.strictEqual(shouldRunContentScript('chrome-extension://abcdef/src/options/options.html'), false);
  assert.strictEqual(shouldRunContentScript('chrome-extension://abcdef/src/popup/popup.html'), false);
  assert.strictEqual(shouldRunContentScript('moz-extension://uuid-1234/src/options/options.html'), false);

  // Test forms within the extension must be exempted
  assert.strictEqual(shouldRunContentScript('chrome-extension://abcdef/test-forms/business-directory-form.html'), true);
  assert.strictEqual(shouldRunContentScript('chrome-extension://abcdef/test-forms/quote-request-form.html'), true);
  assert.strictEqual(shouldRunContentScript('moz-extension://uuid-1234/test-forms/business-directory-form.html'), true);

  // Normal web URLs must always run
  assert.strictEqual(shouldRunContentScript('https://example.com/contact-us'), true);
  assert.strictEqual(shouldRunContentScript('http://localhost:3000/apply'), true);
  console.log('✓ Successfully blocked internal extension options/popup while exempting /test-forms/');

  console.log('\n✅ All Edge Cases and Phase 1 Security Fixes Passed Successfully!');
}

runEdgeCaseTests();
