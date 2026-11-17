/**
 * Smart Learning Mode Event Attachment Helper
 * Safely attaches learning listeners using WeakMap and WeakSet without DOM mutation
 */

import type { ScannedElementEntry, ScannedFormField } from '../types/index.js';
import { showToast } from './toast.js';
import { showLearnPrompt } from './learning-card.js';

export type IsLearnableFieldFn = (info: ScannedFormField, element: Element) => boolean;

const attachedElements = new WeakSet<Element>();
const lastLearnedValues = new WeakMap<Element, string>();

function isPreFilled(element: Element, isCheckable: boolean): boolean {
  const el = element as HTMLInputElement;
  const hasValue = 'value' in el && typeof el.value === 'string' && el.value.trim() !== '';
  const isChecked = 'checked' in el && Boolean(el.checked);
  return (isCheckable && isChecked) || (!isCheckable && hasValue);
}

function promptToSaveField(cleanKey: string, val: string, profileName?: string): void {
  showLearnPrompt(cleanKey, val, profileName, async () => {
    const resp = (await chrome.runtime.sendMessage({
      action: 'LEARN_FIELD',
      type: 'SMARTFORM_LEARN_FIELD',
      key: cleanKey,
      value: val
    })) as { success?: boolean } | undefined;

    showToast(
      resp?.success ? `💡 Saved "${cleanKey}" to profile!` : '⚠️ Could not save field',
      resp?.success ? 'success' : 'error',
      3000
    );
  });
}

function attachFieldLearning(
  info: ScannedFormField,
  element: Element,
  isLearnableField: IsLearnableFieldFn,
  activeProfileName?: string
): void {
  if (attachedElements.has(element)) return;

  const inputEl = element as HTMLInputElement;
  const isCheckable = 'type' in inputEl && (inputEl.type === 'checkbox' || inputEl.type === 'radio');
  if (isPreFilled(element, isCheckable) || !isLearnableField(info, element)) return;

  attachedElements.add(element);

  const onFill = () => {
    const rawVal = 'value' in inputEl ? inputEl.value : '';
    const val = isCheckable ? (rawVal !== 'on' ? rawVal : 'Yes') : (typeof rawVal === 'string' ? rawVal.trim() : '');
    if (!val || val.length > 300 || lastLearnedValues.get(element) === val) return;

    const cleanKey = (info.label || info.name || info.id || '').replace(/[*:]/g, '').trim();
    if (cleanKey.length < 2) return;

    lastLearnedValues.set(element, val);
    promptToSaveField(cleanKey, val, activeProfileName);
  };

  element.addEventListener('change', onFill);
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    element.addEventListener('blur', onFill);
  }
}

export function setupLearningMode(
  scanned: readonly ScannedElementEntry[],
  isLearnableField: IsLearnableFieldFn,
  activeProfileName?: string
): void {
  scanned.forEach(({ info, element }) => {
    if (element) {
      attachFieldLearning(info, element, isLearnableField, activeProfileName);
    }
  });
}
