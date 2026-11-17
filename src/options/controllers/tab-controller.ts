/**
 * Tab Navigation & Simple vs Advanced Mode Controller
 */

import { $ } from './common.js';
import { saveSettings } from '../../services/storage.js';

export interface InterfaceModeCallbacks {
  onModeChange?: (isAdvanced: boolean) => void;
  onSimpleModeReset?: () => void;
}

function renderOpenAiLabels(isAdvanced: boolean): void {
  const nameEl = $('providerNameOpenAi');
  const descEl = $('providerDescOpenAi');
  const titleEl = $('panelTitleOpenAi');
  const panelDescEl = $('panelDescOpenAi');

  if (isAdvanced) {
    if (nameEl) nameEl.textContent = 'OpenAI & Local Models';
    if (descEl) descEl.textContent = 'Local Ollama, LM Studio, DeepSeek, Groq, OpenAI.';
    if (titleEl) titleEl.textContent = 'OpenAI-Compatible & Local Model Settings';
    if (panelDescEl) {
      const s1 = document.createElement('strong');
      s1.textContent = 'Ollama';
      const s2 = document.createElement('strong');
      s2.textContent = 'LM Studio';
      panelDescEl.replaceChildren(
        document.createTextNode('Connect to any OpenAI-compatible server. For local models like '),
        s1,
        document.createTextNode(' or '),
        s2,
        document.createTextNode(', 0 bytes ever leave your machine.')
      );
    }
  } else {
    if (nameEl) nameEl.textContent = 'OpenAI';
    if (descEl) descEl.textContent = 'Cloud model (gpt-4o-mini).';
    if (titleEl) titleEl.textContent = 'OpenAI Settings';
    if (panelDescEl) {
      panelDescEl.textContent = 'Connect directly to OpenAI. For local offline models like Ollama, switch to Advanced Mode in the sidebar.';
    }
  }
}

export function initTabNavigation(onTabChange?: (tabId: string) => void): void {
  const navItems = document.querySelectorAll<HTMLElement>('.nav-item');
  const tabPanes = document.querySelectorAll<HTMLElement>('.tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      if (targetId) {
        const targetPane = $(targetId);
        if (targetPane) targetPane.classList.add('active');
        if (onTabChange) onTabChange(targetId);
      }
    });
  });
}

async function setInterfaceMode(
  isAdvanced: boolean,
  persist = true,
  callbacks: InterfaceModeCallbacks = {}
): Promise<void> {
  document.body.classList.toggle('mode-advanced', isAdvanced);
  document.body.classList.toggle('mode-simple', !isAdvanced);
  $('btnModeAdvanced')?.classList.toggle('active', isAdvanced);
  $('btnModeSimple')?.classList.toggle('active', !isAdvanced);

  renderOpenAiLabels(isAdvanced);

  if (!isAdvanced) {
    if (callbacks.onSimpleModeReset) callbacks.onSimpleModeReset();
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav?.getAttribute('data-tab') === 'tab-logs') {
      const profilesNav = document.querySelector<HTMLElement>('.nav-item[data-tab="tab-profiles"]');
      profilesNav?.click();
    }
  }

  if (callbacks.onModeChange) callbacks.onModeChange(isAdvanced);
  if (persist) await saveSettings({ advancedMode: isAdvanced });
}

export function initInterfaceMode(initialAdvanced: boolean, callbacks: InterfaceModeCallbacks = {}): void {
  $('btnModeSimple')?.addEventListener('click', () => { void setInterfaceMode(false, true, callbacks); });
  $('btnModeAdvanced')?.addEventListener('click', () => { void setInterfaceMode(true, true, callbacks); });
  void setInterfaceMode(initialAdvanced, false, callbacks);
}
