/**
 * DOM Field Scanner for SmartForm AI
 * Intelligently inspects visible form elements, labels, options, and group contexts.
 */

// Attributes and names that signal sensitive payment/auth credentials to protect
const SENSITIVE_KEYWORDS = [
  'password', 'passcode', 'pwd', 'cvv', 'cvc', 'security code', 'card number',
  'credit card', 'debit card', 'exp-date', 'cc-exp', 'cc-number', 'cc number',
  'ssn', 'tax id', 'social security', 'pin', 'otp', '2fa', 'token', 'auth code',
  'secret', 'bank account', 'routing number', 'cardholder'
];

// Utility or ephemeral keywords that should NOT be learned into a permanent profile
const UTILITY_KEYWORDS = [
  'search', 'query', 'captcha', 'verification', 'verify', 'coupon', 'promo',
  'discount', 'voucher', 'newsletter', 'subscribe', 'terms', 'privacy',
  'consent', 'agree', 'confirm_email', 're_enter', 'repeat_password'
];

/**
 * Check if an element is visible in the layout
 */
export function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.type === 'hidden') return false;
  if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && !el.getClientRects().length) {
    return false;
  }

  // Check parent styles
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  return true;
}

/**
 * Find the most descriptive human-readable label for a given field
 */
export function extractFieldLabel(el) {
  const parts = [];

  // 1. Label tag with for="..." attribute
  if (el.id) {
    const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (labelFor && labelFor.textContent) {
      parts.push(labelFor.textContent.trim());
    }
  }

  // 2. Ancestor <label>
  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.textContent) {
    const clone = parentLabel.cloneNode(true);
    // remove inputs/selects inside to just get label text
    const innerInputs = clone.querySelectorAll('input, select, textarea');
    innerInputs.forEach((i) => i.remove());
    const text = clone.textContent.trim();
    if (text && !parts.includes(text)) {
      parts.push(text);
    }
  }

  // 3. aria-label or aria-labelledby
  if (el.getAttribute('aria-label')) {
    parts.push(el.getAttribute('aria-label').trim());
  }
  if (el.getAttribute('aria-labelledby')) {
    const labelledByIds = el.getAttribute('aria-labelledby').split(/\s+/);
    for (const lid of labelledByIds) {
      const target = document.getElementById(lid);
      if (target && target.textContent) {
        parts.push(target.textContent.trim());
      }
    }
  }

  // 4. placeholder
  if (el.placeholder && el.placeholder.trim()) {
    parts.push(el.placeholder.trim());
  }

  // 5. Preceding text or table cell header
  if (parts.length === 0) {
    const prev = el.previousElementSibling;
    if (prev && ['SPAN', 'P', 'STRONG', 'B', 'DIV'].includes(prev.tagName) && prev.textContent.trim().length < 60) {
      parts.push(prev.textContent.trim());
    }
  }

  // 6. Name attribute converted to readable text (e.g. business_trading_name -> business trading name)
  if (parts.length === 0 && el.name) {
    parts.push(el.name.replace(/[-_]/g, ' ').trim());
  }

  // Clean up any extra colons, asterisks (* for required), or redundant whitespace
  const rawLabel = parts.join(' | ');
  return rawLabel.replace(/[\*:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract nearest group context (e.g. Fieldset legend, card header, or section title)
 */
export function extractGroupContext(el) {
  // Nearest <fieldset><legend>
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      return legend.textContent.trim().replace(/[\*:]+/g, ' ').replace(/\s+/g, ' ');
    }
  }

  // Nearest section container with a heading
  const container = el.closest('.form-group, .form-row, .field-group, section, .card, [role="group"]');
  if (container) {
    const heading = container.querySelector('h1, h2, h3, h4, h5, h6, .group-title, .section-title, .title');
    if (heading && heading.textContent) {
      const text = heading.textContent.trim();
      if (text.length < 80) return text;
    }
  }

  return '';
}

/**
 * Check if field is sensitive and should be skipped for user security
 */
export function isSensitiveField(el, extraLabel = '') {
  if (!el) return false;
  const type = (el.type || '').toLowerCase();
  if (type === 'password') return true;

  const ariaLabel = typeof el.getAttribute === 'function' ? (el.getAttribute('aria-label') || '') : '';
  const textToCheck = [
    extraLabel || '',
    el.name || '',
    el.id || '',
    el.autocomplete || '',
    ariaLabel,
    el.placeholder || ''
  ].join(' ').toLowerCase().replace(/[-_]/g, ' ');

  return SENSITIVE_KEYWORDS.some((kw) => textToCheck.includes(kw.replace(/[-_]/g, ' ')));
}

