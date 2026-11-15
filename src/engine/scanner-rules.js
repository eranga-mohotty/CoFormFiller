/**
 * DOM Field Sensitivity & Security Rules
 */

const SENSITIVE_KEYWORDS = [
  'password', 'passcode', 'pwd', 'cvv', 'cvc', 'security code', 'card number',
  'credit card', 'debit card', 'exp-date', 'cc-exp', 'cc-number', 'cc number',
  'ssn', 'tax id', 'social security', 'pin', 'otp', '2fa', 'token', 'auth code',
  'secret', 'bank account', 'routing number', 'cardholder'
];

const UTILITY_KEYWORDS = [
  'search', 'query', 'captcha', 'verification', 'verify', 'coupon', 'promo',
  'discount', 'voucher', 'newsletter', 'subscribe', 'terms', 'privacy',
  'consent', 'agree', 'confirm_email', 're_enter', 'repeat_password'
];

export function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.type === 'hidden') return false;
  if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && !el.getClientRects().length) {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  return true;
}

function getLabelForElement(el) {
  if (!el.id) return null;
  const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  return labelFor && labelFor.textContent ? labelFor.textContent.trim() : null;
}

function getParentLabelText(el) {
  const parentLabel = el.closest('label');
  if (!parentLabel || !parentLabel.textContent) return null;
  const clone = parentLabel.cloneNode(true);
  const innerInputs = clone.querySelectorAll('input, select, textarea');
  innerInputs.forEach((i) => i.remove());
  const text = clone.textContent.trim();
  return text || null;
}

function getAriaLabelText(el) {
  const parts = [];
  if (el.getAttribute('aria-label')) {
    parts.push(el.getAttribute('aria-label').trim());
  }
  if (el.getAttribute('aria-labelledby')) {
    const ids = el.getAttribute('aria-labelledby').split(/\s+/);
    for (const lid of ids) {
      const target = document.getElementById(lid);
      if (target && target.textContent) {
        parts.push(target.textContent.trim());
      }
    }
  }
  return parts;
}

export function extractFieldLabel(el) {
  const parts = [];
  const forLabel = getLabelForElement(el);
  if (forLabel) parts.push(forLabel);

  const parentText = getParentLabelText(el);
  if (parentText && !parts.includes(parentText)) parts.push(parentText);

  parts.push(...getAriaLabelText(el));

  if (el.placeholder && el.placeholder.trim()) {
    parts.push(el.placeholder.trim());
  }

  if (parts.length === 0) {
    const prev = el.previousElementSibling;
    if (prev && ['SPAN', 'P', 'STRONG', 'B', 'DIV'].includes(prev.tagName) && prev.textContent.trim().length < 60) {
      parts.push(prev.textContent.trim());
    }
  }

  if (parts.length === 0 && el.name) {
    parts.push(el.name.replace(/[-_]/g, ' ').trim());
  }

  const rawLabel = parts.join(' | ');
  return rawLabel.replace(/[\*:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractGroupContext(el) {
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      return legend.textContent.trim().replace(/[\*:]+/g, ' ').replace(/\s+/g, ' ');
    }
  }

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

export function isSensitiveField(el, extraLabel = '') {
  if (!el) return false;
  if ((el.type || '').toLowerCase() === 'password') return true;

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

export function isLearnableField(info, el) {
  if (!el || !el.isConnected) return false;
  if (isSensitiveField(el, info?.label || '')) return false;

  const type = (info?.type || el.type || '').toLowerCase();
  if (['password', 'hidden', 'submit', 'reset', 'button', 'file', 'image'].includes(type)) {
    return false;
  }

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

  const label = (info?.label || '').trim();
  return Boolean(label && label.length >= 2 && label.length <= 90);
}
