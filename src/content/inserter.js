/**
 * Framework-Aware DOM Inserter for SmartForm AI
 */

export function normalizeDateValue(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const dmy = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

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

export function normalizeTimeValue(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(str)) return str;

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

  if (type === 'date') normalizedValue = normalizeDateValue(value);
  else if (type === 'time') normalizedValue = normalizeTimeValue(value);

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

  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

function setCheckboxOrRadio(element, targetChecked) {
  if (element.checked !== targetChecked) {
    element.click();
    if (element.checked !== targetChecked) {
      element.checked = targetChecked;
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  }
}

function setSelectValue(selectElement, targetValue) {
  if (!selectElement || !targetValue) return false;
  const strTarget = String(targetValue).trim().toLowerCase();
  let matchedOption = null;

  for (const opt of selectElement.options) {
    if (opt.value.trim().toLowerCase() === strTarget) {
      matchedOption = opt;
      break;
    }
  }

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

function applyHighlight(element, tier = 'tier2', durationMs = 2500) {
  const className = tier === 'tier1' ? 'smartform-fill-highlight-tier1' : 'smartform-fill-highlight-tier2';
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, durationMs);
}

function fillSingleElement(el, info, fill, tier, highlightDuration) {
  if (info.tag === 'select') {
    const val = fill.value !== undefined ? fill.value : '';
    if (val !== null && val !== '' && setSelectValue(el, val)) {
      applyHighlight(el, tier, highlightDuration);
      return 1;
    }
  } else if (info.type === 'checkbox') {
    const valStr = String(fill.value || '').toLowerCase();
    const shouldCheck = fill.checked === true || valStr === 'true' || valStr === '1' || valStr === 'yes' || (valStr && valStr === el.value.toLowerCase());
    if (shouldCheck) {
      setCheckboxOrRadio(el, true);
      applyHighlight(el.closest('label') || el, tier, highlightDuration);
      return 1;
    }
  } else if (info.type === 'radio') {
    const valStr = String(fill.value || '').toLowerCase();
    if (fill.checked === true || (valStr && el.value.toLowerCase() === valStr)) {
      setCheckboxOrRadio(el, true);
      applyHighlight(el.closest('label') || el, tier, highlightDuration);
      return 1;
    }
  } else if (fill.value !== null && fill.value !== undefined) {
    const stringVal = String(fill.value);
    const finalVal = (info.maxLength && stringVal.length > info.maxLength) ? stringVal.substring(0, info.maxLength) : stringVal;
    setNativeValue(el, finalVal);
    applyHighlight(el, tier, highlightDuration);
    return 1;
  }
  return 0;
}

export function applyFillsToDom(fills, scannedMap, options = {}) {
  const { highlightDuration = 2500 } = options;
  let filledCount = 0;

  for (const fill of fills) {
    if (!fill || !fill.uid) continue;
    const scanned = scannedMap.get(fill.uid);
    if (!scanned || !scanned.element) continue;

    try {
      filledCount += fillSingleElement(scanned.element, scanned.info, fill, fill.tier || 'tier2', highlightDuration);
    } catch (err) {
      console.warn('SmartForm AI could not fill field:', scanned.info.uid, err);
    }
  }

  return filledCount;
}