/**
 * Check if a field is safe and suitable for Learning Mode
 */
export function isLearnableField(info, el) {
  if (!el || !el.isConnected) return false;
  if (isSensitiveField(el, info?.label || '')) return false;

  const type = (info?.type || el.type || '').toLowerCase();
  if (['password', 'hidden', 'submit', 'reset', 'button', 'file', 'image'].includes(type)) {
    return false;
  }

  // Check utility / ephemeral keywords
  const textToCheck = [
    info?.label || '',
    info?.name || '',
    info?.id || '',
    info?.placeholder || '',
    el.name || '',
    el.id || ''
  ].join(' ').toLowerCase().replace(/[-_]/g, ' ');

  if (UTILITY_KEYWORDS.some((kw) => textToCheck.includes(kw.replace(/[-_]/g, ' ')))) {
    return false;
  }

  // Label must be reasonably clean and human-readable
  const label = (info?.label || '').trim();
  if (!label || label.length < 2 || label.length > 90) return false;

  return true;
}

/**
 * Recursively collect form elements, traversing open shadow roots
 */
export function collectFormElements(node, list = []) {
  if (!node) return list;

  // Query standard inputs, textareas, selects, and native combobox inputs
  const found = node.querySelectorAll ? node.querySelectorAll('input, textarea, select, input[role="combobox"]') : [];
  for (const el of found) {
    const tag = (el.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) {
      list.push(el);
    }
  }

  // Traverse shadow DOM of custom web components
  const allChildren = node.querySelectorAll ? node.querySelectorAll('*') : [];
  for (const child of allChildren) {
    if (child.shadowRoot) {
      collectFormElements(child.shadowRoot, list);
    }
  }

  return list;
}

/**
 * Scan all interactable form fields on the document
 */
export function scanFormFields(root = document, options = {}) {
  const { fillOnlyEmptyFields = true } = options;
  const elements = collectFormElements(root);
  const scanned = [];
  let uidCounter = 0;

  for (const el of elements) {
    // Basic eligibility filters
    if (!isElementVisible(el)) continue;
    if (el.disabled || el.readOnly) continue;

    const tag = el.tagName.toLowerCase();
    const type = (el.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();

    // Skip non-data inputs
    if (['submit', 'reset', 'button', 'image', 'file'].includes(type)) continue;

    // Extract visible label and parent group/fieldset context first
    const label = extractFieldLabel(el);
    const groupContext = extractGroupContext(el);

    // Security guardrail: evaluate element attributes, visible label, and group context together
    const combinedSensitivityText = [label, groupContext].filter(Boolean).join(' ');
    if (isSensitiveField(el, combinedSensitivityText)) continue;

    // Current value
    const currentValue = tag === 'select'
      ? (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].value : '')
      : (type === 'checkbox' || type === 'radio' ? el.checked : el.value);

    // If configured to only fill empty fields and field already has non-default value
    if (fillOnlyEmptyFields) {
      if ((type === 'checkbox' || type === 'radio') && currentValue === true) {
        // already checked, can skip
        continue;
      }
      if (typeof currentValue === 'string' && currentValue.trim() !== '') {
        // already filled
        continue;
      }
    }

    // Attach or reuse stable unique identifier
    let uid = el.dataset.sfFieldUid;
    if (!uid) {
      uidCounter++;
      uid = 'sf_field_' + uidCounter + '_' + Math.random().toString(36).substring(2, 6);
      el.dataset.sfFieldUid = uid;
    }

    // Field definition object
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
      currentValue
    };

    // Extract options for selects
    if (tag === 'select') {
      fieldInfo.options = Array.from(el.options || []).map((opt) => ({
        value: opt.value,
        text: (opt.text || opt.label || opt.value || '').trim(),
        selected: opt.selected
      })).filter((o) => o.text !== '' && !o.text.toLowerCase().startsWith('select '));
    }

    // For checkboxes and radios, grab the immediate label or value text
    if (type === 'checkbox' || type === 'radio') {
      fieldInfo.valueAttr = el.value || 'on';
      fieldInfo.checked = el.checked;

      // Group sibling radio buttons together so AI sees the whole choice set
      if (type === 'radio' && el.name) {
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
        } catch (e) {
          // ignore CSS escape errors on unusual names
        }
      }
    }

    scanned.push({
      info: fieldInfo,
      element: el
    });
  }

  return scanned;
}
