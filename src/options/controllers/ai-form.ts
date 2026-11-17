/**
 * AI Settings Form Population and Serialization Helpers
 */

import { $ } from './common.js';
import type { AppSettings, OpenAiPreset, GeminiModel } from '../../types/storage.js';
import type { AiProvider } from '../../types/engine.js';

export interface OpenAiPresetInfo {
  readonly url: string;
  readonly model: string;
  readonly keyPlaceholder: string;
}

export const OPENAI_PRESETS: Record<OpenAiPreset, OpenAiPresetInfo> = {
  'ollama-local': { url: 'http://localhost:11434/api/chat', model: 'qwen2.5:3b', keyPlaceholder: 'Leave blank for local Ollama' },
  'lmstudio-local': { url: 'http://localhost:1234/v1/chat/completions', model: 'local-model', keyPlaceholder: 'Leave blank for local LM Studio' },
  'deepseek': { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keyPlaceholder: 'sk-...' },
  'groq': { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', keyPlaceholder: 'gsk_...' },
  'openai': { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', keyPlaceholder: 'sk-proj-...' }
};

function getSelectedAiProvider(): AiProvider {
  const checked = document.querySelector<HTMLInputElement>('input[name="aiProvider"]:checked');
  return (checked?.value as AiProvider) || 'gemini';
}

export function getAiFormSettings(): Partial<AppSettings> {
  const timeoutSec = parseInt($<HTMLInputElement>('aiTimeoutSeconds')?.value || '90', 10);
  const safeTimeout = (!isNaN(timeoutSec) && timeoutSec > 0) ? timeoutSec : 90;
  const tempSlider = $<HTMLInputElement>('temperatureSlider');

  return {
    aiProvider: getSelectedAiProvider(),
    geminiApiKey: $<HTMLInputElement>('geminiApiKey')?.value.trim() || '',
    geminiModel: ($<HTMLSelectElement>('geminiModelSelect')?.value as GeminiModel) || 'gemini-3.1-flash-lite',
    geminiCustomModel: $<HTMLInputElement>('geminiCustomModel')?.value.trim() || '',
    openaiPreset: ($<HTMLSelectElement>('openaiPresetSelect')?.value as OpenAiPreset) || 'openai',
    openaiBaseUrl: $<HTMLInputElement>('openaiBaseUrl')?.value.trim() || '',
    openaiApiKey: $<HTMLInputElement>('openaiApiKey')?.value.trim() || '',
    openaiModel: $<HTMLInputElement>('openaiModel')?.value.trim() || '',
    claudeApiKey: $<HTMLInputElement>('claudeApiKey')?.value.trim() || '',
    claudeModel: $<HTMLSelectElement>('claudeModel')?.value || 'claude-3-5-haiku-20241022',
    claudeCustomModel: $<HTMLInputElement>('claudeCustomModel')?.value.trim() || '',
    customEndpointUrl: $<HTMLInputElement>('customEndpointUrl')?.value.trim() || '',
    customHeaders: $<HTMLInputElement | HTMLTextAreaElement>('customHeaders')?.value.trim() || '',
    customBodyTemplate: $<HTMLTextAreaElement>('customBodyTemplate')?.value || '',
    customResponsePath: $<HTMLInputElement>('customResponsePath')?.value.trim() || '',
    customModel: $<HTMLInputElement>('customModel')?.value.trim() || '',
    timeoutSeconds: safeTimeout,
    timeoutMs: safeTimeout * 1000,
    temperature: tempSlider ? parseFloat(tempSlider.value) : 0.1,
    customPromptInstructions: $<HTMLTextAreaElement>('customPromptInstructions')?.value.trim() || ''
  };
}

export function populateAiForm(s: Partial<AppSettings>): void {
  const setVal = (id: string, val: string | number | undefined) => {
    const el = $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
    if (el && val !== undefined) el.value = String(val);
  };

  setVal('geminiApiKey', s.geminiApiKey);
  setVal('geminiModelSelect', s.geminiModel || 'gemini-3.1-flash-lite');
  setVal('geminiCustomModel', s.geminiCustomModel);
  setVal('openaiPresetSelect', s.openaiPreset || 'openai');
  setVal('openaiBaseUrl', s.openaiBaseUrl || 'https://api.openai.com/v1/chat/completions');
  setVal('openaiApiKey', s.openaiApiKey);
  setVal('openaiModel', s.openaiModel || 'gpt-4o-mini');
  setVal('claudeApiKey', s.claudeApiKey);
  setVal('claudeModel', s.claudeModel || 'claude-3-5-haiku-20241022');
  setVal('claudeCustomModel', s.claudeCustomModel);
  setVal('customEndpointUrl', s.customEndpointUrl);
  setVal('customHeaders', s.customHeaders);
  setVal('customBodyTemplate', s.customBodyTemplate);
  setVal('customResponsePath', s.customResponsePath);
  setVal('customModel', s.customModel);
  setVal('aiTimeoutSeconds', s.timeoutSeconds || 90);

  const slider = $<HTMLInputElement>('temperatureSlider');
  if (slider) {
    slider.value = String(s.temperature !== undefined ? s.temperature : 0.1);
    const display = $('tempValueDisplay');
    if (display) display.textContent = slider.value;
  }
  setVal('customPromptInstructions', s.customPromptInstructions);
}
