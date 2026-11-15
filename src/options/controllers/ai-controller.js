/**
 * AI Engine & Multi-Provider Controller for Options Dashboard
 */

import { $, showToast } from './common.js';
import { getSettings, saveSettings } from '../../services/storage.js';

const OPENAI_PRESETS = {
  'ollama-local': { url: 'http://localhost:11434/api/chat', model: 'qwen2.5:3b', keyPlaceholder: 'Leave blank for local Ollama' },
  'lmstudio-local': { url: 'http://localhost:1234/v1/chat/completions', model: 'local-model', keyPlaceholder: 'Leave blank for local LM Studio' },
  'deepseek': { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keyPlaceholder: 'sk-...' },
  'groq': { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', keyPlaceholder: 'gsk_...' },
  'openai': { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', keyPlaceholder: 'sk-proj-...' }
};

export function updateProviderPanels(selected) {
  const panels = {
    'gemini': $('panel-provider-gemini'),
    'openai-compatible': $('panel-provider-openai'),
    'claude': $('panel-provider-claude'),
    'custom': $('panel-provider-custom')
  };
  Object.entries(panels).forEach(([key, el]) => el?.classList.toggle('hidden', key !== selected));
}

export function updateOllamaTipVisibility() {
  const tip = $('ollamaOriginTip');
  if (!tip) return;
  const isAdvanced = document.body.classList.contains('mode-advanced');
  const preset = $('openaiPresetSelect')?.value;
  const url = $('openaiBaseUrl')?.value || '';
  tip.classList.toggle('hidden', !(isAdvanced && (preset === 'ollama-local' || url.includes('11434'))));
}

function initOllamaSecurityTip() {
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
  if ($('ollamaCmdText')) $('ollamaCmdText').textContent = `OLLAMA_ORIGINS="${originStr}" ollama serve`;
  if ($('ollamaCmdWin')) $('ollamaCmdWin').textContent = `$env:OLLAMA_ORIGINS="${originStr}"; ollama serve`;
}

function getSelectedAiProvider() {
  const checked = document.querySelector('input[name="aiProvider"]:checked');
  return checked ? /** @type {HTMLInputElement} */ (checked).value : 'gemini';
}

function getAiFormSettings() {
  const timeoutSec = parseInt($('aiTimeoutSeconds')?.value, 10);
  const safeTimeout = (!isNaN(timeoutSec) && timeoutSec > 0) ? timeoutSec : 90;

  return {
    aiProvider: getSelectedAiProvider(),
    geminiApiKey: $('geminiApiKey')?.value.trim() || '',
    geminiModel: $('geminiModelSelect')?.value || 'gemini-3.1-flash-lite',
    geminiCustomModel: $('geminiCustomModel')?.value.trim() || '',
    openaiPreset: $('openaiPresetSelect')?.value || 'openai',
    openaiBaseUrl: $('openaiBaseUrl')?.value.trim() || '',
    openaiApiKey: $('openaiApiKey')?.value.trim() || '',
    openaiModel: $('openaiModel')?.value.trim() || '',
    claudeApiKey: $('claudeApiKey')?.value.trim() || '',
    claudeModel: $('claudeModel')?.value || 'claude-3-5-haiku-20241022',
    claudeCustomModel: $('claudeCustomModel')?.value.trim() || '',
    customEndpointUrl: $('customEndpointUrl')?.value.trim() || '',
    customHeaders: $('customHeaders')?.value.trim() || '',
    customBodyTemplate: $('customBodyTemplate')?.value || '',
    customResponsePath: $('customResponsePath')?.value.trim() || '',
    customModel: $('customModel')?.value.trim() || '',
    timeoutSeconds: safeTimeout,
    timeoutMs: safeTimeout * 1000,
    temperature: $('temperatureSlider') ? parseFloat($('temperatureSlider').value) : 0.1,
    customPromptInstructions: $('customPromptInstructions')?.value.trim() || ''
  };
}

export async function loadAiSettings() {
  const s = await getSettings();
  const provider = s.aiProvider || 'gemini';
  const radio = document.querySelector(`input[name="aiProvider"][value="${provider}"]`);
  if (radio) /** @type {HTMLInputElement} */ (radio).checked = true;
  updateProviderPanels(provider);

  if ($('geminiApiKey')) $('geminiApiKey').value = s.geminiApiKey || '';
  if ($('geminiModelSelect')) $('geminiModelSelect').value = s.geminiModel || 'gemini-3.1-flash-lite';
  if ($('geminiCustomModel')) $('geminiCustomModel').value = s.geminiCustomModel || '';

  if ($('openaiPresetSelect')) $('openaiPresetSelect').value = s.openaiPreset || 'openai';
  if ($('openaiBaseUrl')) $('openaiBaseUrl').value = s.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions';
  if ($('openaiApiKey')) $('openaiApiKey').value = s.openaiApiKey || '';
  if ($('openaiModel')) $('openaiModel').value = s.openaiModel || 'gpt-4o-mini';

  if ($('claudeApiKey')) $('claudeApiKey').value = s.claudeApiKey || '';
  if ($('claudeModel')) $('claudeModel').value = s.claudeModel || 'claude-3-5-haiku-20241022';
  if ($('claudeCustomModel')) $('claudeCustomModel').value = s.claudeCustomModel || '';

  if ($('customEndpointUrl')) $('customEndpointUrl').value = s.customEndpointUrl || '';
  if ($('customHeaders')) $('customHeaders').value = s.customHeaders || '';
  if ($('customBodyTemplate')) $('customBodyTemplate').value = s.customBodyTemplate || '';
  if ($('customResponsePath')) $('customResponsePath').value = s.customResponsePath || '';
  if ($('customModel')) $('customModel').value = s.customModel || '';

  if ($('aiTimeoutSeconds')) $('aiTimeoutSeconds').value = s.timeoutSeconds || 90;
  if ($('temperatureSlider')) {
    $('temperatureSlider').value = s.temperature !== undefined ? s.temperature : 0.1;
    if ($('tempValueDisplay')) $('tempValueDisplay').textContent = $('temperatureSlider').value;
  }
  if ($('customPromptInstructions')) $('customPromptInstructions').value = s.customPromptInstructions || '';

  initOllamaSecurityTip();
  updateOllamaTipVisibility();
}

async function runConnectionPing(statusEl, btn) {
  const settings = getAiFormSettings();
  btn.disabled = true;
  btn.textContent = 'Testing...';
  statusEl.className = 'test-status-box';
  statusEl.textContent = `Connecting to ${settings.aiProvider}...`;
  statusEl.classList.remove('hidden');

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SMARTFORM_TEST_KEY', settings });
    if (resp?.success) {
      statusEl.className = 'test-status-box success';
      statusEl.textContent = `🟢 Connected! ${settings.aiProvider} (${resp.result?.model || 'AI'}) responded in ${resp.durationMs}ms.`;
    } else {
      statusEl.className = 'test-status-box error';
      statusEl.textContent = `🔴 Test Failed: ${resp?.error || 'Unknown error'}`;
    }
  } catch (err) {
    statusEl.className = 'test-status-box error';
    statusEl.textContent = `🔴 Test Failed: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

export function initAiController() {
  document.querySelectorAll('input[name="aiProvider"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (/** @type {HTMLInputElement} */ (e.target).checked) updateProviderPanels(/** @type {HTMLInputElement} */ (e.target).value);
    });
  });

  $('openaiPresetSelect')?.addEventListener('change', () => {
    const preset = OPENAI_PRESETS[$('openaiPresetSelect').value];
    if (preset) {
      if ($('openaiBaseUrl')) $('openaiBaseUrl').value = preset.url;
      if ($('openaiModel')) $('openaiModel').value = preset.model;
      if ($('openaiApiKey')) $('openaiApiKey').placeholder = preset.keyPlaceholder;
    }
    updateOllamaTipVisibility();
  });

  $('openaiBaseUrl')?.addEventListener('input', updateOllamaTipVisibility);
  $('btnToggleApiKey')?.addEventListener('click', () => {
    $('geminiApiKey').type = $('geminiApiKey').type === 'password' ? 'text' : 'password';
  });

  $('temperatureSlider')?.addEventListener('input', () => {
    $('tempValueDisplay').textContent = $('temperatureSlider').value;
  });

  $('btnCopyOllamaCmd')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText($('ollamaCmdText').textContent);
    const orig = $('btnCopyOllamaCmd').textContent;
    $('btnCopyOllamaCmd').textContent = '✅ Copied!';
    setTimeout(() => { $('btnCopyOllamaCmd').textContent = orig; }, 2000);
  });

  $('btnSaveAiSettings')?.addEventListener('click', async () => {
    await saveSettings(getAiFormSettings());
    showToast('AI engine settings saved successfully!');
  });

  $('btnTestApiKey')?.addEventListener('click', () => runConnectionPing($('apiTestStatus'), $('btnTestApiKey')));
}
