/**
 * Empirical Challenger Test Suite: Options Dashboard Controllers & MV3 Security
 *
 * Exhaustively stress-tests:
 * 1. Modularization & Re-Export Barrel Integrity (vault, profiles, ai, preferences, logs, tab)
 * 2. Opening Hours Parsing, Normalization & Collection (profiles-form.ts)
 * 3. Raw JSON Editor Formatting, Application & Error Trapping (profiles-json.ts)
 * 4. Profile Collections Management (Services, FAQs, Custom Fields DOM mutations)
 * 5. Multi-Provider AI Form & Controller (Presets, Sanitized Timeouts, Origin Tips, Connection Test)
 * 6. Vault Controller & UI Status Rendering (AES-256-GCM Badge, Strength, Form Toggles)
 * 7. Configuration Import/Export Round-Trip & Safe DOM Construction (import-export-controller.ts)
 * 8. Security Audit: Full codebase scan for unsafe DOM sinks (innerHTML, outerHTML, document.write, eval)
 * 9. Clean Code Physical Limits: wc -l <= 200 lines, function lengths <= 40 lines
 * 10. Adversarial Stress Cases: Malformed payloads, prototype pollution, huge inputs, empty forms
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// --- MOCK DOM INFRASTRUCTURE ---

class MockClassList {
  constructor(element) {
    this._el = element;
  }

  _getClasses() {
    return new Set((this._el.className || '').split(/\s+/).filter(Boolean));
  }

  _setClasses(set) {
    this._el.className = Array.from(set).join(' ');
  }

  add(...classes) {
    const set = this._getClasses();
    classes.forEach(c => set.add(c));
    this._setClasses(set);
  }

  remove(...classes) {
    const set = this._getClasses();
    classes.forEach(c => set.delete(c));
    this._setClasses(set);
  }

  toggle(cls, force) {
    const set = this._getClasses();
    let result;
    if (force === true) {
      set.add(cls);
      result = true;
    } else if (force === false) {
      set.delete(cls);
      result = false;
    } else if (set.has(cls)) {
      set.delete(cls);
      result = false;
    } else {
      set.add(cls);
      result = true;
    }
    this._setClasses(set);
    return result;
  }

  contains(cls) {
    return this._getClasses().has(cls);
  }
}

function createMockElement(tagName = 'div', initialAttrs = {}) {
  const children = [];
  const listeners = {};
  const attrs = { ...initialAttrs };

  const el = {
    tagName: tagName.toUpperCase(),
    id: attrs.id || '',
    className: attrs.className || '',
    textContent: attrs.textContent || '',
    value: attrs.value || '',
    checked: Boolean(attrs.checked),
    disabled: Boolean(attrs.disabled),
    type: attrs.type || (tagName === 'input' ? 'text' : ''),
    placeholder: attrs.placeholder || '',
    title: attrs.title || '',
    selected: Boolean(attrs.selected),
    rows: attrs.rows || 2,
    isConnected: true,
    style: {},
    children,
    childNodes: children,
    parentNode: null,

    appendChild(child) {
      if (child.parentNode && child.parentNode.children) {
        const idx = child.parentNode.children.indexOf(child);
        if (idx !== -1) child.parentNode.children.splice(idx, 1);
      }
      child.parentNode = el;
      children.push(child);
      return child;
    },

    append(...items) {
      for (const item of items) {
        if (typeof item === 'string') {
          el.appendChild({ textContent: item, parentNode: el });
        } else if (item) {
          el.appendChild(item);
        }
      }
    },

    replaceChildren(...items) {
      children.length = 0;
      el.append(...items);
    },

    remove() {
      el.isConnected = false;
      if (el.parentNode && el.parentNode.children) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx !== -1) el.parentNode.children.splice(idx, 1);
      }
      el.parentNode = null;
    },

    addEventListener(event, handler) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },

    removeEventListener(event, handler) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    },

    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const ev = typeof event === 'string' ? { type, target: el, preventDefault: () => {}, stopPropagation: () => {} } : { ...event, target: el };
      const handlers = listeners[type] ? [...listeners[type]] : [];
      for (const fn of handlers) {
        fn(ev);
      }
    },

    click() {
      el.dispatchEvent('click');
    },

    focus() {},
    scrollIntoView() {},

    getAttribute(name) {
      return attrs[name] !== undefined ? String(attrs[name]) : null;
    },

    setAttribute(name, val) {
      attrs[name] = String(val);
      if (name === 'id') el.id = String(val);
      if (name === 'class') el.className = String(val);
    },

    querySelector(selector) {
      const matched = el.querySelectorAll(selector);
      return matched.length > 0 ? matched[0] : null;
    },

    querySelectorAll(selector) {
      const matched = [];
      function walk(node) {
        if (!node || !node.children) return;
        for (const c of node.children) {
          if (matchesSelector(c, selector)) matched.push(c);
          walk(c);
        }
      }
      walk(el);
      return matched;
    }
  };

  el.classList = new MockClassList(el);
  return el;
}

function matchesSelector(el, selector) {
  if (!el || !el.tagName) return false;
  const sel = selector.trim();

  // Handle radio/checkbox :checked
  if (sel.includes(':checked') && !el.checked) {
    return false;
  }
  const cleanSel = sel.replace(':checked', '');

  // Exact tag e.g. 'div', 'button', 'input'
  if (/^[a-zA-Z0-9]+$/.test(cleanSel)) {
    return el.tagName.toLowerCase() === cleanSel.toLowerCase();
  }

  // Class e.g. '.nav-item'
  if (/^\.[a-zA-Z0-9_-]+$/.test(cleanSel)) {
    return el.classList.contains(cleanSel.slice(1));
  }

  // Compound classes e.g. '.nav-item.active'
  if (cleanSel.startsWith('.') && !cleanSel.includes('[') && cleanSel.split('.').length > 2) {
    const parts = cleanSel.split('.').filter(Boolean);
    return parts.every(cls => el.classList.contains(cls));
  }

  // Attribute selector e.g. input[name="aiProvider"] or [data-tab="tab-logs"]
  const attrMatch = cleanSel.match(/^([a-zA-Z0-9]+)?\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\](?:\[([a-zA-Z0-9_-]+)(?:="([^"]+)")?\])?$/);
  if (attrMatch) {
    const [, tag, attr1, val1, attr2, val2] = attrMatch;
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (attr1) {
      const actualVal = el[attr1] !== undefined ? String(el[attr1]) : el.getAttribute(attr1);
      if (val1 !== undefined && actualVal !== val1) return false;
      if (val1 === undefined && actualVal === null) return false;
    }
    if (attr2) {
      const actualVal = el[attr2] !== undefined ? String(el[attr2]) : el.getAttribute(attr2);
      if (val2 !== undefined && actualVal !== val2) return false;
      if (val2 === undefined && actualVal === null) return false;
    }
    return true;
  }

  return false;
}

// Global Document & Window Environment Mock
const elementRegistry = new Map();
const mockBody = createMockElement('body');

function registerElement(id, tagName = 'div', initialAttrs = {}) {
  const el = createMockElement(tagName, { id, ...initialAttrs });
  elementRegistry.set(id, el);
  mockBody.appendChild(el);
  return el;
}

function getOrRegisterElement(id, defaultTag = 'div') {
  if (elementRegistry.has(id)) return elementRegistry.get(id);
  return registerElement(id, defaultTag);
}

const mockDoc = {
  body: mockBody,
  documentElement: mockBody,
  getElementById(id) {
    return elementRegistry.get(id) || null;
  },
  createElement(tag) {
    return createMockElement(tag);
  },
  createTextNode(text) {
    return { textContent: String(text) };
  },
  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return elementRegistry.get(id) || null;
    }
    for (const el of elementRegistry.values()) {
      if (matchesSelector(el, selector)) return el;
    }
    return mockBody.querySelector(selector);
  },
  querySelectorAll(selector) {
    const matched = [];
    for (const el of elementRegistry.values()) {
      if (matchesSelector(el, selector)) matched.push(el);
    }
    return matched;
  },
  addEventListener(event, fn) {
    mockBody.addEventListener(event, fn);
  }
};

// Initialize Globals
globalThis.document = mockDoc;
globalThis.window = globalThis;
let lastAlert = '';
let lastConfirm = true;
let lastPrompt = '';
let lastCopiedText = '';

globalThis.alert = (msg) => { lastAlert = String(msg); };
globalThis.confirm = (_msg) => lastConfirm;
try {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: async (t) => { lastCopiedText = t; } },
    configurable: true,
    writable: true
  });
} catch (_e) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (t) => { lastCopiedText = t; } } },
    configurable: true,
    writable: true
  });
}

globalThis.FileReader = class MockFileReader {
  readAsText(blob) {
    setTimeout(() => {
      if (this.onload) {
        this.onload({ target: { result: blob._text || '' } });
      }
    }, 1);
  }
};

globalThis.Blob = class MockBlob {
  constructor(parts, opts = {}) {
    this._text = parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('');
    this.type = opts.type;
  }
};

globalThis.URL = {
  createObjectURL: (blob) => 'blob:mock-url-' + (blob._text ? blob._text.length : 0),
  revokeObjectURL: () => {}
};

let mockRuntimeHandler = null;
globalThis.chrome = {
  runtime: {
    getURL: (p) => 'chrome-extension://test-mock-extension-id/' + p,
    sendMessage: async (msg) => {
      if (mockRuntimeHandler) return mockRuntimeHandler(msg);
      return { success: true };
    }
  }
};

// Reset mock DOM and register standard Options Page Elements
function resetMockDom() {
  elementRegistry.clear();
  mockBody.children.length = 0;
  mockBody.className = '';

  // Common Toast
  registerElement('saveToast', 'div', { className: 'save-toast hidden' });

  // Tab & Interface Mode Elements
  registerElement('btnModeSimple', 'button', { className: 'mode-pill-btn active' });
  registerElement('btnModeAdvanced', 'button', { className: 'mode-pill-btn' });
  registerElement('providerNameOpenAi', 'span');
  registerElement('providerDescOpenAi', 'p');
  registerElement('panelTitleOpenAi', 'h3');
  registerElement('panelDescOpenAi', 'p');

  // Navigation Items
  const navProfiles = registerElement('nav-profiles', 'button', { className: 'nav-item active' });
  navProfiles.setAttribute('data-tab', 'tab-profiles');
  const navImportExport = registerElement('nav-ie', 'button', { className: 'nav-item' });
  navImportExport.setAttribute('data-tab', 'tab-import-export');
  const navAi = registerElement('nav-ai', 'button', { className: 'nav-item' });
  navAi.setAttribute('data-tab', 'tab-ai');
  const navPreferences = registerElement('nav-pref', 'button', { className: 'nav-item' });
  navPreferences.setAttribute('data-tab', 'tab-preferences');
  const navLogs = registerElement('nav-logs', 'button', { className: 'nav-item' });
  navLogs.setAttribute('data-tab', 'tab-logs');

  registerElement('tab-profiles', 'section', { className: 'tab-pane active' });
  registerElement('tab-import-export', 'section', { className: 'tab-pane' });
  registerElement('tab-ai', 'section', { className: 'tab-pane' });
  registerElement('tab-preferences', 'section', { className: 'tab-pane' });
  registerElement('tab-logs', 'section', { className: 'tab-pane' });

  // Profiles Manager Elements
  registerElement('activeProfileDropdown', 'select');
  registerElement('btnNewProfile', 'button');
  registerElement('btnDuplicateProfile', 'button');
  registerElement('btnDeleteProfile', 'button');
  registerElement('btnSaveProfile', 'button');
  registerElement('btnViewVisual', 'button', { className: 'toggle-btn active' });
  registerElement('btnViewJson', 'button', { className: 'toggle-btn' });
  registerElement('visualEditorView', 'div');
  registerElement('jsonEditorView', 'div', { className: 'hidden' });
  registerElement('rawJsonTextarea', 'textarea');
  registerElement('btnFormatJson', 'button');
  registerElement('btnApplyJson', 'button');

  // Profile Form Inputs
  registerElement('profProfileName', 'input');
  registerElement('profBusinessName', 'input');
  registerElement('profTradingName', 'input');
  registerElement('profWebsite', 'input');
  registerElement('profContactName', 'input');
  registerElement('profFirstName', 'input');
  registerElement('profLastName', 'input');
  registerElement('profEmail', 'input');
  registerElement('profPhone', 'input');
  registerElement('profMobile', 'input');
  registerElement('profStreet', 'input');
  registerElement('profCity', 'input');
  registerElement('profState', 'input');
  registerElement('profPostalCode', 'input');
  registerElement('profCountry', 'input');
  registerElement('profHours247', 'input', { type: 'checkbox' });
  registerElement('profHoursRaw', 'textarea');
  registerElement('profDescShort', 'textarea');
  registerElement('profDescFull', 'textarea');
  registerElement('shortCharCount', 'span');

  // 7 Days Opening Hours
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  days.forEach(d => {
    registerElement(`hours_${d}_open`, 'input', { value: '07:00' });
    registerElement(`hours_${d}_close`, 'input', { value: '18:00' });
    registerElement(`hours_${d}_closed`, 'input', { type: 'checkbox', checked: false });
  });

  // Collections Elements
  registerElement('serviceTagInput', 'input');
  registerElement('btnAddServiceTag', 'button');
  registerElement('serviceTagsList', 'div');
  registerElement('btnAddFaq', 'button');
  registerElement('faqList', 'div');
  registerElement('btnAddCustomField', 'button');
  registerElement('customFieldsList', 'div');

  // AI Elements
  ['gemini', 'openai-compatible', 'claude', 'custom'].forEach(provider => {
    const radio = createMockElement('input', { type: 'radio', name: 'aiProvider', value: provider });
    if (provider === 'gemini') radio.checked = true;
    elementRegistry.set(`radio_provider_${provider}`, radio);
    mockBody.appendChild(radio);
  });
  registerElement('panel-provider-gemini', 'div');
  registerElement('panel-provider-openai', 'div', { className: 'hidden' });
  registerElement('panel-provider-claude', 'div', { className: 'hidden' });
  registerElement('panel-provider-custom', 'div', { className: 'hidden' });
  registerElement('ollamaOriginTip', 'div', { className: 'hidden' });
  registerElement('ollamaCmdText', 'code');
  registerElement('ollamaCmdWin', 'code');
  registerElement('geminiApiKey', 'input', { type: 'password' });
  registerElement('geminiModelSelect', 'select', { value: 'gemini-3.1-flash-lite' });
  registerElement('geminiCustomModel', 'input');
  registerElement('openaiPresetSelect', 'select', { value: 'openai' });
  registerElement('openaiBaseUrl', 'input');
  registerElement('openaiApiKey', 'input');
  registerElement('openaiModel', 'input');
  registerElement('claudeApiKey', 'input');
  registerElement('claudeModel', 'select', { value: 'claude-3-5-haiku-20241022' });
  registerElement('claudeCustomModel', 'input');
  registerElement('customEndpointUrl', 'input');
  registerElement('customHeaders', 'textarea');
  registerElement('customBodyTemplate', 'textarea');
  registerElement('customResponsePath', 'input');
  registerElement('customModel', 'input');
  registerElement('aiTimeoutSeconds', 'input', { value: '90' });
  registerElement('temperatureSlider', 'input', { value: '0.1' });
  registerElement('tempValueDisplay', 'span');
  registerElement('customPromptInstructions', 'textarea');
  registerElement('btnCopyOllamaCmd', 'button');
  registerElement('btnSaveAiSettings', 'button');
  registerElement('btnTestApiKey', 'button');
  registerElement('btnToggleApiKey', 'button');
  registerElement('apiTestStatus', 'div', { className: 'hidden' });

  // Preferences Elements
  registerElement('prefTier1Enabled', 'input', { type: 'checkbox', checked: true });
  registerElement('prefTier2Enabled', 'input', { type: 'checkbox', checked: true });
  registerElement('prefFillOnlyEmpty', 'input', { type: 'checkbox', checked: true });
  registerElement('prefSmartLearningEnabled', 'input', { type: 'checkbox', checked: true });
  registerElement('prefDebugLogging', 'input', { type: 'checkbox', checked: false });
  registerElement('prefShowFloatingButton', 'input', { type: 'checkbox', checked: true });
  registerElement('prefDomainBlacklist', 'textarea');
  registerElement('prefFloatingPos', 'select', { value: 'bottom-right' });
  registerElement('prefHighlightDuration', 'input', { value: '2500' });
  registerElement('btnSavePreferences', 'button');

  // Vault Elements
  registerElement('vaultStatusBadge', 'span');
  registerElement('vaultUnencryptedBox', 'div');
  registerElement('vaultUnlockedBox', 'div', { className: 'hidden' });
  registerElement('vaultLockedBox', 'div', { className: 'hidden' });
  registerElement('vaultSetupForm', 'div', { className: 'hidden' });
  registerElement('vaultDisableForm', 'div', { className: 'hidden' });
  registerElement('vaultSetupTitle', 'h4');
  registerElement('vaultCurrentPasswordGroup', 'div', { className: 'hidden' });
  registerElement('vaultCurrentPassword', 'input', { type: 'password' });
  registerElement('vaultNewPassword', 'input', { type: 'password' });
  registerElement('vaultConfirmPassword', 'input', { type: 'password' });
  registerElement('vaultUnlockInput', 'input', { type: 'password' });
  registerElement('vaultDisablePassword', 'input', { type: 'password' });
  registerElement('vaultStrengthIndicator', 'div');
  registerElement('vaultSetupError', 'div', { className: 'hidden' });
  registerElement('vaultUnlockError', 'div', { className: 'hidden' });
  registerElement('vaultDisableError', 'div', { className: 'hidden' });
  registerElement('btnShowVaultSetup', 'button');
  registerElement('btnShowChangePassword', 'button');
  registerElement('btnCancelVaultSetup', 'button');
  registerElement('btnConfirmVaultSetup', 'button');
  registerElement('btnLockVaultNow', 'button');
  registerElement('btnUnlockVaultNow', 'button');
  registerElement('btnShowDisableVault', 'button');
  registerElement('btnCancelDisableVault', 'button');
  registerElement('btnConfirmDisableVault', 'button');

  // Import / Export Elements
  registerElement('importTextarea', 'textarea');
  registerElement('importStatusBox', 'div', { className: 'hidden' });
  registerElement('importPasswordPrompt', 'div', { className: 'hidden' });
  registerElement('importPassphraseInput', 'input', { type: 'password' });
  registerElement('exportIncludeApiKey', 'input', { type: 'checkbox' });
  registerElement('exportCustomPassphrase', 'input', { type: 'password' });
  registerElement('exportCustomPassphraseGroup', 'div', { className: 'hidden' });
  registerElement('fileUploadInput', 'input', { type: 'file' });
  registerElement('dropZone', 'div');
  registerElement('btnExecuteImport', 'button');
  registerElement('btnDecryptImport', 'button');
  registerElement('btnExecuteExport', 'button');

  const replaceRadio = createMockElement('input', { type: 'radio', name: 'importMode', value: 'replace', checked: true });
  elementRegistry.set('radio_import_replace', replaceRadio);
  mockBody.appendChild(replaceRadio);

  const plainExportRadio = createMockElement('input', { type: 'radio', name: 'exportFormatMode', value: 'plaintext', checked: true });
  elementRegistry.set('radio_export_plain', plainExportRadio);
  mockBody.appendChild(plainExportRadio);

  // Logs Tab Elements
  registerElement('logsEmptyNotice', 'div');
  registerElement('logsTableContainer', 'div', { className: 'hidden' });
  registerElement('logsTableBody', 'tbody');
  registerElement('aiInspectorCard', 'div', { className: 'hidden' });
  registerElement('inspectPromptText', 'textarea');
  registerElement('inspectResponseText', 'textarea');
  registerElement('btnClearLogs', 'button');
}

// ==========================================
// RUN THE CHALLENGER TEST SUITE
// ==========================================

async function runTestSuite() {
  console.log('================================================================');
  console.log('⚡ RUNNING EMPIRICAL CHALLENGER TEST SUITE: OPTIONS & SECURITY ⚡');
  console.log('================================================================\n');

  resetMockDom();

  // --- SUITE 1: MODULARIZATION & BARREL INTEGRITY ---
  console.log('--- TEST 1: Modularization Integrity & Barrel Re-Exports ---');
  {
    const vaultCtrl = await import('../src/options/controllers/vault-controller.js');
    const vaultUi = await import('../src/options/controllers/vault-ui.js');
    assert.strictEqual(
      typeof vaultCtrl.renderVaultStatus,
      'function',
      'vault-controller.ts must export renderVaultStatus'
    );
    assert.strictEqual(
      vaultCtrl.renderVaultStatus,
      vaultUi.renderVaultStatus,
      'vault-controller.ts must re-export renderVaultStatus directly from vault-ui.ts'
    );

    const profilesCtrl = await import('../src/options/controllers/profiles-controller.js');
    assert.strictEqual(typeof profilesCtrl.initProfilesController, 'function');
    assert.strictEqual(typeof profilesCtrl.loadProfilesDropdown, 'function');

    const profilesJson = await import('../src/options/controllers/profiles-json.js');
    assert.strictEqual(typeof profilesJson.syncJsonTextarea, 'function');
    assert.strictEqual(typeof profilesJson.setupJsonViewHandlers, 'function');

    const profilesForm = await import('../src/options/controllers/profiles-form.js');
    assert.strictEqual(typeof profilesForm.populateProfileInputs, 'function');
    assert.strictEqual(typeof profilesForm.collectProfileFormData, 'function');

    const aiCtrl = await import('../src/options/controllers/ai-controller.js');
    assert.strictEqual(typeof aiCtrl.initAiController, 'function');
    assert.strictEqual(typeof aiCtrl.loadAiSettings, 'function');
    assert.strictEqual(typeof aiCtrl.updateProviderPanels, 'function');
    assert.strictEqual(typeof aiCtrl.updateOllamaTipVisibility, 'function');

    const aiForm = await import('../src/options/controllers/ai-form.js');
    assert.strictEqual(typeof aiForm.getAiFormSettings, 'function');
    assert.strictEqual(typeof aiForm.populateAiForm, 'function');
    assert.ok(aiForm.OPENAI_PRESETS, 'OPENAI_PRESETS must be exported');

    console.log('✓ Verified re-exports and module contract interfaces across controllers');
  }

  // --- SUITE 2: PROFILES FORM & OPENING HOURS HEURISTICS ---
  console.log('\n--- TEST 2: Profiles Form & Opening Hours Heuristic Collection ---');
  {
    resetMockDom();
    const { populateProfileInputs, collectProfileFormData } = await import('../src/options/controllers/profiles-form.js');

    const sampleProfile = {
      id: 'test-profile-1',
      name: 'Custom Test Profile',
      isDefault: true,
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
      data: {
        businessName: 'Apex Mechanics',
        tradingName: 'Apex Auto Services',
        website: 'https://apexmechanics.example.com',
        contactName: 'Alex Mercer',
        email: 'alex@apexmechanics.example.com',
        phone: '+61 400 123 456',
        address: {
          street: '10 Industrial Way',
          city: 'Perth',
          state: 'WA',
          postalCode: '6000',
          country: 'Australia'
        },
        openingHours: {
          mon: { open: '08:00', close: '17:00', closed: false },
          tuesday: { open: '08:30', close: '17:30', closed: false },
          wednesday: { open: '08:00', close: '17:00', closed: false },
          thursday: { open: '08:00', close: '19:00', closed: false },
          friday: { open: '08:00', close: '16:30', closed: false },
          sat: { open: '09:00', close: '12:00', closed: false },
          sunday: { open: '00:00', close: '00:00', closed: true },
          alwaysOpen: false,
          rawHoursText: 'Monday to Friday: 8am-5pm; Saturday morning only.'
        },
        descriptions: {
          short: 'Premier automotive repairs and servicing in Perth.',
          full: 'Apex Mechanics is an independent auto shop specializing in Japanese and European vehicles.'
        }
      }
    };

    populateProfileInputs(sampleProfile);

    // Verify DOM inputs populated
    assert.strictEqual(getOrRegisterElement('profProfileName').value, 'Custom Test Profile');
    assert.strictEqual(getOrRegisterElement('profBusinessName').value, 'Apex Mechanics');
    assert.strictEqual(getOrRegisterElement('profStreet').value, '10 Industrial Way');
    assert.strictEqual(getOrRegisterElement('profCity').value, 'Perth');
    assert.strictEqual(getOrRegisterElement('hours_mon_open').value, '08:00');
    assert.strictEqual(getOrRegisterElement('hours_tue_open').value, '08:30');
    assert.strictEqual(getOrRegisterElement('hours_tue_close').value, '17:30');
    assert.strictEqual(getOrRegisterElement('hours_sun_closed').checked, true);
    assert.strictEqual(getOrRegisterElement('profHoursRaw').value, 'Monday to Friday: 8am-5pm; Saturday morning only.');
    assert.strictEqual(getOrRegisterElement('shortCharCount').textContent, '50 chars');

    // Collect back from form
    const collected = collectProfileFormData(['Logbook Servicing', 'Brakes'], [{ q: 'Do you offer warranty?', a: 'Yes, 12 months.' }, { q: '', a: '' }], [{ key: 'ABN', value: '12345678901' }, { key: '', value: '' }]);

    assert.strictEqual(collected.businessName, 'Apex Mechanics');
    assert.strictEqual(collected.address?.city, 'Perth');
    assert.strictEqual(collected.openingHours?.monday?.open, '08:00');
    assert.strictEqual(collected.openingHours?.tuesday?.open, '08:30');
    assert.strictEqual(collected.openingHours?.sunday?.closed, true);
    assert.strictEqual(collected.openingHours?.rawHoursText, 'Monday to Friday: 8am-5pm; Saturday morning only.');
    assert.strictEqual(collected.services.length, 2);
    // Verified empty FAQ/CustomField filtering
    assert.strictEqual(collected.faqs?.length, 1, 'Empty FAQ item must be filtered out');
    assert.strictEqual(collected.customFields?.length, 1, 'Empty custom field item must be filtered out');

    // Test 24/7 Always Open parsing
    sampleProfile.data.openingHours = { alwaysOpen: true };
    populateProfileInputs(sampleProfile);
    assert.strictEqual(getOrRegisterElement('profHours247').checked, true, '24/7 checkbox must be checked');

    console.log('✓ Successfully populated and collected profile inputs with opening hours normalization');
  }

  // --- SUITE 3: RAW JSON EDITOR & PROFILES HANDLERS ---
  console.log('\n--- TEST 3: Raw JSON Editor Formatting, Application & Error Trapping ---');
  {
    resetMockDom();
    const { syncJsonTextarea, setupJsonViewHandlers } = await import('../src/options/controllers/profiles-json.js');

    const testProfile = {
      id: 'json-prof-1',
      name: 'Original Profile Name',
      isDefault: false,
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
      data: { businessName: 'Before Sync' }
    };

    getOrRegisterElement('profProfileName').value = 'Updated via Name Input';
    syncJsonTextarea(testProfile, { businessName: 'Synced Business' });

    const textarea = getOrRegisterElement('rawJsonTextarea');
    assert.ok(textarea.value.length > 0, 'Textarea must be populated with JSON');
    const parsedFromTextarea = JSON.parse(textarea.value);
    assert.strictEqual(parsedFromTextarea.name, 'Updated via Name Input', 'Profile name should reflect input field');
    assert.strictEqual(parsedFromTextarea.data.businessName, 'Synced Business');

    // Test Setup Handlers
    let appliedProfile = null;
    let syncCount = 0;
    setupJsonViewHandlers({
      getCurrentProfile: () => testProfile,
      onApplyProfile: async (p) => { appliedProfile = p; },
      syncFormToJson: () => { syncCount++; }
    });

    // 1. Format Button - Valid JSON
    textarea.value = '{"compact":true,"count":42}';
    getOrRegisterElement('btnFormatJson').click();
    assert.strictEqual(textarea.value, JSON.stringify({ compact: true, count: 42 }, null, 2));
    assert.strictEqual(getOrRegisterElement('saveToast').textContent, 'JSON formatted');

    // 2. Format Button - Malformed JSON Error Handling
    textarea.value = '{"invalidJson": ';
    getOrRegisterElement('btnFormatJson').click();
    assert.ok(getOrRegisterElement('saveToast').textContent.startsWith('Invalid JSON:'), 'Must show error toast for invalid JSON');

    // 3. Apply Button - Valid JSON
    textarea.value = JSON.stringify({
      name: 'New Applied Name',
      data: { businessName: 'Applied Business Corp' }
    });
    getOrRegisterElement('btnApplyJson').click();
    // Wait for async apply handler
    await new Promise(r => setTimeout(r, 10));
    assert.ok(appliedProfile, 'onApplyProfile callback must be triggered');
    assert.strictEqual(appliedProfile.name, 'New Applied Name');
    assert.strictEqual(appliedProfile.data.businessName, 'Applied Business Corp');
    assert.strictEqual(getOrRegisterElement('saveToast').textContent, 'JSON applied and profile updated!');

    // 4. Apply Button - Malformed JSON Error Catching
    textarea.value = '{ malformed json content }';
    appliedProfile = null;
    getOrRegisterElement('btnApplyJson').click();
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(appliedProfile, null, 'Callback must not be invoked on malformed JSON');
    assert.ok(getOrRegisterElement('saveToast').textContent.startsWith('Error applying JSON:'));

    // 5. Apply Button - Non-object root rejection
    textarea.value = '"Just a string root"';
    getOrRegisterElement('btnApplyJson').click();
    await new Promise(r => setTimeout(r, 10));
    assert.ok(getOrRegisterElement('saveToast').textContent.includes('Root must be an object'));

    // 6. View toggles
    getOrRegisterElement('btnViewJson').click();
    assert.ok(getOrRegisterElement('btnViewJson').classList.contains('active'));
    assert.ok(!getOrRegisterElement('jsonEditorView').classList.contains('hidden'));
    assert.ok(syncCount > 0, 'Switching to JSON view must trigger syncFormToJson');

    console.log('✓ Verified raw JSON editor formatting, apply parsing, and robust error trapping');
  }

  // --- SUITE 4: PROFILE COLLECTIONS DYNAMIC DOM & REACTIVITY ---
  console.log('\n--- TEST 4: Profile Collections Dynamic DOM & Zero-Unsanitized Invariants ---');
  {
    resetMockDom();
    const { renderServices, renderFaqs, renderCustomFields } = await import('../src/options/controllers/profiles-collections.js');

    const sList = getOrRegisterElement('serviceTagsList');
    const fList = getOrRegisterElement('faqList');
    const cfList = getOrRegisterElement('customFieldsList');

    // 1. Services
    const services = ['Carpet Cleaning', 'Window Washing', 'Tile Scrubbing'];
    let updateCalled = 0;
    renderServices(sList, services, () => { updateCalled++; });

    assert.strictEqual(sList.children.length, 3, 'Must render 3 service tags');
    // Click remove on second tag
    const secondTagRemoveBtn = sList.children[1].querySelector('button');
    assert.ok(secondTagRemoveBtn, 'Tag must contain remove button');
    secondTagRemoveBtn.click();
    assert.strictEqual(services.length, 2);
    assert.strictEqual(services[1], 'Tile Scrubbing');
    assert.strictEqual(sList.children.length, 2);
    assert.ok(updateCalled > 0, 'onUpdate callback must be fired on service removal');

    // 2. FAQs
    const faqs = [{ q: 'Question 1', a: 'Answer 1' }, { q: 'Question 2', a: 'Answer 2' }];
    renderFaqs(fList, faqs, () => { updateCalled++; });
    assert.strictEqual(fList.children.length, 2, 'Must render 2 FAQ cards');

    // Simulate input typing
    const firstFaqCard = fList.children[0];
    const qInput = firstFaqCard.querySelector('.faq-q-input');
    const aInput = firstFaqCard.querySelector('.faq-a-input');
    qInput.value = 'Updated Question 1';
    qInput.dispatchEvent('input');
    assert.strictEqual(faqs[0].q, 'Updated Question 1');

    aInput.value = 'Updated Answer 1';
    aInput.dispatchEvent('input');
    assert.strictEqual(faqs[0].a, 'Updated Answer 1');

    // Click remove FAQ
    const faqRemoveBtn = firstFaqCard.querySelector('.item-remove-btn');
    faqRemoveBtn.click();
    assert.strictEqual(faqs.length, 1);
    assert.strictEqual(faqs[0].q, 'Question 2');
    assert.strictEqual(fList.children.length, 1);

    // 3. Custom Fields
    const customFields = [{ key: 'License', value: 'LIC-999' }];
    renderCustomFields(cfList, customFields, () => { updateCalled++; });
    assert.strictEqual(cfList.children.length, 1);

    const cfCard = cfList.children[0];
    const keyInput = cfCard.querySelector('.cf-key-input');
    const valInput = cfCard.querySelector('.cf-val-input');
    keyInput.value = 'Contractor License';
    keyInput.dispatchEvent('input');
    assert.strictEqual(customFields[0].key, 'Contractor License');

    valInput.value = 'LIC-8888';
    valInput.dispatchEvent('input');
    assert.strictEqual(customFields[0].value, 'LIC-8888');

    console.log('✓ Verified collections rendering, live array updates, and clean DOM node creation');
  }

  // --- SUITE 5: AI FORM & MULTI-PROVIDER CONTROLLER ---
  console.log('\n--- TEST 5: AI Form & Multi-Provider Controller Integration ---');
  {
    resetMockDom();
    const { getAiFormSettings, populateAiForm, OPENAI_PRESETS } = await import('../src/options/controllers/ai-form.js');
    const { initAiController, updateProviderPanels, updateOllamaTipVisibility } = await import('../src/options/controllers/ai-controller.js');
    initAiController();

    // Verify Presets
    assert.ok(OPENAI_PRESETS['ollama-local']);
    assert.ok(OPENAI_PRESETS['lmstudio-local']);
    assert.ok(OPENAI_PRESETS['deepseek']);
    assert.ok(OPENAI_PRESETS['groq']);
    assert.ok(OPENAI_PRESETS['openai']);
    assert.strictEqual(OPENAI_PRESETS['ollama-local'].url, 'http://localhost:11434/api/chat');

    // Populate Form
    populateAiForm({
      aiProvider: 'claude',
      claudeApiKey: 'sk-ant-test-key-12345',
      claudeModel: 'claude-3-5-sonnet-20241022',
      timeoutSeconds: 45,
      temperature: 0.7
    });

    assert.strictEqual(getOrRegisterElement('claudeApiKey').value, 'sk-ant-test-key-12345');
    assert.strictEqual(getOrRegisterElement('aiTimeoutSeconds').value, '45');
    assert.strictEqual(getOrRegisterElement('temperatureSlider').value, '0.7');
    assert.strictEqual(getOrRegisterElement('tempValueDisplay').textContent, '0.7');

    // Test getAiFormSettings with invalid/extreme timeouts
    getOrRegisterElement('aiTimeoutSeconds').value = 'invalid-timeout';
    let s = getAiFormSettings();
    assert.strictEqual(s.timeoutSeconds, 90, 'Invalid timeout must fallback to 90s');
    assert.strictEqual(s.timeoutMs, 90000);

    getOrRegisterElement('aiTimeoutSeconds').value = '-10';
    s = getAiFormSettings();
    assert.strictEqual(s.timeoutSeconds, 90, 'Negative timeout must fallback to 90s');

    getOrRegisterElement('aiTimeoutSeconds').value = '120';
    s = getAiFormSettings();
    assert.strictEqual(s.timeoutSeconds, 120);
    assert.strictEqual(s.timeoutMs, 120000);

    // Test Provider Panels Toggling
    updateProviderPanels('claude');
    assert.ok(!getOrRegisterElement('panel-provider-claude').classList.contains('hidden'));
    assert.ok(getOrRegisterElement('panel-provider-gemini').classList.contains('hidden'));
    assert.ok(getOrRegisterElement('panel-provider-openai').classList.contains('hidden'));

    // Test Ollama Tip Visibility in Simple vs Advanced Mode
    mockBody.classList.remove('mode-advanced');
    getOrRegisterElement('openaiPresetSelect').value = 'ollama-local';
    updateOllamaTipVisibility();
    assert.ok(getOrRegisterElement('ollamaOriginTip').classList.contains('hidden'), 'Ollama tip must be hidden in simple mode');

    mockBody.classList.add('mode-advanced');
    updateOllamaTipVisibility();
    assert.ok(!getOrRegisterElement('ollamaOriginTip').classList.contains('hidden'), 'Ollama tip must be visible in advanced mode for ollama');

    // Test Connection Ping Mock Dispatch
    let pingMsgReceived = null;
    mockRuntimeHandler = async (msg) => {
      pingMsgReceived = msg;
      return {
        success: true,
        result: { model: 'claude-3-5-sonnet' },
        durationMs: 250
      };
    };

    const statusBox = getOrRegisterElement('apiTestStatus');
    const testBtn = getOrRegisterElement('btnTestApiKey');
    testBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert.ok(pingMsgReceived, 'chrome.runtime.sendMessage must be called');
    assert.strictEqual(pingMsgReceived.type, 'SMARTFORM_TEST_KEY');
    assert.ok(statusBox.textContent.includes('Connected!'), 'Status box must display connection success');
    assert.ok(statusBox.textContent.includes('250ms'));

    console.log('✓ Verified AI form serialization, timeout sanitization, presets, and IPC ping');
  }

  // --- SUITE 6: VAULT CONTROLLER & UI STATUS RENDERING ---
  console.log('\n--- TEST 6: Vault Controller & UI Status Rendering ---');
  {
    resetMockDom();
    const { renderVaultStatus, updateStrengthDisplay, showFormError } = await import('../src/options/controllers/vault-ui.js');
    const storage = await import('../src/services/storage.js');

    // 1. Strength display testing
    const ind = getOrRegisterElement('vaultStrengthIndicator');
    updateStrengthDisplay('');
    assert.ok(ind.textContent.includes('Tip:'));
    assert.strictEqual(ind.style.color, '#94a3b8');

    updateStrengthDisplay('1234');
    assert.ok(ind.textContent.includes('Fast PIN'));
    assert.strictEqual(ind.style.color, '#38bdf8');

    updateStrengthDisplay('correct-horse-battery-staple-2026!');
    assert.ok(ind.textContent.includes('Passphrase') || ind.textContent.includes('Password'));

    // 2. Form Error Helper
    const errBox = getOrRegisterElement('vaultSetupError');
    showFormError(errBox, 'Test Security Error Message');
    assert.strictEqual(errBox.textContent, 'Test Security Error Message');
    assert.ok(!errBox.classList.contains('hidden'));

    // 3. Vault Status Rendering across Lifecycle
    const badge = getOrRegisterElement('vaultStatusBadge');
    await renderVaultStatus();
    assert.ok(badge.textContent.includes('Unencrypted'));
    assert.ok(!getOrRegisterElement('vaultUnencryptedBox').classList.contains('hidden'));
    assert.ok(getOrRegisterElement('vaultUnlockedBox').classList.contains('hidden'));

    // Simulate vault encryption
    await storage.setupVaultEncryption('9876');
    await renderVaultStatus();
    assert.ok(badge.textContent.includes('Unlocked (AES-256-GCM)'));
    assert.ok(!getOrRegisterElement('vaultUnlockedBox').classList.contains('hidden'));

    // Simulate vault lock
    await storage.lockVault();
    await renderVaultStatus();
    assert.ok(badge.textContent.includes('Locked'));
    assert.ok(!getOrRegisterElement('vaultLockedBox').classList.contains('hidden'));

    // Clean up: unlock and disable
    await storage.unlockVault('9876');
    await storage.disableVaultEncryption('9876');
    await renderVaultStatus();
    assert.ok(badge.textContent.includes('Unencrypted'));

    console.log('✓ Verified vault UI states, badge styling, strength indicators, and crypto synchronization');
  }

  // --- SUITE 7: IMPORT / EXPORT CONTROLLER ROUND-TRIP ---
  console.log('\n--- TEST 7: Import/Export Controller Round-Trip & Safe DOM Construction ---');
  {
    resetMockDom();
    const { exportConfiguration, importConfiguration } = await import('../src/utils/importer.js');
    const storage = await import('../src/services/storage.js');

    // Create a known profile to export
    await storage.createProfile('Export Test Profile', {
      businessName: 'Exportable Enterprise',
      email: 'corp@export.example.com'
    });

    // 1. Plaintext Export and Import Round-Trip
    const exportedPlain = await exportConfiguration({ includeApiKey: false, encrypt: false });
    assert.strictEqual(exportedPlain.smartform_version, '1.0.0');
    assert.ok(Array.isArray(exportedPlain.profiles));
    assert.ok(exportedPlain.profiles.some(p => p.name === 'Export Test Profile'));

    const importResult = await importConfiguration(JSON.stringify(exportedPlain), 'replace');
    assert.strictEqual(importResult.success, true);
    assert.ok(importResult.profilesImported >= 1);

    // 2. Encrypted Export and Import Round-Trip
    const exportedEnc = await exportConfiguration({ encrypt: true, passphrase: 'SecretPassphrase123!' });
    assert.strictEqual(exportedEnc.format, 'smartform-encrypted-vault');
    assert.ok(typeof exportedEnc.ciphertext === 'string');

    // Attempt import without password
    const noPassResult = await importConfiguration(JSON.stringify(exportedEnc), 'replace');
    assert.strictEqual(noPassResult.needsPassword, true);

    // Import with correct password
    const passResult = await importConfiguration(JSON.stringify(exportedEnc), 'replace', { passphrase: 'SecretPassphrase123!' });
    assert.strictEqual(passResult.success, true);
    assert.ok(passResult.profilesImported >= 1);

    // 3. Verify renderImportSuccess DOM Construction
    const statusBox = getOrRegisterElement('importStatusBox');
    const { initImportExportController } = await import('../src/options/controllers/import-export-controller.js');
    initImportExportController();

    // Trigger processImport with bad JSON
    getOrRegisterElement('importTextarea').value = '{ "bad": "json';
    getOrRegisterElement('btnExecuteImport').click();
    await new Promise(r => setTimeout(r, 20));

    assert.ok(statusBox.textContent.includes('Import failed') || statusBox.textContent.includes('Import error'));
    assert.ok(!statusBox.classList.contains('hidden'));

    console.log('✓ Verified import/export round-trip, passphrase protection, and safe DOM nodes');
  }

  // --- SUITE 8: SECURITY AUDIT: ZERO UNSANITIZED DOM SINKS ---
  console.log('\n--- TEST 8: Full Codebase Security Audit (Zero DOM Sinks) ---');
  {
    const projectRoot = path.resolve(process.cwd());
    const srcDir = path.join(projectRoot, 'src');

    function getAllFiles(dir, exts) {
      let results = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, exts));
        } else if (exts.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const sourceFiles = getAllFiles(srcDir, ['.ts', '.html', '.js']);
    console.log(`Auditing ${sourceFiles.length} source files across ${srcDir}...`);

    const forbiddenPatterns = [
      { name: 'innerHTML', regex: /\.innerHTML\s*=/ },
      { name: 'outerHTML', regex: /\.outerHTML\s*=/ },
      { name: 'document.write', regex: /document\.write(?:ln)?\s*\(/ },
      { name: 'eval', regex: /\beval\s*\(/ },
      { name: 'Function constructor', regex: /new\s+Function\s*\(/ },
      { name: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\s*\(/ },
      { name: 'javascript: URL', regex: /['"`]javascript:/i }
    ];

    const violations = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, lineIdx) => {
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

        for (const { name, regex } of forbiddenPatterns) {
          if (regex.test(line)) {
            violations.push({
              file: path.relative(projectRoot, file),
              line: lineIdx + 1,
              sink: name,
              code: trimmed
            });
          }
        }

        // Check for inline event handlers in HTML
        if (file.endsWith('.html')) {
          const inlineHandlerMatch = line.match(/\son[a-zA-Z]+=/);
          if (inlineHandlerMatch) {
            violations.push({
              file: path.relative(projectRoot, file),
              line: lineIdx + 1,
              sink: 'Inline HTML event handler',
              code: trimmed
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      console.error('❌ CRITICAL SECURITY VULNERABILITIES DETECTED:');
      console.error(violations);
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 unsafe DOM sink instances across codebase, but found ${violations.length}`
    );

    console.log(`✓ 100% CLEAN: 0 instances of innerHTML, outerHTML, document.write, eval, or unsanitized DOM sinks across all ${sourceFiles.length} source files!`);
  }

  // --- SUITE 9: CLEAN CODE PHYSICAL LIMITS (WC -L <= 200, FUNCTION <= 40) ---
  console.log('\n--- TEST 9: Clean Code Physical Limits (Files <= 200 LOC, Functions <= 40 LOC) ---');
  {
    const optionsDir = path.resolve(process.cwd(), 'src/options');
    const controllersDir = path.join(optionsDir, 'controllers');

    const optionsFiles = fs.readdirSync(controllersDir)
      .filter(f => f.endsWith('.ts'))
      .map(f => path.join(controllersDir, f))
      .concat([path.join(optionsDir, 'options.ts')]);

    console.log(`Verifying line counts on ${optionsFiles.length} options files...`);

    const filesOver200 = [];
    const functionsOver40 = [];

    for (const file of optionsFiles) {
      const relPath = path.relative(process.cwd(), file);
      const content = fs.readFileSync(file, 'utf8');
      const physicalLines = content.split('\n').length;

      if (physicalLines > 200) {
        filesOver200.push({ file: relPath, lines: physicalLines });
      }

      // AST function check
      const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      function inspectNode(node) {
        if (
          ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node)
        ) {
          const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
          const nonCommentLines = content
            .split('\n')
            .slice(start - 1, end)
            .filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*')).length;

          if (nonCommentLines > 40) {
            functionsOver40.push({
              file: relPath,
              start,
              end,
              nonCommentLines
            });
          }
        }
        ts.forEachChild(node, inspectNode);
      }
      inspectNode(sf);
    }

    if (filesOver200.length > 0) {
      console.error('Files exceeding 200 lines:', filesOver200);
    }
    assert.strictEqual(filesOver200.length, 0, 'No files may exceed 200 physical lines');

    if (functionsOver40.length > 0) {
      console.error('Functions exceeding 40 lines:', functionsOver40);
    }
    assert.strictEqual(functionsOver40.length, 0, 'No functions may exceed 40 non-comment lines');

    console.log(`✓ All ${optionsFiles.length} files in src/options/ comply strictly with <= 200 physical LOC and <= 40 LOC per function!`);
  }

  // --- SUITE 10: ADVERSARIAL STRESS & EDGE CASES ---
  console.log('\n--- TEST 10: Adversarial Stress & Edge Cases ---');
  {
    resetMockDom();
    const { collectProfileFormData, populateProfileInputs } = await import('../src/options/controllers/profiles-form.js');
    const { setupJsonViewHandlers } = await import('../src/options/controllers/profiles-json.js');

    // 1. Completely empty profile object
    populateProfileInputs(null);
    populateProfileInputs({});

    // 2. Profile with corrupted openingHours
    const corruptedProfile = {
      id: 'corrupted-1',
      name: 'Corrupted Profile',
      isDefault: false,
      createdAt: '2026-11-17T00:00:00Z',
      updatedAt: '2026-11-17T00:00:00Z',
      data: {
        openingHours: 'not-an-object',
        services: null,
        faqs: 'invalid-faq-shape',
        customFields: 12345
      }
    };
    populateProfileInputs(corruptedProfile);
    assert.strictEqual(getOrRegisterElement('profProfileName').value, 'Corrupted Profile');

    // 3. Huge input strings (10,000 characters)
    const hugeString = 'A'.repeat(10000);
    getOrRegisterElement('profBusinessName').value = hugeString;
    const collected = collectProfileFormData([], [], []);
    assert.strictEqual(collected.businessName?.length, 10000);

    // 4. Prototype pollution attack attempt in JSON
    const maliciousJson = JSON.stringify({
      name: 'Hacked',
      __proto__: { polluted: true },
      data: {
        businessName: 'Polluted'
      }
    });

    let appliedHacked = null;
    setupJsonViewHandlers({
      getCurrentProfile: () => corruptedProfile,
      onApplyProfile: async (p) => { appliedHacked = p; },
      syncFormToJson: () => {}
    });

    getOrRegisterElement('rawJsonTextarea').value = maliciousJson;
    getOrRegisterElement('btnApplyJson').click();
    await new Promise(r => setTimeout(r, 10));

    assert.ok(appliedHacked);
    assert.strictEqual(appliedHacked.polluted, undefined, 'Object prototype must not be polluted');
    assert.strictEqual(({}).polluted, undefined, 'Global prototype must not be polluted');

    console.log('✓ Successfully survived adversarial fuzzing, prototype pollution, null profiles, and giant inputs');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL 10 EMPIRICAL CHALLENGE SUITES PASSED FLAWLESSLY! (10/10) 🎉');
  console.log('================================================================\n');
}

runTestSuite().catch(err => {
  console.error('\n❌ EMPIRICAL CHALLENGE FAILED:');
  console.error(err);
  process.exit(1);
});
