/**
 * Options Page Controller for SmartForm AI
 * Modern Dark Slate Dashboard
 */

import {
  getProfiles,
  saveProfiles,
  getActiveProfile,
  getActiveProfileId,
  setActiveProfileId,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  getSettings,
  saveSettings,
  getFillLogs,
  clearFillLogs,
  generateEmptyProfileTemplate
} from '../services/storage.js';

import { importConfiguration, exportConfiguration } from '../utils/importer.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (targetId === 'tab-logs') {
        renderLogsTab();
      }
    });
  });

  // Toast Helper
  const saveToast = document.getElementById('saveToast');
  function showToast(msg, isError = false) {
    saveToast.textContent = msg;
    saveToast.style.background = isError ? '#dc2626' : '#10b981';
    saveToast.classList.remove('hidden');
    setTimeout(() => {
      saveToast.classList.add('hidden');
    }, 3000);
  }

  // --- TAB 1: PROFILES MANAGER ---
  const activeProfileDropdown = document.getElementById('activeProfileDropdown');
  const btnNewProfile = document.getElementById('btnNewProfile');
  const btnDuplicateProfile = document.getElementById('btnDuplicateProfile');
  const btnDeleteProfile = document.getElementById('btnDeleteProfile');
  const btnSaveProfile = document.getElementById('btnSaveProfile');
  const btnViewVisual = document.getElementById('btnViewVisual');
  const btnViewJson = document.getElementById('btnViewJson');
  const visualEditorView = document.getElementById('visualEditorView');
  const jsonEditorView = document.getElementById('jsonEditorView');
  const rawJsonTextarea = document.getElementById('rawJsonTextarea');
  const btnFormatJson = document.getElementById('btnFormatJson');
  const btnApplyJson = document.getElementById('btnApplyJson');

  // Fields
  const profProfileName = document.getElementById('profProfileName');
  const profBusinessName = document.getElementById('profBusinessName');
  const profTradingName = document.getElementById('profTradingName');
  const profWebsite = document.getElementById('profWebsite');

  const profContactName = document.getElementById('profContactName');
  const profFirstName = document.getElementById('profFirstName');
  const profLastName = document.getElementById('profLastName');
  const profEmail = document.getElementById('profEmail');
  const profPhone = document.getElementById('profPhone');
  const profMobile = document.getElementById('profMobile');

  const profStreet = document.getElementById('profStreet');
  const profCity = document.getElementById('profCity');
  const profState = document.getElementById('profState');
  const profPostalCode = document.getElementById('profPostalCode');
  const profCountry = document.getElementById('profCountry');

  const serviceTagInput = document.getElementById('serviceTagInput');
  const btnAddServiceTag = document.getElementById('btnAddServiceTag');
  const serviceTagsList = document.getElementById('serviceTagsList');

  const profHours247 = document.getElementById('profHours247');
  const profHoursRaw = document.getElementById('profHoursRaw');

  const profDescShort = document.getElementById('profDescShort');
  const shortCharCount = document.getElementById('shortCharCount');
  const profDescFull = document.getElementById('profDescFull');

  const btnAddFaq = document.getElementById('btnAddFaq');
  const faqList = document.getElementById('faqList');

  const btnAddCustomField = document.getElementById('btnAddCustomField');
  const customFieldsList = document.getElementById('customFieldsList');

  let currentProfile = null;
  let currentServices = [];
  let currentFaqs = [];
  let currentCustomFields = [];

  // Short description character counter
  profDescShort.addEventListener('input', () => {
    shortCharCount.textContent = `${profDescShort.value.length} chars`;
  });

  // Visual vs JSON Toggle
  btnViewVisual.addEventListener('click', () => {
    btnViewVisual.classList.add('active');
    btnViewJson.classList.remove('active');
    visualEditorView.classList.remove('hidden');
    jsonEditorView.classList.add('hidden');
  });

  btnViewJson.addEventListener('click', () => {
    btnViewJson.classList.add('active');
    btnViewVisual.classList.remove('active');
    jsonEditorView.classList.remove('hidden');
    visualEditorView.classList.add('hidden');
    syncFormToJson();
  });

  function syncFormToJson() {
    if (!currentProfile) return;
    const data = collectFormData();
    const fullProfile = {
      ...currentProfile,
      name: profProfileName.value || currentProfile.name,
      data
    };
    rawJsonTextarea.value = JSON.stringify(fullProfile, null, 2);
  }

  btnFormatJson.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(rawJsonTextarea.value);
      rawJsonTextarea.value = JSON.stringify(parsed, null, 2);
      showToast('JSON formatted');
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, true);
    }
  });

  btnApplyJson.addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(rawJsonTextarea.value);
      if (!parsed || typeof parsed !== 'object') throw new Error('Root must be an object');
      currentProfile = {
        ...currentProfile,
        name: parsed.name || currentProfile.name,
        data: parsed.data || parsed
      };
      populateProfileForm(currentProfile);
      await updateProfile(currentProfile.id, currentProfile);
      showToast('JSON applied and profile updated!');
      btnViewVisual.click();
    } catch (e) {
      showToast('Error applying JSON: ' + e.message, true);
    }
  });

  // Services tags
  function renderServices() {
    serviceTagsList.innerHTML = '';
    currentServices.forEach((service, index) => {
      const badge = document.createElement('span');
      badge.className = 'tag-badge';
      badge.innerHTML = `<span>${service}</span><button class="tag-remove" data-index="${index}">&times;</button>`;
      serviceTagsList.appendChild(badge);
    });

    serviceTagsList.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        currentServices.splice(idx, 1);
        renderServices();
      });
    });
  }

  function addServiceTag() {
    const val = serviceTagInput.value.trim();
    if (val && !currentServices.includes(val)) {
      currentServices.push(val);
      renderServices();
      serviceTagInput.value = '';
    }
  }

  btnAddServiceTag.addEventListener('click', addServiceTag);
  serviceTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addServiceTag();
    }
  });

  // FAQs
  function renderFaqs() {
    faqList.innerHTML = '';
    currentFaqs.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'faq-item';
      card.innerHTML = `
        <button class="item-remove-btn" data-faq-index="${index}">&times;</button>
        <div class="field-group">
          <label>Question</label>
          <input type="text" class="text-input faq-q-input" value="${item.q || ''}" placeholder="e.g. What areas do you service?">
        </div>
        <div class="field-group">
          <label>Answer</label>
          <textarea class="textarea-input faq-a-input" rows="2" placeholder="e.g. We service the greater metropolitan area...">${item.a || ''}</textarea>
        </div>
      `;
      faqList.appendChild(card);
    });

    faqList.querySelectorAll('.item-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.faqIndex, 10);
        currentFaqs.splice(idx, 1);
        renderFaqs();
      });
    });

    faqList.querySelectorAll('.faq-q-input').forEach((inp, idx) => {
      inp.addEventListener('input', () => { currentFaqs[idx].q = inp.value; });
    });
    faqList.querySelectorAll('.faq-a-input').forEach((inp, idx) => {
      inp.addEventListener('input', () => { currentFaqs[idx].a = inp.value; });
    });
  }

  btnAddFaq.addEventListener('click', () => {
    currentFaqs.push({ q: '', a: '' });
    renderFaqs();
  });

  // Custom Fields
  function renderCustomFields() {
    customFieldsList.innerHTML = '';
    currentCustomFields.forEach((cf, index) => {
      const card = document.createElement('div');
      card.className = 'custom-field-item';
      card.innerHTML = `
        <button class="item-remove-btn" data-cf-index="${index}">&times;</button>
        <div class="grid-2">
          <div class="field-group">
            <label>Attribute / Key Name</label>
            <input type="text" class="text-input cf-key-input" value="${cf.key || ''}" placeholder="e.g. License Number, Established Year">
          </div>
          <div class="field-group">
            <label>Value</label>
            <input type="text" class="text-input cf-val-input" value="${cf.value || ''}" placeholder="e.g. LIC-12345">
          </div>
        </div>
      `;
      customFieldsList.appendChild(card);
    });

    customFieldsList.querySelectorAll('.item-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.cfIndex, 10);
        currentCustomFields.splice(idx, 1);
        renderCustomFields();
      });
    });

    customFieldsList.querySelectorAll('.cf-key-input').forEach((inp, idx) => {
      inp.addEventListener('input', () => { currentCustomFields[idx].key = inp.value; });
    });
    customFieldsList.querySelectorAll('.cf-val-input').forEach((inp, idx) => {
      inp.addEventListener('input', () => { currentCustomFields[idx].value = inp.value; });
    });
  }

  btnAddCustomField.addEventListener('click', () => {
    currentCustomFields.push({ key: '', value: '' });
    renderCustomFields();
  });

  // Populate visual form
  function populateProfileForm(profile) {
    if (!profile) return;
    currentProfile = profile;
    const d = profile.data || {};

    profProfileName.value = profile.name || '';
    profBusinessName.value = d.businessName || '';
    profTradingName.value = d.tradingName || '';
    profWebsite.value = d.website || '';

    profContactName.value = d.contactName || '';
    profFirstName.value = d.firstName || '';
    profLastName.value = d.lastName || '';
    profEmail.value = d.email || '';
    profPhone.value = d.phone || '';
    profMobile.value = d.mobile || '';

    const addr = d.address || {};
    profStreet.value = addr.street || '';
    profCity.value = addr.city || '';
    profState.value = addr.state || '';
    profPostalCode.value = addr.postalCode || '';
    profCountry.value = addr.country || '';

    currentServices = Array.isArray(d.services) ? [...d.services] : [];
    renderServices();

    // Hours
    const h = d.openingHours || {};
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const fullDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    days.forEach((dayAbbr, idx) => {
      const full = fullDays[idx];
      const dayData = h[full] || h[dayAbbr] || {};
      const openEl = document.getElementById(`hours_${dayAbbr}_open`);
      const closeEl = document.getElementById(`hours_${dayAbbr}_close`);
      const closedEl = document.getElementById(`hours_${dayAbbr}_closed`);

      if (openEl) openEl.value = dayData.open || '07:00';
      if (closeEl) closeEl.value = dayData.close || '18:00';
      if (closedEl) closedEl.checked = Boolean(dayData.closed);
    });

    profHours247.checked = Boolean(h.alwaysOpen || h.onCall24_7 || (h.sunday && h.sunday.onCall24_7));
    profHoursRaw.value = h.rawHoursText || h.notes || '';

    // Descriptions
    const desc = d.descriptions || {};
    profDescShort.value = desc.short || '';
    shortCharCount.textContent = `${profDescShort.value.length} chars`;
    profDescFull.value = desc.full || (typeof d.description === 'string' ? d.description : '');

    // FAQs & Custom Fields
    currentFaqs = Array.isArray(d.faqs) ? JSON.parse(JSON.stringify(d.faqs)) : [];
    renderFaqs();

    currentCustomFields = Array.isArray(d.customFields) ? JSON.parse(JSON.stringify(d.customFields)) : [];
    renderCustomFields();

    syncFormToJson();
  }

  function collectFormData() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const fullDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const openingHours = {
      alwaysOpen: profHours247.checked,
      rawHoursText: profHoursRaw.value.trim()
    };

    days.forEach((dayAbbr, idx) => {
      const full = fullDays[idx];
      const openEl = document.getElementById(`hours_${dayAbbr}_open`);
      const closeEl = document.getElementById(`hours_${dayAbbr}_close`);
      const closedEl = document.getElementById(`hours_${dayAbbr}_closed`);

      openingHours[full] = {
        open: openEl ? openEl.value : '07:00',
        close: closeEl ? closeEl.value : '18:00',
        closed: closedEl ? closedEl.checked : false
      };
    });

    return {
      businessName: profBusinessName.value.trim(),
      tradingName: profTradingName.value.trim(),
      website: profWebsite.value.trim(),
      contactName: profContactName.value.trim(),
      firstName: profFirstName.value.trim(),
      lastName: profLastName.value.trim(),
      email: profEmail.value.trim(),
      phone: profPhone.value.trim(),
      mobile: profMobile.value.trim(),
      address: {
        street: profStreet.value.trim(),
        city: profCity.value.trim(),
        state: profState.value.trim(),
        postalCode: profPostalCode.value.trim(),
        country: profCountry.value.trim()
      },
      services: currentServices,
      openingHours,
      descriptions: {
        short: profDescShort.value.trim(),
        full: profDescFull.value.trim()
      },
      faqs: currentFaqs.filter((f) => f.q.trim() || f.a.trim()),
      customFields: currentCustomFields.filter((c) => c.key.trim() || c.value.trim())
    };
  }

  // Load profiles list
  async function loadProfilesList() {
    const profiles = await getProfiles();
    const activeId = await getActiveProfileId();

    activeProfileDropdown.innerHTML = '';
    if (profiles.length === 0) {
      // Create empty profile if none exist
      const initial = await createProfile('My First Profile', generateEmptyProfileTemplate().data);
      profiles.push(initial);
    }

    profiles.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === activeId || (!activeId && p === profiles[0])) {
        opt.selected = true;
      }
      activeProfileDropdown.appendChild(opt);
    });

    const selectedId = activeProfileDropdown.value;
    const target = profiles.find((p) => p.id === selectedId) || profiles[0];
    populateProfileForm(target);
  }

  activeProfileDropdown.addEventListener('change', async () => {
    const selectedId = activeProfileDropdown.value;
    await setActiveProfileId(selectedId);
    const profiles = await getProfiles();
    const target = profiles.find((p) => p.id === selectedId);
    if (target) populateProfileForm(target);
  });

  btnSaveProfile.addEventListener('click', async () => {
    if (!currentProfile) return;
    const data = collectFormData();
    const name = profProfileName.value.trim() || currentProfile.name;

    await updateProfile(currentProfile.id, { name, data });
    showToast(`Profile "${name}" saved successfully!`);
    await loadProfilesList();
  });

  btnNewProfile.addEventListener('click', async () => {
    const name = prompt('Enter a name for the new profile:', 'New Business Profile');
    if (name) {
      const newProf = await createProfile(name, generateEmptyProfileTemplate(name).data);
      await loadProfilesList();
      activeProfileDropdown.value = newProf.id;
      populateProfileForm(newProf);
      showToast(`Created profile: "${name}"`);
    }
  });

  btnDuplicateProfile.addEventListener('click', async () => {
    if (!currentProfile) return;
    const cloned = await duplicateProfile(currentProfile.id);
    if (cloned) {
      await loadProfilesList();
      activeProfileDropdown.value = cloned.id;
      populateProfileForm(cloned);
      showToast(`Duplicated profile: "${cloned.name}"`);
    }
  });

  btnDeleteProfile.addEventListener('click', async () => {
    if (!currentProfile) return;
    const profiles = await getProfiles();
    if (profiles.length <= 1) {
      alert('You must have at least one profile.');
      return;
    }
    if (confirm(`Are you sure you want to delete profile "${currentProfile.name}"?`)) {
      await deleteProfile(currentProfile.id);
      await loadProfilesList();
      showToast('Profile deleted.');
    }
  });

  // --- TAB 2: IMPORT & EXPORT ---
  const fileUploadInput = document.getElementById('fileUploadInput');
  const dropZone = document.getElementById('dropZone');
  const importTextarea = document.getElementById('importTextarea');
  const btnExecuteImport = document.getElementById('btnExecuteImport');
  const importStatusBox = document.getElementById('importStatusBox');
  const exportIncludeApiKey = document.getElementById('exportIncludeApiKey');
  const btnExecuteExport = document.getElementById('btnExecuteExport');

  dropZone.addEventListener('click', () => fileUploadInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  fileUploadInput.addEventListener('change', () => {
    if (fileUploadInput.files && fileUploadInput.files[0]) {
      handleFileUpload(fileUploadInput.files[0]);
    }
  });

  function handleFileUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      importTextarea.value = e.target.result;
      showToast(`File "${file.name}" loaded into textarea.`);
    };
    reader.readAsText(file);
  }

  btnExecuteImport.addEventListener('click', async () => {
    const text = importTextarea.value.trim();
    if (!text) {
      alert('Please paste JSON or upload a file first.');
      return;
    }

    const mode = document.querySelector('input[name="importMode"]:checked').value;
    importStatusBox.className = 'status-box';
    importStatusBox.textContent = 'Processing configuration...';
    importStatusBox.classList.remove('hidden');

    try {
      const res = await importConfiguration(text, mode);
      if (res.success) {
        importStatusBox.className = 'status-box success';
        importStatusBox.innerHTML = `
          <strong>Import Successful!</strong><br>
          • Format: ${res.formatDetected}<br>
          • Profiles Imported: ${res.profilesImported}<br>
          • Active Profile: "${res.activeProfileName}"<br>
          • API Key Detected: ${res.apiKeyDetected ? 'Yes' : 'None'}
        `;
        showToast('Configuration imported successfully!');
        await loadProfilesList();
        await loadAiSettings();
      } else {
        importStatusBox.className = 'status-box error';
        importStatusBox.textContent = 'Import failed: ' + res.message;
      }
    } catch (err) {
      importStatusBox.className = 'status-box error';
      importStatusBox.textContent = 'Import error: ' + err.message;
    }
  });

  btnExecuteExport.addEventListener('click', async () => {
    const includeKey = exportIncludeApiKey.checked;
    const config = await exportConfiguration({ includeApiKey: includeKey });
    const jsonStr = JSON.stringify(config, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartform_ai_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Export downloaded successfully!');
  });

  // --- INTERFACE MODE: SIMPLE VS ADVANCED ---
  const btnModeSimple = document.getElementById('btnModeSimple');
  const btnModeAdvanced = document.getElementById('btnModeAdvanced');
  const providerNameOpenAi = document.getElementById('providerNameOpenAi');
  const providerDescOpenAi = document.getElementById('providerDescOpenAi');
  const panelTitleOpenAi = document.getElementById('panelTitleOpenAi');
  const panelDescOpenAi = document.getElementById('panelDescOpenAi');

  async function setInterfaceMode(isAdvanced, persist = true) {
    if (isAdvanced) {
      document.body.classList.add('mode-advanced');
      document.body.classList.remove('mode-simple');
      btnModeAdvanced?.classList.add('active');
      btnModeSimple?.classList.remove('active');
      if (providerNameOpenAi) providerNameOpenAi.textContent = 'OpenAI & Local Models';
      if (providerDescOpenAi) providerDescOpenAi.textContent = 'Local Ollama, LM Studio, DeepSeek, Groq, OpenAI.';
      if (panelTitleOpenAi) panelTitleOpenAi.textContent = 'OpenAI-Compatible & Local Model Settings';
      if (panelDescOpenAi) panelDescOpenAi.innerHTML = 'Connect to any OpenAI-compatible server. For local models like <strong>Ollama</strong> or <strong>LM Studio</strong>, 0 bytes ever leave your machine.';
    } else {
      document.body.classList.add('mode-simple');
      document.body.classList.remove('mode-advanced');
      btnModeSimple?.classList.add('active');
      btnModeAdvanced?.classList.remove('active');
      if (providerNameOpenAi) providerNameOpenAi.textContent = 'OpenAI';
      if (providerDescOpenAi) providerDescOpenAi.textContent = 'Cloud model (gpt-4o-mini).';
      if (panelTitleOpenAi) panelTitleOpenAi.textContent = 'OpenAI Settings';
      if (panelDescOpenAi) panelDescOpenAi.textContent = 'Connect directly to OpenAI. For local offline models like Ollama, switch to Advanced Mode in the sidebar.';
      // Reset JSON editor to visual editor in simple mode
      if (btnViewVisual && btnViewJson && visualEditorView && jsonEditorView) {
        btnViewVisual.classList.add('active');
        btnViewJson.classList.remove('active');
        visualEditorView.classList.remove('hidden');
        jsonEditorView.classList.add('hidden');
      }
      // Fallback if currently on Custom provider in simple mode
      const curProvider = getSelectedAiProvider();
      if (curProvider === 'custom') {
        const geminiRadio = document.querySelector('input[name="aiProvider"][value="gemini"]');
        if (geminiRadio) {
          geminiRadio.checked = true;
          updateProviderPanels('gemini');
        }
      }

      // Switch away from Logs tab if currently active in simple mode
      const activeNav = document.querySelector('.nav-item.active');
      if (activeNav && activeNav.getAttribute('data-tab') === 'tab-logs') {
        const profilesNav = document.querySelector('.nav-item[data-tab="tab-profiles"]');
        if (profilesNav) profilesNav.click();
      }
    }
    updateOllamaTipVisibility();
    if (persist) {
      await saveSettings({ advancedMode: isAdvanced });
    }
  }

  btnModeSimple?.addEventListener('click', () => setInterfaceMode(false, true));
  btnModeAdvanced?.addEventListener('click', () => setInterfaceMode(true, true));

  // --- TAB 3: AI ENGINE & MULTI-PROVIDER ARCHITECTURE ---
  const aiProviderRadios = document.querySelectorAll('input[name="aiProvider"]');
  const panelProviderGemini = document.getElementById('panel-provider-gemini');
  const panelProviderOpenai = document.getElementById('panel-provider-openai');
  const panelProviderClaude = document.getElementById('panel-provider-claude');
  const panelProviderCustom = document.getElementById('panel-provider-custom');

  const providerPanels = {
    'gemini': panelProviderGemini,
    'openai-compatible': panelProviderOpenai,
    'claude': panelProviderClaude,
    'custom': panelProviderCustom
  };

  // Provider Inputs:
  // 1. Gemini
  const geminiApiKey = document.getElementById('geminiApiKey');
  const btnToggleApiKey = document.getElementById('btnToggleApiKey');
  const geminiModelSelect = document.getElementById('geminiModelSelect');
  const geminiCustomModel = document.getElementById('geminiCustomModel');

  // 2. OpenAI / Ollama / Local
  const openaiPresetSelect = document.getElementById('openaiPresetSelect');
  const openaiBaseUrl = document.getElementById('openaiBaseUrl');
  const openaiModel = document.getElementById('openaiModel');
  const openaiApiKey = document.getElementById('openaiApiKey');

  // 3. Claude
  const claudeApiKey = document.getElementById('claudeApiKey');
  const claudeModel = document.getElementById('claudeModel');
  const claudeCustomModel = document.getElementById('claudeCustomModel');

  // 4. Custom Endpoint
  const customEndpointUrl = document.getElementById('customEndpointUrl');
  const customHeaders = document.getElementById('customHeaders');
  const customBodyTemplate = document.getElementById('customBodyTemplate');
  const customResponsePath = document.getElementById('customResponsePath');
  const customModel = document.getElementById('customModel');

  // General & Controls
  const aiTimeoutSeconds = document.getElementById('aiTimeoutSeconds');
  const temperatureSlider = document.getElementById('temperatureSlider');
  const tempValueDisplay = document.getElementById('tempValueDisplay');
  const customPromptInstructions = document.getElementById('customPromptInstructions');
  const btnTestApiKey = document.getElementById('btnTestApiKey');
  const btnSaveAiSettings = document.getElementById('btnSaveAiSettings');
  const apiTestStatus = document.getElementById('apiTestStatus');

  // Ollama Security Tip Elements
  const ollamaOriginTip = document.getElementById('ollamaOriginTip');
  const ollamaCmdText = document.getElementById('ollamaCmdText');
  const ollamaCmdWin = document.getElementById('ollamaCmdWin');
  const btnCopyOllamaCmd = document.getElementById('btnCopyOllamaCmd');

  function updateOllamaTipVisibility() {
    if (!ollamaOriginTip) return;
    const isAdvanced = document.body.classList.contains('mode-advanced');
    const preset = openaiPresetSelect ? openaiPresetSelect.value : '';
    const url = openaiBaseUrl ? openaiBaseUrl.value : '';
    const isOllama = preset === 'ollama-local' || url.includes('11434');

    if (isAdvanced && isOllama) {
      ollamaOriginTip.classList.remove('hidden');
    } else {
      ollamaOriginTip.classList.add('hidden');
    }
  }

  function initOllamaSecurityTip() {
    let origin = '';
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      try {
        const fullUrl = chrome.runtime.getURL('');
        const u = new URL(fullUrl);
        origin = (u.origin && u.origin !== 'null') ? u.origin : `${u.protocol}//${u.host}`;
      } catch (e) {}
    }
    const originStr = origin || 'chrome-extension://<this-extension-id>';
    if (ollamaCmdText) {
      ollamaCmdText.textContent = `OLLAMA_ORIGINS="${originStr}" ollama serve`;
    }
    if (ollamaCmdWin) {
      ollamaCmdWin.textContent = `$env:OLLAMA_ORIGINS="${originStr}"; ollama serve`;
    }
  }

  if (btnCopyOllamaCmd && ollamaCmdText) {
    btnCopyOllamaCmd.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ollamaCmdText.textContent);
        const originalText = btnCopyOllamaCmd.textContent;
        btnCopyOllamaCmd.textContent = '✅ Copied!';
        setTimeout(() => {
          btnCopyOllamaCmd.textContent = originalText;
        }, 2000);
      } catch (err) {
        showToast('Could not copy command automatically.', true);
      }
    });
  }

  const OPENAI_PRESETS = {
    'ollama-local': {
      url: 'http://localhost:11434/api/chat',
      model: 'qwen2.5:3b',
      keyPlaceholder: 'Leave blank for local Ollama'
    },
    'lmstudio-local': {
      url: 'http://localhost:1234/v1/chat/completions',
      model: 'local-model',
      keyPlaceholder: 'Leave blank for local LM Studio'
    },
    'deepseek': {
      url: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-chat',
      keyPlaceholder: 'sk-...'
    },
    'groq': {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile',
      keyPlaceholder: 'gsk_...'
    },
    'openai': {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      keyPlaceholder: 'sk-proj-...'
    }
  };

  function updateProviderPanels(selectedProvider) {
    Object.entries(providerPanels).forEach(([providerKey, panelEl]) => {
      if (panelEl) {
        if (providerKey === selectedProvider) {
          panelEl.classList.remove('hidden');
        } else {
          panelEl.classList.add('hidden');
        }
      }
    });
  }

  aiProviderRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        updateProviderPanels(e.target.value);
      }
    });
  });

  if (openaiPresetSelect) {
    openaiPresetSelect.addEventListener('change', () => {
      const presetKey = openaiPresetSelect.value;
      const preset = OPENAI_PRESETS[presetKey];
      if (preset) {
        if (openaiBaseUrl) openaiBaseUrl.value = preset.url;
        if (openaiModel) openaiModel.value = preset.model;
        if (openaiApiKey) openaiApiKey.placeholder = preset.keyPlaceholder;
      }
      updateOllamaTipVisibility();
    });
  }

  if (openaiBaseUrl) {
    openaiBaseUrl.addEventListener('input', () => {
      updateOllamaTipVisibility();
    });
  }

  if (btnToggleApiKey) {
    btnToggleApiKey.addEventListener('click', () => {
      geminiApiKey.type = geminiApiKey.type === 'password' ? 'text' : 'password';
    });
  }

  if (temperatureSlider && tempValueDisplay) {
    temperatureSlider.addEventListener('input', () => {
      tempValueDisplay.textContent = temperatureSlider.value;
    });
  }

  function getSelectedAiProvider() {
    const checked = document.querySelector('input[name="aiProvider"]:checked');
    return checked ? checked.value : 'gemini';
  }

  function getAiFormSettings() {
    const timeoutSec = aiTimeoutSeconds ? parseInt(aiTimeoutSeconds.value, 10) : 90;
    const safeTimeoutSec = (!isNaN(timeoutSec) && timeoutSec > 0) ? timeoutSec : 90;

    return {
      aiProvider: getSelectedAiProvider(),
      geminiApiKey: geminiApiKey ? geminiApiKey.value.trim() : '',
      geminiModel: geminiModelSelect ? geminiModelSelect.value : 'gemini-3.1-flash-lite',
      geminiCustomModel: geminiCustomModel ? geminiCustomModel.value.trim() : '',
      openaiPreset: openaiPresetSelect ? openaiPresetSelect.value : 'openai',
      openaiBaseUrl: openaiBaseUrl ? openaiBaseUrl.value.trim() : '',
      openaiApiKey: openaiApiKey ? openaiApiKey.value.trim() : '',
      openaiModel: openaiModel ? openaiModel.value.trim() : '',
      claudeApiKey: claudeApiKey ? claudeApiKey.value.trim() : '',
      claudeModel: claudeModel ? claudeModel.value : 'claude-3-5-haiku-20241022',
      claudeCustomModel: claudeCustomModel ? claudeCustomModel.value.trim() : '',
      customEndpointUrl: customEndpointUrl ? customEndpointUrl.value.trim() : '',
      customHeaders: customHeaders ? customHeaders.value.trim() : '',
      customBodyTemplate: customBodyTemplate ? customBodyTemplate.value : '',
      customResponsePath: customResponsePath ? customResponsePath.value.trim() : '',
      customModel: customModel ? customModel.value.trim() : '',
      timeoutSeconds: safeTimeoutSec,
      timeoutMs: safeTimeoutSec * 1000,
      temperature: temperatureSlider ? parseFloat(temperatureSlider.value) : 0.1,
      customPromptInstructions: customPromptInstructions ? customPromptInstructions.value.trim() : ''
    };
  }

  async function loadAiSettings() {
    const settings = await getSettings();

    // Set Interface Mode (Simple vs Advanced)
    const isAdvanced = Boolean(settings.advancedMode);
    await setInterfaceMode(isAdvanced, false);

    // Provider radio
    const activeProvider = settings.aiProvider || 'gemini';
    const targetRadio = document.querySelector(`input[name="aiProvider"][value="${activeProvider}"]`);
    if (targetRadio) {
      targetRadio.checked = true;
    }
    updateProviderPanels(activeProvider);

    // 1. Gemini
    if (geminiApiKey) geminiApiKey.value = settings.geminiApiKey || '';
    if (geminiModelSelect) geminiModelSelect.value = settings.geminiModel || 'gemini-3.1-flash-lite';
    if (geminiCustomModel) geminiCustomModel.value = settings.geminiCustomModel || '';

    // 2. OpenAI / Local
    if (openaiPresetSelect) {
      openaiPresetSelect.value = settings.openaiPreset || (settings.openaiBaseUrl?.includes('localhost:11434') ? 'ollama-local' : 'openai');
    }
    if (openaiBaseUrl) openaiBaseUrl.value = settings.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions';
    if (openaiApiKey) openaiApiKey.value = settings.openaiApiKey || '';
    if (openaiModel) openaiModel.value = settings.openaiModel || 'gpt-4o-mini';

    // 3. Claude
    if (claudeApiKey) claudeApiKey.value = settings.claudeApiKey || '';
    if (claudeModel) claudeModel.value = settings.claudeModel || 'claude-3-5-haiku-20241022';
    if (claudeCustomModel) claudeCustomModel.value = settings.claudeCustomModel || '';

    // 4. Custom
    if (customEndpointUrl) customEndpointUrl.value = settings.customEndpointUrl || '';
    if (customHeaders) customHeaders.value = settings.customHeaders || '';
    if (customBodyTemplate) {
      customBodyTemplate.value = settings.customBodyTemplate ||
        '{\n  "model": "{{MODEL}}",\n  "prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}",\n  "temperature": {{TEMPERATURE}}\n}';
    }
    if (customResponsePath) customResponsePath.value = settings.customResponsePath || 'choices[0].message.content';
    if (customModel) customModel.value = settings.customModel || '';

    // General
    if (aiTimeoutSeconds) {
      aiTimeoutSeconds.value = settings.timeoutSeconds || Math.round((settings.timeoutMs || 90000) / 1000);
    }
    if (temperatureSlider && tempValueDisplay) {
      temperatureSlider.value = settings.temperature !== undefined ? settings.temperature : 0.1;
      tempValueDisplay.textContent = temperatureSlider.value;
    }
    if (customPromptInstructions) {
      customPromptInstructions.value = settings.customPromptInstructions || '';
    }

    initOllamaSecurityTip();
    updateOllamaTipVisibility();
  }

  btnSaveAiSettings.addEventListener('click', async () => {
    const aiConfig = getAiFormSettings();
    await saveSettings(aiConfig);
    showToast('AI engine settings saved successfully!');
  });

  btnTestApiKey.addEventListener('click', async () => {
    const formSettings = getAiFormSettings();
    const provider = formSettings.aiProvider;

    // Fast client-side sanity check
    if (provider === 'gemini' && !formSettings.geminiApiKey) {
      alert('Please enter a Google Gemini API Key to test.');
      return;
    }
    if (provider === 'claude' && !formSettings.claudeApiKey) {
      alert('Please enter an Anthropic Claude API Key to test.');
      return;
    }
    if (provider === 'custom' && !formSettings.customEndpointUrl) {
      alert('Please enter a Custom Endpoint URL to test.');
      return;
    }
    if (provider === 'openai-compatible' && !formSettings.openaiBaseUrl) {
      alert('Please enter an Endpoint URL to test.');
      return;
    }

    btnTestApiKey.disabled = true;
    btnTestApiKey.textContent = 'Testing...';
    apiTestStatus.className = 'test-status-box';
    apiTestStatus.textContent = `Connecting to ${provider}...`;
    apiTestStatus.classList.remove('hidden');

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SMARTFORM_TEST_KEY',
        settings: formSettings
      });

      if (resp && resp.success) {
        apiTestStatus.className = 'test-status-box success';
        const modelLabel = resp.result?.model || formSettings.geminiModel || formSettings.openaiModel || formSettings.claudeModel || 'Custom';
        apiTestStatus.textContent = `🟢 Connected! Provider: ${provider} (${modelLabel}) responded successfully in ${resp.durationMs}ms.`;
      } else {
        apiTestStatus.className = 'test-status-box error';
        apiTestStatus.textContent = `🔴 Test Failed: ${resp?.error || 'Unknown error'}`;
      }
    } catch (err) {
      apiTestStatus.className = 'test-status-box error';
      apiTestStatus.textContent = `🔴 Test Failed: ${err.message}`;
    } finally {
      btnTestApiKey.disabled = false;
      btnTestApiKey.textContent = 'Test Connection';
    }
  });

  // --- TAB 4: PREFERENCES ---
  const prefTier1Enabled = document.getElementById('prefTier1Enabled');
  const prefTier2Enabled = document.getElementById('prefTier2Enabled');
  const prefFillOnlyEmpty = document.getElementById('prefFillOnlyEmpty');
  const prefSmartLearningEnabled = document.getElementById('prefSmartLearningEnabled');
  const prefDebugLogging = document.getElementById('prefDebugLogging');
  const prefDomainBlacklist = document.getElementById('prefDomainBlacklist');
  const prefShowFloatingButton = document.getElementById('prefShowFloatingButton');
  const prefFloatingPos = document.getElementById('prefFloatingPos');
  const prefHighlightDuration = document.getElementById('prefHighlightDuration');
  const btnSavePreferences = document.getElementById('btnSavePreferences');

  async function loadPreferences() {
    const s = await getSettings();
    prefTier1Enabled.checked = s.tier1Enabled !== false;
    prefTier2Enabled.checked = s.tier2Enabled !== false;
    prefFillOnlyEmpty.checked = s.fillOnlyEmptyFields !== false;
    prefSmartLearningEnabled.checked = s.smartLearningEnabled !== false;
    prefDebugLogging.checked = Boolean(s.debugLogging);
    prefShowFloatingButton.checked = s.showFloatingButton !== false;
    prefFloatingPos.value = s.floatingButtonPosition || 'bottom-right';
    prefHighlightDuration.value = s.highlightDuration || 2500;
    if (prefDomainBlacklist) {
      prefDomainBlacklist.value = s.domainBlacklist || '';
    }
  }

  btnSavePreferences.addEventListener('click', async () => {
    await saveSettings({
      tier1Enabled: prefTier1Enabled.checked,
      tier2Enabled: prefTier2Enabled.checked,
      fillOnlyEmptyFields: prefFillOnlyEmpty.checked,
      smartLearningEnabled: prefSmartLearningEnabled.checked,
      debugLogging: prefDebugLogging.checked,
      domainBlacklist: prefDomainBlacklist ? prefDomainBlacklist.value.trim() : '',
      showFloatingButton: prefShowFloatingButton.checked,
      floatingButtonPosition: prefFloatingPos.value,
      highlightDuration: parseInt(prefHighlightDuration.value, 10) || 2500
    });
    showToast('Preferences saved!');
  });

  // --- TAB 5: LOGS & AI INSPECTOR ---
  const logsEmptyNotice = document.getElementById('logsEmptyNotice');
  const logsTableContainer = document.getElementById('logsTableContainer');
  const logsTableBody = document.getElementById('logsTableBody');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const aiInspectorCard = document.getElementById('aiInspectorCard');
  const inspectPromptText = document.getElementById('inspectPromptText');
  const inspectResponseText = document.getElementById('inspectResponseText');

  async function renderLogsTab() {
    const logs = await getFillLogs();
    if (!logs || logs.length === 0) {
      logsEmptyNotice.classList.remove('hidden');
      logsTableContainer.classList.add('hidden');
      aiInspectorCard.classList.add('hidden');
      return;
    }

    logsEmptyNotice.classList.add('hidden');
    logsTableContainer.classList.remove('hidden');
    logsTableBody.innerHTML = '';

    logs.forEach((log) => {
      const tr = document.createElement('tr');
      const timeStr = new Date(log.timestamp).toLocaleTimeString();
      const total = (log.tier1Count || 0) + (log.tier2Count || 0);

      tr.innerHTML = `
        <td>${timeStr}</td>
        <td><strong>${log.domain || 'Local Form'}</strong></td>
        <td>${total} fields (${log.tier1Count || 0} fast, ${log.tier2Count || 0} AI)</td>
        <td>${log.durationMs ? log.durationMs + 'ms' : 'Instant'}</td>
        <td>
          ${log.lastPrompt ? `<button class="btn secondary-btn btn-inspect" style="padding: 4px 10px; font-size: 11.5px;">Inspect</button>` : '—'}
        </td>
      `;

      const inspectBtn = tr.querySelector('.btn-inspect');
      if (inspectBtn) {
        inspectBtn.addEventListener('click', () => {
          inspectPromptText.value = log.lastPrompt || 'None';
          inspectResponseText.value = log.lastResponse || 'None';
          aiInspectorCard.classList.remove('hidden');
          aiInspectorCard.scrollIntoView({ behavior: 'smooth' });
        });
      }

      logsTableBody.appendChild(tr);
    });
  }

  btnClearLogs.addEventListener('click', async () => {
    if (confirm('Clear all fill history?')) {
      await clearFillLogs();
      await renderLogsTab();
      showToast('Logs cleared.');
    }
  });

  // Initial Load
  await loadProfilesList();
  await loadAiSettings();
  await loadPreferences();
});
