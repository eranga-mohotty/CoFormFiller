/**
 * Profile Form Input Populator and Serializer
 */

import { $ } from './common.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FULL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function populateOpeningHours(h = {}) {
  DAYS.forEach((dayAbbr, idx) => {
    const full = FULL_DAYS[idx];
    const dayData = h[full] || h[dayAbbr] || {};
    const openEl = $(`hours_${dayAbbr}_open`);
    const closeEl = $(`hours_${dayAbbr}_close`);
    const closedEl = $(`hours_${dayAbbr}_closed`);

    if (openEl) openEl.value = dayData.open || '07:00';
    if (closeEl) closeEl.value = dayData.close || '18:00';
    if (closedEl) closedEl.checked = Boolean(dayData.closed);
  });

  const h247 = $('profHours247');
  if (h247) h247.checked = Boolean(h.alwaysOpen || h.onCall24_7 || (h.sunday && h.sunday.onCall24_7));
  const rawEl = $('profHoursRaw');
  if (rawEl) rawEl.value = h.rawHoursText || h.notes || '';
}

export function populateProfileInputs(profile) {
  if (!profile) return;
  const d = profile.data || {};

  $('profProfileName').value = profile.name || '';
  $('profBusinessName').value = d.businessName || '';
  $('profTradingName').value = d.tradingName || '';
  $('profWebsite').value = d.website || '';
  $('profContactName').value = d.contactName || '';
  $('profFirstName').value = d.firstName || '';
  $('profLastName').value = d.lastName || '';
  $('profEmail').value = d.email || '';
  $('profPhone').value = d.phone || '';
  $('profMobile').value = d.mobile || '';

  const addr = d.address || {};
  $('profStreet').value = addr.street || '';
  $('profCity').value = addr.city || '';
  $('profState').value = addr.state || '';
  $('profPostalCode').value = addr.postalCode || '';
  $('profCountry').value = addr.country || '';

  populateOpeningHours(d.openingHours || {});

  const desc = d.descriptions || {};
  $('profDescShort').value = desc.short || '';
  const shortCount = $('shortCharCount');
  if (shortCount) shortCount.textContent = `${$('profDescShort').value.length} chars`;
  $('profDescFull').value = desc.full || (typeof d.description === 'string' ? d.description : '');
}

function collectOpeningHours() {
  const openingHours = {
    alwaysOpen: $('profHours247') ? $('profHours247').checked : false,
    rawHoursText: $('profHoursRaw') ? $('profHoursRaw').value.trim() : ''
  };

  DAYS.forEach((dayAbbr, idx) => {
    const full = FULL_DAYS[idx];
    const openEl = $(`hours_${dayAbbr}_open`);
    const closeEl = $(`hours_${dayAbbr}_close`);
    const closedEl = $(`hours_${dayAbbr}_closed`);

    openingHours[full] = {
      open: openEl ? openEl.value : '07:00',
      close: closeEl ? closeEl.value : '18:00',
      closed: closedEl ? closedEl.checked : false
    };
  });

  return openingHours;
}

export function collectProfileFormData(currentServices, currentFaqs, currentCustomFields) {
  return {
    businessName: $('profBusinessName').value.trim(),
    tradingName: $('profTradingName').value.trim(),
    website: $('profWebsite').value.trim(),
    contactName: $('profContactName').value.trim(),
    firstName: $('profFirstName').value.trim(),
    lastName: $('profLastName').value.trim(),
    email: $('profEmail').value.trim(),
    phone: $('profPhone').value.trim(),
    mobile: $('profMobile').value.trim(),
    address: {
      street: $('profStreet').value.trim(),
      city: $('profCity').value.trim(),
      state: $('profState').value.trim(),
      postalCode: $('profPostalCode').value.trim(),
      country: $('profCountry').value.trim()
    },
    services: currentServices,
    openingHours: collectOpeningHours(),
    descriptions: {
      short: $('profDescShort').value.trim(),
      full: $('profDescFull').value.trim()
    },
    faqs: currentFaqs.filter((f) => f.q.trim() || f.a.trim()),
    customFields: currentCustomFields.filter((c) => c.key.trim() || c.value.trim())
  };
}
