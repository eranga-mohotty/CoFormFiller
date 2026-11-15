/**
 * Tab Navigation & Simple vs Advanced Mode Controller
 */

import { $ } from './common.js';
import { saveSettings } from '../../services/storage.js';

function renderOpenAiLabels(isAdvanced) {
  const nameEl = $('providerNameOpenAi');
  const descEl = $('providerDescOpenAi');
  const titleEl = $('panelTitleOpenAi');
  const panelDescEl = $('panelDescOpenAi');

  if (isAdvanced) {
    if (nameEl) nameEl.textContent = 'OpenAI & Local Models';
    if (descEl) descEl.textContent = 'Local Ollama, LM Studio, DeepSeek, Groq, OpenAI.';
    if (titleEl) titleEl.textContent = 'OpenAI-Compatible & Local Model Settings';
    if (panelDescEl) {
      panelDescEl.replaceChildren(
        document.createTextNode('Connect to any OpenAI-compatible server. For local models like '),
        (() => { const s = document.createElement('strong'); s.textContent = 'Ollama'; return s; })(),
        document.createTextNode(' or '),
        (() => { const s = document.createElement('strong'); s.textContent = 'LM Studio'; return s; })(),
        document.createTextNode(', 0 bytes ever leave your machine.')
      );
    }
  } else {
    if (nameEl) nameEl.textContent = 'OpenAI';
    if (descEl) descEl.textContent = 'Cloud model (gpt-4o-mini).';
    if (titleEl) titleEl.textContent = 'OpenAI Settings';
    if (panelDescEl) panelDescEl.textContent = 'Connect directly to OpenAI. For local offline models like Ollama, switch to Advanced Mode in the sidebar.';
  }
}

export function initTabNavigation(onTabChange) {
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPane = $(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (onTabChange && targetId) onTabChange(targetId);
    });
  });
}

async function setInterfaceMode(isAdvanced, persist = true, callbacks = {}) {
  document.body.classList.toggle('mode-advanced', isAdvanced);
  document.body.classList.toggle('mode-simple', !isAdvanced);
  $('btnModeAdvanced')?.classList.toggle('active', isAdvanced);
  $('btnModeSimple')?.classList.toggle('active', !isAdvanced);

  renderOpenAiLabels(isAdvanced);

  if (!isAdvanced) {
    if (callbacks.onSimpleModeReset) callbacks.onSimpleModeReset();
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav?.getAttribute('data-tab') === 'tab-logs') {
      const profilesNav = /** @type {HTMLElement} */ (document.querySelector('.nav-item[data-tab="tab-profiles"]'));
      profilesNav?.click();
    }
  }

  if (callbacks.onModeChange) callbacks.onModeChange(isAdvanced);
  if (persist) await saveSettings({ advancedMode: isAdvanced });
}

export function initInterfaceMode(initialAdvanced, callbacks = {}) {
  $('btnModeSimple')?.addEventListener('click', () => setInterfaceMode(false, true, callbacks));
  $('btnModeAdvanced')?.addEventListener('click', () => setInterfaceMode(true, true, callbacks));
  setInterfaceMode(initialAdvanced, false, callbacks);
}
