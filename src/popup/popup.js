/**
 * Popup Script for SmartForm AI
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileSelect = document.getElementById('profileSelect');
  const noProfilesNotice = document.getElementById('noProfilesNotice');
  const apiStatusIndicator = document.getElementById('apiStatusIndicator');
  const apiStatusText = document.getElementById('apiStatusText');
  const fieldsCountBadge = document.getElementById('fieldsCountBadge');
  const btnFillPage = document.getElementById('btnFillPage');
  const btnFillText = document.getElementById('btnFillText');
  const btnOpenOptions = document.getElementById('btnOpenOptions');
  const btnManageProfiles = document.getElementById('btnManageProfiles');
  const btnOpenDocs = document.getElementById('btnOpenDocs');
  const linkSetupProfile = document.getElementById('linkSetupProfile');

  // Open Options page helper
  function openOptionsTab() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  }

  btnOpenOptions.addEventListener('click', openOptionsTab);
  btnManageProfiles.addEventListener('click', (e) => {
    e.preventDefault();
    openOptionsTab();
  });
  if (linkSetupProfile) {
    linkSetupProfile.addEventListener('click', (e) => {
      e.preventDefault();
      openOptionsTab();
    });
  }

  btnOpenDocs.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('test-forms/business-directory-form.html') });
  });

  // Load Status
  try {
    const status = await chrome.runtime.sendMessage({ type: 'SMARTFORM_GET_STATUS' });
    if (!status || !status.success) {
      throw new Error('Could not get status');
    }

    // Profiles dropdown
    profileSelect.innerHTML = '';
    if (status.profiles && status.profiles.length > 0) {
      status.profiles.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (status.activeProfile && status.activeProfile.id === p.id) {
          opt.selected = true;
        }
        profileSelect.appendChild(opt);
      });
      noProfilesNotice.classList.add('hidden');
    } else {
      profileSelect.innerHTML = '<option value="">No Profiles Available</option>';
      noProfilesNotice.classList.remove('hidden');
    }

    // API Key Indicator
    if (status.hasApiKey) {
      apiStatusIndicator.className = 'status-indicator ready';
      apiStatusText.textContent = `Gemini Ready (${status.model || '3.8 Flash'})`;
    } else {
      apiStatusIndicator.className = 'status-indicator missing';
      apiStatusText.textContent = 'API Key Needed';
    }

    // Detect fields on active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      try {
        chrome.tabs.sendMessage(activeTab.id, { type: 'SMARTFORM_COUNT_FIELDS' }, (response) => {
          if (chrome.runtime.lastError) {
            fieldsCountBadge.textContent = '?';
            fieldsCountBadge.title = 'Refresh page to inspect fields';
          } else if (response && response.count !== undefined) {
            fieldsCountBadge.textContent = response.count;
          }
        });
      } catch (e) {
        fieldsCountBadge.textContent = '?';
      }
    }
  } catch (err) {
    console.error('Popup init error:', err);
    apiStatusIndicator.className = 'status-indicator missing';
    apiStatusText.textContent = 'Service Offline';
  }

  // Switch profile on select change
  profileSelect.addEventListener('change', async () => {
    const newId = profileSelect.value;
    if (newId) {
      await chrome.runtime.sendMessage({
        type: 'SMARTFORM_SWITCH_PROFILE',
        profileId: newId
      });
    }
  });

  // Trigger Fill on active tab
  btnFillPage.addEventListener('click', async () => {
    btnFillPage.disabled = true;
    btnFillText.textContent = 'Triggering Fill...';

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'SMARTFORM_TRIGGER_FILL' }, () => {
        btnFillText.textContent = 'Fill In Progress...';
        setTimeout(() => {
          window.close();
        }, 1200);
      });
    } else {
      btnFillText.textContent = 'No Active Tab';
      btnFillPage.disabled = false;
    }
  });
});
