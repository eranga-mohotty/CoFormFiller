/**
 * AI Engine & Multi-Provider Controller for Options Dashboard
 */

import { $, showToast } from './common.js';
import { getSettings, saveSettings } from '../../services/storage.js';
import type { MessageResponse, TestKeyResponseData } from '../../types/messages.js';
import { OPENAI_PRESETS, getAiFormSettings, populateAiForm } from './ai-form.js';

export function updateProviderPanels(selected: string): void {
  const panels: Record<string, HTMLElement | null> = {
    gemini: $('panel-provider-gemini'),
    'openai-compatible': $('panel-provider-openai'),
    claude: $('panel-provider-claude'),
    custom: $('panel-provider-custom')
  };
  Object.entries(panels).forEach(([key, el]) => el?.classList.toggle('hidden', key !== selected));
}

export function updateOllamaTipVisibility(): void {
  const tip = $('ollamaOriginTip');
  if (!tip) return;
  const isAdvanced = document.body.classList.contains('mode-advanced');
  const preset = $<HTMLSelectElement>('openaiPresetSelect')?.value;
  const url = $<HTMLInputElement>('openaiBaseUrl')?.value || '';
  tip.classList.toggle('hidden', !(isAdvanced && (preset === 'ollama-local' || url.includes('11434'))));
}

function initOllamaSecurityTip(): void {
  let origin = '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    try {
      const u = new URL(chrome.runtime.getURL(''));
      origin = (u.origin && u.origin !== 'null') ? u.origin : `${u.protocol}//${u.host}`;
    } catch (_e) {
      origin = '';
    }
  }
  const originStr = origin || 'chrome-extension://<this-extension-id>';
  const cmdText = $('ollamaCmdText');
  const cmdWin = $('ollamaCmdWin');
  if (cmdText) cmdText.textContent = `OLLAMA_ORIGINS="${originStr}" ollama serve`;
  if (cmdWin) cmdWin.textContent = `$env:OLLAMA_ORIGINS="${originStr}"; ollama serve`;
}

export async function loadAiSettings(): Promise<void> {
  const s = await getSettings();
  const provider = s.aiProvider || 'gemini';
  const radio = document.querySelector<HTMLInputElement>(`input[name="aiProvider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  updateProviderPanels(provider);

  populateAiForm(s);
  initOllamaSecurityTip();
  updateOllamaTipVisibility();
}

async function runConnectionPing(statusEl: HTMLElement, btn: HTMLButtonElement): Promise<void> {
  const settings = getAiFormSettings();
  btn.disabled = true;
  btn.textContent = 'Testing...';
  statusEl.className = 'test-status-box';
  statusEl.textContent = `Connecting to ${settings.aiProvider}...`;
  statusEl.classList.remove('hidden');

  try {
    const resp = (await chrome.runtime.sendMessage({
      type: 'SMARTFORM_TEST_KEY',
      action: 'TEST_KEY',
      settings
    })) as (MessageResponse<TestKeyResponseData> & Partial<TestKeyResponseData>) | undefined;

    if (resp?.success) {
      const model = resp.result?.model || resp.data?.result?.model || 'AI';
      const duration = resp.durationMs ?? resp.data?.durationMs ?? 0;
      statusEl.className = 'test-status-box success';
      statusEl.textContent = `🟢 Connected! ${settings.aiProvider} (${model}) responded in ${duration}ms.`;
    } else {
      statusEl.className = 'test-status-box error';
      statusEl.textContent = `🔴 Test Failed: ${resp?.error || 'Unknown error'}`;
    }
  } catch (err: unknown) {
    statusEl.className = 'test-status-box error';
    statusEl.textContent = `🔴 Test Failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

function setupPresetAndControls(): void {
  $('openaiPresetSelect')?.addEventListener('change', () => {
    const select = $<HTMLSelectElement>('openaiPresetSelect');
    const presetKey = select?.value as keyof typeof OPENAI_PRESETS;
    const preset = OPENAI_PRESETS[presetKey];
    if (preset) {
      const urlInput = $<HTMLInputElement>('openaiBaseUrl');
      const modelInput = $<HTMLInputElement>('openaiModel');
      const keyInput = $<HTMLInputElement>('openaiApiKey');
      if (urlInput) urlInput.value = preset.url;
      if (modelInput) modelInput.value = preset.model;
      if (keyInput) keyInput.placeholder = preset.keyPlaceholder;
    }
    updateOllamaTipVisibility();
  });

  $('openaiBaseUrl')?.addEventListener('input', updateOllamaTipVisibility);
  $('btnToggleApiKey')?.addEventListener('click', () => {
    const keyInput = $<HTMLInputElement>('geminiApiKey');
    if (keyInput) keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });
  $('temperatureSlider')?.addEventListener('input', () => {
    const slider = $<HTMLInputElement>('temperatureSlider');
    const display = $('tempValueDisplay');
    if (slider && display) display.textContent = slider.value;
  });
}

function setupAiActionButtons(): void {
  $('btnCopyOllamaCmd')?.addEventListener('click', async () => {
    const cmdText = $('ollamaCmdText')?.textContent || '';
    await navigator.clipboard.writeText(cmdText);
    const btn = $('btnCopyOllamaCmd');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  });

  $('btnSaveAiSettings')?.addEventListener('click', async () => {
    await saveSettings(getAiFormSettings());
    showToast('AI engine settings saved successfully!');
  });

  $('btnTestApiKey')?.addEventListener('click', () => {
    const statusBox = $('apiTestStatus');
    const testBtn = $<HTMLButtonElement>('btnTestApiKey');
    if (statusBox && testBtn) void runConnectionPing(statusBox, testBtn);
  });
}

export function initAiController(): void {
  document.querySelectorAll<HTMLInputElement>('input[name="aiProvider"]').forEach((radio) => {
    radio.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target?.checked) updateProviderPanels(target.value);
    });
  });

  setupPresetAndControls();
  setupAiActionButtons();
}
