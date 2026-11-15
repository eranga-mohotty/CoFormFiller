/**
 * DOM Field Scanner for SmartForm AI
 */

import {
  isElementVisible,
  extractFieldLabel,
  extractGroupContext,
  isSensitiveField
} from './scanner-rules.js';

export {
  isElementVisible,
  extractFieldLabel,
  extractGroupContext,
  isSensitiveField,
  isLearnableField
} from './scanner-rules.js';

export function collectFormElements(node, list = []) {
  if (!node) return list;

  const found = node.querySelectorAll ? node.querySelectorAll('input, textarea, select, input[role="combobox"]') : [];
  for (const el of found) {
    const tag = (el.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) {
      list.push(el);
    }
  }

  const allChildren = node.querySelectorAll ? node.querySelectorAll('*') : [];
  for (const child of allChildren) {
    if (child.shadowRoot) {
      collectFormElements(child.shadowRoot, list);
    }
  }

  return list;
}

function resolveFieldValue(el, tag, type) {
  if (tag === 'select') {
    return el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].value : '';
  }
  return type === 'checkbox' || type === 'radio' ? el.checked : el.value;
}

function isFieldAlreadyFilled(currentValue, type) {
  if ((type === 'checkbox' || type === 'radio') && currentValue === true) {
    return true;
  }
  return typeof currentValue === 'string' && currentValue.trim() !== '';
}

function attachSelectOptions(el, fieldInfo) {
  fieldInfo.options = Array.from(el.options || []).map((opt) => ({
    value: opt.value,
    text: (opt.text || opt.label || opt.value || '').trim(),
    selected: opt.selected
  })).filter((o) => o.text !== '' && !o.text.toLowerCase().startsWith('select '));
}

function attachRadioOptions(el, root, fieldInfo) {
  if (!el.name) return;
  const formScope = el.form || root;
  try {
    const siblingRadios = Array.from(formScope.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
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

function inspectElement(el, uid, root) {
  const tag = el.tagName.toLowerCase();
  const type = (el.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();
  const label = extractFieldLabel(el);
  const groupContext = extractGroupContext(el);

  const fieldInfo = {
    uid,
    tag,
    type,
    name: el.name || '',
    id: el.id || '',
    label: label || el.name || el.id || 'Unlabeled field',
    groupContext,
    placeholder: el.placeholder || '',
    required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
    maxLength: el.maxLength > 0 ? el.maxLength : null,
    currentValue: resolveFieldValue(el, tag, type)
  };

  if (tag === 'select') attachSelectOptions(el, fieldInfo);
  if (type === 'checkbox' || type === 'radio') {
    fieldInfo.valueAttr = el.value || 'on';
    fieldInfo.checked = el.checked;
    if (type === 'radio') attachRadioOptions(el, root, fieldInfo);
  }

  return { fieldInfo, label, groupContext, type };
}

export function scanFormFields(root = document, options = {}) {
  const { fillOnlyEmptyFields = true } = options;
  const elements = collectFormElements(root);
  const scanned = [];
  let uidCounter = 0;

  for (const el of elements) {
    if (!isElementVisible(el) || el.disabled || el.readOnly) continue;

    const rawType = (el.type || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
    if (['submit', 'reset', 'button', 'image', 'file'].includes(rawType)) continue;

    const uid = el.dataset.sfFieldUid || ('sf_field_' + (++uidCounter) + '_' + Math.random().toString(36).substring(2, 6));
    el.dataset.sfFieldUid = uid;

    const { fieldInfo, label, groupContext, type } = inspectElement(el, uid, root);
    const combinedText = [label, groupContext].filter(Boolean).join(' ');
    if (isSensitiveField(el, combinedText)) continue;

    if (fillOnlyEmptyFields && isFieldAlreadyFilled(fieldInfo.currentValue, type)) continue;

    scanned.push({ info: fieldInfo, element: el });
  }

  return scanned;
}
