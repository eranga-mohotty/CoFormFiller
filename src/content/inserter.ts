/**
 * SmartForm AI - Framework-Aware DOM Inserter
 * Safe DOM property manipulation, React prototype setter bypass, and event dispatching.
 */

import type {
  FillInstruction, FillTier, ApplyFillsOptions, ScannedElementEntry, ScannedFormField
} from '../types/index.js';
import { normalizeDateValue, normalizeTimeValue } from './inserter-normalization.js';

export { normalizeDateValue, normalizeTimeValue } from './inserter-normalization.js';

function dispatchInputEvents(element: Element): void {
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

function applyNativeDescriptorValue(element: Element, normalizedValue: string, tag: string): void {
  const isInput = typeof window !== 'undefined' && Boolean(window.HTMLInputElement) && element instanceof window.HTMLInputElement;
  const isTextArea = typeof window !== 'undefined' && Boolean(window.HTMLTextAreaElement) && element instanceof window.HTMLTextAreaElement;

  if (isTextArea || isInput || tag === 'textarea' || tag === 'input') {
    const prototype = (isTextArea || tag === 'textarea')
      ? (typeof window !== 'undefined' && window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : null)
      : (typeof window !== 'undefined' && window.HTMLInputElement ? window.HTMLInputElement.prototype : null);
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, normalizedValue);
    } else {
      (element as HTMLInputElement | HTMLTextAreaElement).value = normalizedValue;
    }
  } else if ('value' in element) {
    (element as unknown as { value: string }).value = normalizedValue;
  } else {
    element.textContent = normalizedValue;
  }
}

export function setNativeValue(element: Element | null | undefined, value: unknown): void {
  if (!element || !element.tagName) return;
  const tag = element.tagName.toLowerCase();
  const type = ('type' in element && typeof (element as HTMLInputElement).type === 'string'
    ? (element as HTMLInputElement).type : '').toLowerCase();
  let normalizedValue = typeof value === 'string' ? value : String(value ?? '');

  if (type === 'date') normalizedValue = normalizeDateValue(value);
  else if (type === 'time') normalizedValue = normalizeTimeValue(value);

  applyNativeDescriptorValue(element, normalizedValue, tag);
  dispatchInputEvents(element);
}

function setCheckboxOrRadio(element: HTMLInputElement, targetChecked: boolean): void {
  if (element.checked !== targetChecked) {
    element.click();
    if (element.checked !== targetChecked) {
      element.checked = targetChecked;
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }
}

function findMatchingOption(options: HTMLOptionsCollection, targetStr: string): HTMLOptionElement | null {
  for (const opt of options) {
    if (opt.value.trim().toLowerCase() === targetStr) return opt;
  }
  for (const opt of options) {
    const optText = (opt.text || '').trim().toLowerCase();
    if (optText === targetStr || optText.includes(targetStr) || targetStr.includes(optText)) return opt;
  }
  return null;
}

function setSelectValue(selectElement: HTMLSelectElement, targetValue: unknown): boolean {
  if (!selectElement || !targetValue) return false;
  const strTarget = String(targetValue).trim().toLowerCase();
  const matchedOption = findMatchingOption(selectElement.options, strTarget);

  if (matchedOption) {
    selectElement.value = matchedOption.value;
    selectElement.selectedIndex = matchedOption.index;
    selectElement.dispatchEvent(new Event('input', { bubbles: true }));
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function applyHighlight(element: Element, tier: FillTier = 'tier2', durationMs = 2500): void {
  const className = tier === 'tier1' ? 'smartform-fill-highlight-tier1' : 'smartform-fill-highlight-tier2';
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), durationMs);
}

function fillSingleElement(
  el: HTMLElement,
  info: ScannedFormField,
  fill: FillInstruction,
  tier: FillTier,
  highlightDuration: number
): number {
  if (info.tag === 'select') {
    const val = fill.value !== undefined ? fill.value : '';
    if (val !== null && val !== '' && setSelectValue(el as HTMLSelectElement, val)) {
      applyHighlight(el, tier, highlightDuration);
      return 1;
    }
  } else if (info.type === 'checkbox') {
    const valStr = String(fill.value ?? '').toLowerCase();
    const elVal = (el as HTMLInputElement).value?.toLowerCase() ?? '';
    const shouldCheck = fill.checked === true || valStr === 'true' || valStr === '1' || valStr === 'yes' || (Boolean(valStr) && valStr === elVal);
    if (shouldCheck) {
      setCheckboxOrRadio(el as HTMLInputElement, true);
      applyHighlight(el.closest('label') || el, tier, highlightDuration);
      return 1;
    }
  } else if (info.type === 'radio') {
    const valStr = String(fill.value ?? '').toLowerCase();
    const elVal = (el as HTMLInputElement).value?.toLowerCase() ?? '';
    if (fill.checked === true || (Boolean(valStr) && elVal === valStr)) {
      setCheckboxOrRadio(el as HTMLInputElement, true);
      applyHighlight(el.closest('label') || el, tier, highlightDuration);
      return 1;
    }
  } else if (fill.value !== null && fill.value !== undefined) {
    const stringVal = String(fill.value);
    const finalVal = (info.maxLength && stringVal.length > info.maxLength)
      ? stringVal.substring(0, info.maxLength) : stringVal;
    setNativeValue(el, finalVal);
    applyHighlight(el, tier, highlightDuration);
    return 1;
  }
  return 0;
}

export function applyFillsToDom(
  fills: readonly FillInstruction[],
  scannedMap: ReadonlyMap<string, ScannedElementEntry<HTMLElement>>,
  options: ApplyFillsOptions = {}
): number {
  const { highlightDuration = 2500 } = options;
  let filledCount = 0;

  for (const fill of fills) {
    if (!fill || !fill.uid) continue;
    const scanned = scannedMap.get(fill.uid);
    if (!scanned || !scanned.element) continue;

    try {
      filledCount += fillSingleElement(
        scanned.element, scanned.info, fill, fill.tier || 'tier2', highlightDuration
      );
    } catch (err) {
      console.warn('SmartForm AI could not fill field:', scanned.info.uid, err);
    }
  }

  return filledCount;
}
