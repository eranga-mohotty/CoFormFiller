/**
 * Content Script for SmartForm AI
 * Mounts floating button, scans DOM, coordinates Tier 1 + Tier 2 filling,
 * and displays toast notifications.
 */

(async () => {
  // Prevent duplicate script execution or double-initialization
  if (window.__smartform_initialized__) {
    return;
  }
  window.__smartform_initialized__ = true;

  // Internal extension page guard:
  // All internal extension forms (e.g. options.html, popup.html) are strictly excluded from form filling,
  // EXCEPT for test forms in /test-forms/
  const isExtensionPage = typeof window !== 'undefined' && window.location &&
    (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'moz-extension:');
  if (isExtensionPage && !window.location.pathname.includes('/test-forms/')) {
    return;
  }

  // Dynamically import helper modules from extension root
  const scannerUrl = chrome.runtime.getURL('src/engine/scanner.js');
  const matcherUrl = chrome.runtime.getURL('src/engine/pattern-matcher.js');
  const inserterUrl = chrome.runtime.getURL('src/content/inserter.js');

  const { scanFormFields, isLearnableField } = await import(scannerUrl);
  const { runPatternMatcher } = await import(matcherUrl);
  const { applyFillsToDom } = await import(inserterUrl);

  let extensionStatus = null;
  let floatingContainer = null;
  let toastEl = null;
  let learnPromptEl = null;
  let isFilling = false;

  // Initialize status from background
  try {
    extensionStatus = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });
    if (extensionStatus && extensionStatus.isBlacklisted) {
      // Gracefully exit on excluded domain
      return;
    }
  } catch (err) {
    console.warn('SmartForm AI: Could not contact background service worker.', err);
    return;
  }

  // Create toast element
  function getOrCreateToast() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'smartform-toast';
      document.body.appendChild(toastEl);
    }
    return toastEl;
  }

  function showToast(message, type = 'info', duration = 3500) {
    const toast = getOrCreateToast();
    toast.textContent = message;
    toast.className = `show ${type}`;

    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = '';
    }, duration);
  }

  // Smart Learning Mode Prompt UI
  function getOrCreateLearnPrompt() {
    if (!learnPromptEl) {
      learnPromptEl = document.createElement('div');
      learnPromptEl.id = 'smartform-learn-prompt';
      document.body.appendChild(learnPromptEl);
    }
    return learnPromptEl;
  }

  function hideLearnPrompt() {
    if (learnPromptEl) {
      learnPromptEl.className = '';
      if (learnPromptEl._autoDismissTimer) {
        clearTimeout(learnPromptEl._autoDismissTimer);
      }
    }
  }

  function showLearnPrompt(key, value, onSave, onDismiss) {
    const prompt = getOrCreateLearnPrompt();
    if (prompt._autoDismissTimer) clearTimeout(prompt._autoDismissTimer);

    const safeKey = String(key || 'Field').replace(/[<>]/g, '');
    const safeVal = String(value || '').replace(/[<>]/g, '');
    const profileName = extensionStatus?.activeProfile?.name || 'Active Profile';

    prompt.innerHTML = `
      <div class="smartform-learn-header">
        <span class="smartform-learn-title">💡 Save to ${profileName}?</span>
        <button class="smartform-learn-close" title="Dismiss">&times;</button>
      </div>
      <div class="smartform-learn-content">
        <span class="smartform-learn-key">${safeKey}</span>: 
        <span class="smartform-learn-val">${safeVal}</span>
      </div>
      <div class="smartform-learn-actions">
        <button class="smartform-learn-save-btn">Save to Profile</button>
        <button class="smartform-learn-dismiss-btn">Dismiss</button>
      </div>
    `;

    prompt.className = 'show';

    const btnSave = prompt.querySelector('.smartform-learn-save-btn');
    const btnDismiss = prompt.querySelector('.smartform-learn-dismiss-btn');
    const btnClose = prompt.querySelector('.smartform-learn-close');

    const handleSave = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideLearnPrompt();
      if (onSave) await onSave();
    };

    const handleDismiss = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideLearnPrompt();
      if (onDismiss) onDismiss();
    };

    btnSave.addEventListener('click', handleSave);
    btnDismiss.addEventListener('click', handleDismiss);
    btnClose.addEventListener('click', handleDismiss);

    // Auto-dismiss after 20 seconds of inactivity
    prompt._autoDismissTimer = setTimeout(() => {
      hideLearnPrompt();
    }, 20000);
  }

  // On-page Vault Unlock Prompt
  let unlockPromptEl = null;

  function showVaultUnlockPrompt(onUnlocked) {
    if (unlockPromptEl) unlockPromptEl.remove();

    unlockPromptEl = document.createElement('div');
    unlockPromptEl.id = 'smartform-unlock-modal';
    unlockPromptEl.innerHTML = `
      <div class="smartform-unlock-card">
        <div class="smartform-unlock-header">
          <span class="smartform-unlock-title">🔒 SmartForm AI Vault is Locked</span>
          <button class="smartform-unlock-close" title="Cancel">&times;</button>
        </div>
        <p class="smartform-unlock-desc">Enter your Master PIN or Password to unlock your knowledge profile and fill this form:</p>
        <div class="smartform-unlock-body">
          <input type="password" class="smartform-unlock-input" placeholder="PIN or Password" autofocus>
          <div class="smartform-unlock-error hidden"></div>
        </div>
        <div class="smartform-unlock-actions">
          <button class="smartform-unlock-cancel-btn">Cancel</button>
          <button class="smartform-unlock-submit-btn">Unlock & Fill</button>
        </div>
      </div>
    `;

    document.body.appendChild(unlockPromptEl);

    const input = unlockPromptEl.querySelector('.smartform-unlock-input');
    const errorEl = unlockPromptEl.querySelector('.smartform-unlock-error');
    const btnSubmit = unlockPromptEl.querySelector('.smartform-unlock-submit-btn');
    const btnCancel = unlockPromptEl.querySelector('.smartform-unlock-cancel-btn');
    const btnClose = unlockPromptEl.querySelector('.smartform-unlock-close');

    setTimeout(() => input?.focus(), 50);

    const handleClose = () => {
      unlockPromptEl.remove();
      unlockPromptEl = null;
      showToast('Form fill cancelled (vault locked)', 'info', 2500);
    };

    const handleUnlock = async () => {
      const pin = input ? input.value : '';
      if (!pin) {
        errorEl.textContent = 'Please enter PIN or password.';
        errorEl.classList.remove('hidden');
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Verifying...';

      try {
        const res = await chrome.runtime.sendMessage({
          type: 'SMARTFORM_VAULT_UNLOCK',
          passphrase: pin
        });

        if (res && res.success) {
          unlockPromptEl.remove();
          unlockPromptEl = null;
          showToast('🔓 Vault Unlocked!', 'success', 2000);
          if (onUnlocked) onUnlocked();
        } else {
          errorEl.textContent = res?.error || 'Incorrect PIN or password.';
          errorEl.classList.remove('hidden');
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Unlock & Fill';
        }
      } catch (err) {
        errorEl.textContent = 'Error: ' + err.message;
        errorEl.classList.remove('hidden');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Unlock & Fill';
      }
    };

    btnSubmit.addEventListener('click', handleUnlock);
    btnCancel.addEventListener('click', handleClose);
    btnClose.addEventListener('click', handleClose);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUnlock();
      if (e.key === 'Escape') handleClose();
    });
  }

  // Smart Learning Mode listener: watches fields unfilled by AI and offers to learn them when user fills them
  function setupLearningMode(scannedFields) {
    if (!scannedFields || !scannedFields.length) return;

    scannedFields.forEach(({ info, element }) => {
      if (!element || element._sfLearningAttached) return;

      // Only attach to fields that remain empty / unchecked after filling
      const isCheckable = element.type === 'checkbox' || element.type === 'radio';
      if (isCheckable && element.checked) return;
      if (!isCheckable && element.value && element.value.trim() !== '') return;

      // Check if candidate qualifies as learnable (reject passwords, payment, otp, captcha, search, etc.)
      if (typeof isLearnableField === 'function' && !isLearnableField(info, element)) {
        return;
      }

      element._sfLearningAttached = true;

      const handleUserFill = () => {
        let enteredValue = '';
        if (isCheckable) {
          if (!element.checked) return;
          enteredValue = element.value && element.value !== 'on' ? element.value : 'Yes';
        } else {
          enteredValue = element.value ? element.value.trim() : '';
        }

        // Must be non-empty and sensible length (1 to 300 chars)
        if (!enteredValue || enteredValue.length < 1 || enteredValue.length > 300) return;

        // Debounce if user already triggered prompt for the same value
        if (element._sfLastLearnedValue === enteredValue) return;

        // Clean key name for the profile
        const cleanKey = (info.label || info.name || info.placeholder || info.id || '')
          .replace(/[*:]/g, '')
          .trim();

        if (!cleanKey || cleanKey.length < 2) return;

        element._sfLastLearnedValue = enteredValue;

        showLearnPrompt(cleanKey, enteredValue, async () => {
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'SMARTFORM_LEARN_FIELD',
              key: cleanKey,
              value: enteredValue
            });
            if (resp && resp.success) {
              showToast(`💡 Saved "${cleanKey}" to profile!`, 'success', 3000);
            } else {
              showToast(`⚠️ Could not save field: ${resp?.error || 'Unknown error'}`, 'error', 3000);
            }
          } catch (e) {
            console.error('Failed to save learned field:', e);
          }
        });
      };

      element.addEventListener('change', handleUserFill);
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.addEventListener('blur', handleUserFill);
      }
    });
  }

  // Inject or update floating button
  function setupFloatingButton() {
    if (!extensionStatus || !extensionStatus.settings || !extensionStatus.settings.showFloatingButton) {
      if (floatingContainer) {
        floatingContainer.remove();
        floatingContainer = null;
      }
      return;
    }

    // Check if there are form elements on this page
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    if (inputs.length === 0) {
      if (floatingContainer) {
        floatingContainer.remove();
        floatingContainer = null;
      }
      return;
    }

    // If container is missing or became detached from DOM (SPA navigation)
    if (!floatingContainer || !floatingContainer.isConnected) {
      if (floatingContainer) floatingContainer.remove();

      floatingContainer = document.createElement('div');
      floatingContainer.id = 'smartform-floating-container';
      floatingContainer.className = `pos-${extensionStatus.settings.floatingButtonPosition || 'bottom-right'}`;

      const btn = document.createElement('button');
      btn.className = 'smartform-float-btn';
      btn.innerHTML = `<span class="smartform-btn-sparkle">✨</span><span class="smartform-btn-text">AI Fill</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        runAutoFillPipeline();
      });

      floatingContainer.appendChild(btn);
      document.body.appendChild(floatingContainer);
    }
  }

  // Run the full Two-Tier filling pipeline
  async function runAutoFillPipeline() {
    if (isFilling) return;
    isFilling = true;

    const btn = floatingContainer ? floatingContainer.querySelector('.smartform-float-btn') : null;
    const originalBtnHtml = btn ? btn.innerHTML : '';

    if (btn) {
      btn.classList.add('loading');
      btn.innerHTML = `<span class="smartform-spinner"></span><span class="smartform-btn-text">Scanning...</span>`;
    }

    try {
      // 1. Refresh latest status & profile from background
      extensionStatus = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });

      // Vault Lock Guard
      if (extensionStatus && extensionStatus.isEncrypted && extensionStatus.isLocked) {
        if (btn) {
          btn.classList.remove('loading');
          btn.innerHTML = originalBtnHtml;
        }
        isFilling = false;
        showVaultUnlockPrompt(() => runAutoFillPipeline());
        return;
      }

      if (!extensionStatus.activeProfile) {
        showToast('⚠️ No active profile selected. Please open SmartForm Settings.', 'error', 4000);
        return;
      }

      const settings = extensionStatus.settings || {};
      const fillOnlyEmpty = settings.fillOnlyEmptyFields !== false;

      // 2. Scan DOM
      const scanned = scanFormFields(document, { fillOnlyEmptyFields: fillOnlyEmpty });

      if (scanned.length === 0) {
        showToast('ℹ️ No unfilled form fields detected on this page.', 'info');
        return;
      }

      // Map uid -> { info, element }
      const scannedMap = new Map();
      for (const item of scanned) {
        scannedMap.set(item.info.uid, item);
      }

      let tier1Count = 0;
      let remainingFields = scanned;

      // 3. TIER 1: Fast Heuristic Pattern Match
      if (settings.tier1Enabled !== false) {
        // Fetch active profile data directly for Tier 1
        const activeProfileResp = await fetchActiveProfileData();
        if (activeProfileResp && activeProfileResp.data) {
          const matchResult = runPatternMatcher(scanned, activeProfileResp.data);
          if (matchResult.matchedFills.length > 0) {
            tier1Count = applyFillsToDom(matchResult.matchedFills, scannedMap, {
              highlightDuration: settings.highlightDuration || 2500
            });
          }
          remainingFields = matchResult.remainingFields;
        }
      }

      // 4. TIER 2: Gemini AI Agent
      let tier2Count = 0;
      if (settings.tier2Enabled !== false && remainingFields.length > 0) {
        if (!extensionStatus.hasApiKey) {
          showToast(`⚡ Filled ${tier1Count} fields via Fast Match. (Gemini API key needed in settings for remaining ${remainingFields.length} fields)`, 'info', 5000);
          return;
        }

        if (btn) {
          btn.innerHTML = `<span class="smartform-spinner"></span><span class="smartform-btn-text">AI Reasoning (${remainingFields.length})...</span>`;
        }

        const simplifiedRemaining = remainingFields.map((item) => item.info);

        const aiResponse = await chrome.runtime.sendMessage({
          type: 'SMARTFORM_RUN_AI_FILL',
          fields: simplifiedRemaining,
          tier1Count,
          url: window.location.href,
          domain: window.location.hostname
        });

        if (!aiResponse.success) {
          throw new Error(aiResponse.error || 'AI fill failed');
        }

        if (aiResponse.fills && aiResponse.fills.length > 0) {
          tier2Count = applyFillsToDom(aiResponse.fills, scannedMap, {
            highlightDuration: settings.highlightDuration || 2500
          });
        }
      }

      // 5. Success Toast
      const totalFilled = tier1Count + tier2Count;
      if (totalFilled > 0) {
        const breakdown = tier1Count > 0 && tier2Count > 0
          ? `(${tier1Count} fast match, ${tier2Count} AI)`
          : (tier2Count > 0 ? `(AI)` : `(fast match)`);
        showToast(`✨ SmartForm: Filled ${totalFilled} field${totalFilled === 1 ? '' : 's'} ${breakdown}!`, 'success', 4000);
      } else {
        showToast('ℹ️ AI reviewed fields but found no matching profile information.', 'info');
      }

      // 6. Smart Learning Mode: Attach listeners to learnable fields left unfilled
      if (settings.smartLearningEnabled !== false) {
        setupLearningMode(scanned);
      }
    } catch (err) {
      console.error('SmartForm AI Fill Error:', err);
      showToast(`⚠️ Fill Error: ${err.message}`, 'error', 5000);
    } finally {
      isFilling = false;
      if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = originalBtnHtml;
      }
    }
  }

  // Helper to fetch active profile data from storage
  async function fetchActiveProfileData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['smartform_profiles', 'smartform_active_profile_id'], (res) => {
        const profiles = res.smartform_profiles || [];
        const activeId = res.smartform_active_profile_id;
        const active = profiles.find((p) => p.id === activeId) || profiles[0] || null;
        resolve(active);
      });
    });
  }

  // Listen for messages from toolbar popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SMARTFORM_TRIGGER_FILL') {
      runAutoFillPipeline().then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.type === 'SMARTFORM_COUNT_FIELDS') {
      const scanned = scanFormFields(document, { fillOnlyEmptyFields: false });
      sendResponse({ count: scanned.length });
      return true;
    }
  });

  // React to settings or profile changes from Options page without requiring full page refresh
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.smartform_settings || changes.smartform_active_profile_id)) {
        chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' }).then((status) => {
          if (status) {
            extensionStatus = status;
            setupFloatingButton();
          }
        }).catch(() => {});
      }
    });
  }

  // Mount floating button
  setupFloatingButton();

  // Re-check periodically or on DOM mutations (e.g. single page applications / multi-step forms)
  let observerTimer = null;
  const observer = new MutationObserver((mutations) => {
    // Only re-check if child nodes were actually added or removed
    const hasNodeChanges = mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0);
    if (!hasNodeChanges) return;

    if (observerTimer) clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      setupFloatingButton();
    }, 600);
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
