/**
 * Framework-Aware DOM Inserter for SmartForm AI
 * Overrides prototype setters and triggers synthetic bubbles events
 * so React, Vue, Angular, Svelte and vanilla forms accept changes immediately.
 */

/**
 * Normalize dates to HTML5 required YYYY-MM-DD
 */
export function normalizeDateValue(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return str;
}

/**
 * Normalize time strings to 24h HH:MM format
 */
export function normalizeTimeValue(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) return str;

  // 12h with AM/PM (e.g. 7:00 AM, 7am, 6:30pm)
  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? match[2] : '00';
    const meridiem = match[3].toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return str;
}

export function setNativeValue(element, value) {
  if (!element || !element.tagName) return;
  const tag = element.tagName.toLowerCase();
  const type = (element.type || '').toLowerCase();
  let normalizedValue = value;

  if (type === 'date') {
    normalizedValue = normalizeDateValue(value);
  } else if (type === 'time') {
    normalizedValue = normalizeTimeValue(value);
  }

  const isInput = typeof window !== 'undefined' && window.HTMLInputElement && element instanceof window.HTMLInputElement;
  const isTextArea = typeof window !== 'undefined' && window.HTMLTextAreaElement && element instanceof window.HTMLTextAreaElement;

  if (isTextArea || isInput || tag === 'textarea' || tag === 'input') {
    const prototype = (isTextArea || tag === 'textarea')
      ? (window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : null)
      : (window.HTMLInputElement ? window.HTMLInputElement.prototype : null);
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : null;

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, normalizedValue);
    } else {
      element.value = normalizedValue;
    }
  } else if ('value' in element) {
    element.value = normalizedValue;
  } else {
    element.textContent = normalizedValue;
  }

  // Dispatch events to notify reactive framework listeners
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

export function setCheckboxOrRadio(element, targetChecked) {
  if (element.checked !== targetChecked) {
    // Native click triggers reactive state listeners without the double-inversion bug
    element.click();
    // Fallback if click was prevented or framework didn't toggle
    if (element.checked !== targetChecked) {
      element.checked = targetChecked;
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }
}

export function setSelectValue(selectElement, targetValue) {
  if (!selectElement || !targetValue) return false;
  const strTarget = String(targetValue).trim().toLowerCase();

  let matchedOption = null;

  // 1. Exact value match
  for (const opt of selectElement.options) {
    if (opt.value.trim().toLowerCase() === strTarget) {
      matchedOption = opt;
      break;
    }
  }

  // 2. Visible text exact or substring match
  if (!matchedOption) {
    for (const opt of selectElement.options) {
      const optText = (opt.text || '').trim().toLowerCase();
      if (optText === strTarget || optText.includes(strTarget) || strTarget.includes(optText)) {
        matchedOption = opt;
        break;
      }
    }
  }

  if (matchedOption) {
    selectElement.value = matchedOption.value;
    selectElement.selectedIndex = matchedOption.index;
    selectElement.dispatchEvent(new Event('input', { bubbles: true }));
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

/**
 * Apply visual glowing highlight to an element
 */
export function applyHighlight(element, tier = 'tier2', durationMs = 2500) {
  const className = tier === 'tier1' ? 'smartform-fill-highlight-tier1' : 'smartform-fill-highlight-tier2';
  element.classList.add(className);

  setTimeout(() => {
    element.classList.remove(className);
  }, durationMs);
}

/**
 * Apply all resolved fills to the DOM
 */
export function applyFillsToDom(fills, scannedMap, options = {}) {
  const { highlightDuration = 2500 } = options;
  let filledCount = 0;

  for (const fill of fills) {
    if (!fill || !fill.uid) continue;
    const scanned = scannedMap.get(fill.uid);
    if (!scanned || !scanned.element) continue;

    const el = scanned.element;
    const info = scanned.info;
    const tier = fill.tier || 'tier2';

    try {
      if (info.tag === 'select') {
        const val = fill.value !== undefined ? fill.value : '';
        if (val !== null && val !== '') {
          const success = setSelectValue(el, val);
          if (success) {
            applyHighlight(el, tier, highlightDuration);
            filledCount++;
          }
        }
      } else if (info.type === 'checkbox') {
        // If checked property is specified
        if (typeof fill.checked === 'boolean') {
          if (fill.checked) {
            setCheckboxOrRadio(el, true);
            applyHighlight(el.closest('label') || el, tier, highlightDuration);
            filledCount++;
          }
        } else if (fill.value !== undefined && fill.value !== null) {
          // Check if value matches
          const valStr = String(fill.value).toLowerCase();
          const shouldCheck = valStr === 'true' || valStr === '1' || valStr === 'yes' || valStr === el.value.toLowerCase();
          if (shouldCheck) {
            setCheckboxOrRadio(el, true);
            applyHighlight(el.closest('label') || el, tier, highlightDuration);
            filledCount++;
          }
        }
      } else if (info.type === 'radio') {
        const valStr = String(fill.value || '').toLowerCase();
        if (fill.checked === true || (valStr && el.value.toLowerCase() === valStr)) {
          setCheckboxOrRadio(el, true);
          applyHighlight(el.closest('label') || el, tier, highlightDuration);
          filledCount++;
        }
      } else {
        // Text, textarea, email, tel, number, url, etc.
        if (fill.value !== null && fill.value !== undefined) {
          const stringVal = String(fill.value);
          // respect maxLength if present
          const finalVal = (info.maxLength && stringVal.length > info.maxLength)
            ? stringVal.substring(0, info.maxLength)
            : stringVal;

          setNativeValue(el, finalVal);
          applyHighlight(el, tier, highlightDuration);
          filledCount++;
        }
      }
    } catch (err) {
      console.warn('SmartForm AI could not fill field:', info.uid, err);
    }
  }

  return filledCount;
}
