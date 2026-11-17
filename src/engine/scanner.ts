/**
 * SmartForm AI - DOM Field Scanner
 * Discovers form controls across standard DOM and open Shadow DOM trees.
 */

import type { ScannedFormField, ScannedElementEntry, ScanFormOptions, ScannedFieldOption } from '../types/index.js';
import { isElementVisible, extractFieldLabel, extractGroupContext, isSensitiveField } from './scanner-rules.js';

export { isElementVisible, extractFieldLabel, extractGroupContext, isSensitiveField, isLearnableField } from './scanner-rules.js';

export type SupportedFormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface MutableScannedField {
  uid: string; tag: string; type: string; name: string; id: string; label: string;
  groupContext?: string; placeholder: string; required: boolean; maxLength: number | null;
  currentValue: string | boolean; options?: ScannedFieldOption[]; valueAttr?: string;
  checked?: boolean; radioGroup?: { name: string; options: ScannedFieldOption[] };
}

export function collectFormElements(node?: ParentNode | null, list: SupportedFormElement[] = []): SupportedFormElement[] {
  if (!node) return list;
  const found = typeof node.querySelectorAll === 'function'
    ? node.querySelectorAll<SupportedFormElement>('input, textarea, select, input[role="combobox"]') : [];
  for (const el of found) {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') list.push(el);
  }
  const allChildren = typeof node.querySelectorAll === 'function' ? node.querySelectorAll<Element>('*') : [];
  for (const child of allChildren) {
    if (child.shadowRoot) collectFormElements(child.shadowRoot, list);
  }
  return list;
}

function resolveFieldValue(el: SupportedFormElement, tag: string, type: string): string | boolean {
  if (tag === 'select') {
    const selectEl = el as HTMLSelectElement;
    return selectEl.selectedOptions && selectEl.selectedOptions[0] ? selectEl.selectedOptions[0].value : '';
  }
  return type === 'checkbox' || type === 'radio'
    ? (el as HTMLInputElement).checked
    : (el as HTMLInputElement | HTMLTextAreaElement).value;
}

function isFieldAlreadyFilled(currentValue: string | boolean, type: string): boolean {
  if ((type === 'checkbox' || type === 'radio') && currentValue === true) return true;
  return typeof currentValue === 'string' && currentValue.trim() !== '';
}

function attachSelectOptions(el: HTMLSelectElement, fieldInfo: MutableScannedField): void {
  fieldInfo.options = Array.from(el.options || []).map((opt) => ({
    value: opt.value,
    text: (opt.text || opt.label || opt.value || '').trim(),
    selected: opt.selected
  })).filter((o) => o.text !== '' && !o.text.toLowerCase().startsWith('select '));
}

function attachRadioOptions(el: HTMLInputElement, root: ParentNode, fieldInfo: MutableScannedField): void {
  if (!el.name) return;
  const formScope = el.form || root;
  try {
    const escapedName = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(el.name) : el.name.replace(/(["\\])/g, '\\$1');
    const siblingRadios = Array.from(
      formScope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapedName}"]`)
    );
    fieldInfo.radioGroup = {
      name: el.name,
      options: siblingRadios.map((r) => ({
        value: r.value || 'on',
        text: extractFieldLabel(r),
        checked: r.checked
      }))
    };
  } catch (_e) {
    // Ignore invalid selector names
  }
}

function inspectElement(
  el: SupportedFormElement, uid: string, root: ParentNode
): { fieldInfo: MutableScannedField; label: string; groupContext: string; type: string } {
  const tag = el.tagName.toLowerCase();
  const type = (el.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
  const label = extractFieldLabel(el);
  const groupContext = extractGroupContext(el);

  const fieldInfo: MutableScannedField = {
    uid, tag, type,
    name: el.name || '',
    id: el.id || '',
    label: label || el.name || el.id || 'Unlabeled field',
    groupContext,
    placeholder: 'placeholder' in el ? (el as HTMLInputElement | HTMLTextAreaElement).placeholder || '' : '',
    required: Boolean(el.required || (typeof el.getAttribute === 'function' && el.getAttribute('aria-required') === 'true')),
    maxLength: 'maxLength' in el && typeof el.maxLength === 'number' && el.maxLength > 0 ? el.maxLength : null,
    currentValue: resolveFieldValue(el, tag, type)
  };

  if (tag === 'select') attachSelectOptions(el as HTMLSelectElement, fieldInfo);
  if (type === 'checkbox' || type === 'radio') {
    const inputEl = el as HTMLInputElement;
    fieldInfo.valueAttr = inputEl.value || 'on';
    fieldInfo.checked = inputEl.checked;
    if (type === 'radio') attachRadioOptions(inputEl, root, fieldInfo);
  }
  return { fieldInfo, label, groupContext, type };
}

export function scanFormFields(
  root: ParentNode = document,
  options: ScanFormOptions = {}
): ScannedElementEntry<SupportedFormElement>[] {
  const { fillOnlyEmptyFields = true } = options;
  const elements = collectFormElements(root);
  const scanned: ScannedElementEntry<SupportedFormElement>[] = [];
  let uidCounter = 0;

  for (const el of elements) {
    if (!isElementVisible(el) || el.disabled || ('readOnly' in el && (el as HTMLInputElement).readOnly)) {
      continue;
    }
    const rawType = (el.type || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
    if (['submit', 'reset', 'button', 'image', 'file'].includes(rawType)) continue;

    if (!el.dataset) (el as unknown as { dataset: Record<string, string> }).dataset = {};
    const uid = el.dataset.sfFieldUid || ('sf_field_' + (++uidCounter) + '_' + Math.random().toString(36).substring(2, 6));
    el.dataset.sfFieldUid = uid;

    const { fieldInfo, label, groupContext, type } = inspectElement(el, uid, root);
    const combinedText = [label, groupContext].filter(Boolean).join(' ');
    if (isSensitiveField(el, combinedText)) continue;
    if (fillOnlyEmptyFields && isFieldAlreadyFilled(fieldInfo.currentValue, type)) continue;

    scanned.push({ info: fieldInfo as ScannedFormField, element: el });
  }

  return scanned;
}
