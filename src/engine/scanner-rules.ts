/**
 * DOM Field Sensitivity & Security Rules
 */

import type { FieldMetadata, ScannedFormField } from '../types/engine.js';

interface FieldElementLike {
  readonly isConnected?: boolean; readonly type?: string; readonly name?: string;
  readonly id?: string; readonly autocomplete?: string; readonly placeholder?: string;
  getAttribute?(name: string): string | null;
}

export type ScanElementTarget = Element | HTMLElement | FieldElementLike;

const SENSITIVE_KEYWORDS: readonly string[] = [
  'password', 'passcode', 'pwd', 'cvv', 'cvc', 'security code', 'card number',
  'credit card', 'debit card', 'exp-date', 'cc-exp', 'cc-number', 'cc number',
  'ssn', 'tax id', 'social security', 'pin', 'otp', '2fa', 'token', 'auth code',
  'secret', 'bank account', 'routing number', 'cardholder'
];

const UTILITY_KEYWORDS: readonly string[] = [
  'search', 'query', 'captcha', 'verification', 'verify', 'coupon', 'promo',
  'discount', 'voucher', 'newsletter', 'subscribe', 'terms', 'privacy',
  'consent', 'agree', 'confirm_email', 're_enter', 'repeat_password'
];

export function isElementVisible(el: Element | HTMLElement | null | undefined): boolean {
  if (!el || !el.isConnected) return false;
  if ('type' in el && (el as HTMLInputElement).type === 'hidden') return false;
  if ('style' in el && el.style) {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style.display === 'none' || htmlEl.style.visibility === 'hidden' || htmlEl.style.opacity === '0') return false;
  }
  if (typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && (!el.getClientRects || !el.getClientRects().length)) return false;
  }
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el as Element);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
  }
  return true;
}

function getLabelForElement(el: Element): string | null {
  if (!el.id) return null;
  const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  return labelFor && labelFor.textContent ? labelFor.textContent.trim() : null;
}

function getParentLabelText(el: Element): string | null {
  const parentLabel = el.closest('label');
  if (!parentLabel || !parentLabel.textContent) return null;
  const clone = parentLabel.cloneNode(true) as HTMLElement;
  const innerInputs = clone.querySelectorAll('input, select, textarea');
  innerInputs.forEach((i) => i.remove());
  return clone.textContent?.trim() || null;
}

function getAriaLabelText(el: Element): string[] {
  const parts: string[] = [];
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel.trim());
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    for (const lid of ariaLabelledBy.split(/\s+/)) {
      const target = document.getElementById(lid);
      if (target && target.textContent) parts.push(target.textContent.trim());
    }
  }
  return parts;
}

function extractPreviousSiblingText(el: Element): string | null {
  const prev = el.previousElementSibling;
  if (prev && ['SPAN', 'P', 'STRONG', 'B', 'DIV'].includes(prev.tagName)) {
    const text = prev.textContent?.trim() || '';
    if (text.length < 60) return text;
  }
  return null;
}

export function extractFieldLabel(el: Element | HTMLElement): string {
  const parts: string[] = [];
  const forLabel = getLabelForElement(el);
  if (forLabel) parts.push(forLabel);
  const parentText = getParentLabelText(el);
  if (parentText && !parts.includes(parentText)) parts.push(parentText);
  parts.push(...getAriaLabelText(el));

  if ('placeholder' in el && typeof (el as HTMLInputElement).placeholder === 'string') {
    const placeholder = (el as HTMLInputElement).placeholder.trim();
    if (placeholder) parts.push(placeholder);
  }
  if (parts.length === 0) {
    const siblingText = extractPreviousSiblingText(el);
    if (siblingText) parts.push(siblingText);
  }
  if (parts.length === 0 && 'name' in el && (el as HTMLInputElement).name) {
    parts.push((el as HTMLInputElement).name.replace(/[-_]/g, ' ').trim());
  }

  return parts.join(' | ').replace(/[\*:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractGroupContext(el: Element): string {
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

export function isSensitiveField(el: ScanElementTarget | null | undefined, extraLabel = ''): boolean {
  if (!el) return false;
  if ('type' in el && (el.type || '').toLowerCase() === 'password') return true;

  const ariaLabel = typeof el.getAttribute === 'function' ? (el.getAttribute('aria-label') || '') : '';
  const textToCheck = [
    extraLabel || '',
    ('name' in el && el.name) || '',
    ('id' in el && el.id) || '',
    ('autocomplete' in el && el.autocomplete) || '',
    ariaLabel,
    ('placeholder' in el && el.placeholder) || ''
  ].join(' ').toLowerCase().replace(/[-_]/g, ' ');

  return SENSITIVE_KEYWORDS.some((kw) => textToCheck.includes(kw.replace(/[-_]/g, ' ')));
}

export function isLearnableField(
  info: Partial<FieldMetadata | ScannedFormField> | null | undefined,
  el: ScanElementTarget | null | undefined
): boolean {
  if (!el || !el.isConnected) return false;
  if (isSensitiveField(el, info?.label || '')) return false;

  const type = (info?.type || ('type' in el && el.type) || '').toLowerCase();
  if (['password', 'hidden', 'submit', 'reset', 'button', 'file', 'image'].includes(type)) return false;

  const textToCheck = [
    info?.label || '',
    info?.name || '',
    info?.id || '',
    info?.placeholder || '',
    ('name' in el && el.name) || '',
    ('id' in el && el.id) || ''
  ].join(' ').toLowerCase().replace(/[-_]/g, ' ');

  if (UTILITY_KEYWORDS.some((kw) => textToCheck.includes(kw.replace(/[-_]/g, ' ')))) return false;
  const label = (info?.label || '').trim();
  return Boolean(label && label.length >= 2 && label.length <= 90);
}
