/**
 * Profile Form Input Populator and Serializer
 */

import { $ } from './common.js';
import type { Profile, CompanyProfile, BusinessHours, DailyHours, FaqItem, CustomField } from '../../types/domain.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const FULL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function populateOpeningHours(h: Partial<BusinessHours> = {}): void {
  DAYS.forEach((dayAbbr, idx) => {
    const full = FULL_DAYS[idx];
    const dayData = (h[full] || h[dayAbbr] || {}) as Partial<DailyHours>;
    const openEl = $<HTMLInputElement>(`hours_${dayAbbr}_open`);
    const closeEl = $<HTMLInputElement>(`hours_${dayAbbr}_close`);
    const closedEl = $<HTMLInputElement>(`hours_${dayAbbr}_closed`);

    if (openEl) openEl.value = dayData.open || '07:00';
    if (closeEl) closeEl.value = dayData.close || '18:00';
    if (closedEl) closedEl.checked = Boolean(dayData.closed);
  });

  const h247 = $<HTMLInputElement>('profHours247');
  if (h247) h247.checked = Boolean(h.alwaysOpen || h.onCall24_7 || (h.sunday && (h.sunday as DailyHours).onCall24_7));
  const rawEl = $<HTMLTextAreaElement>('profHoursRaw');
  if (rawEl) rawEl.value = h.rawHoursText || h.notes || '';
}

export function populateProfileInputs(profile: Profile | null): void {
  if (!profile) return;
  const d = profile.data || ({} as CompanyProfile);

  const setVal = (id: string, val: string | undefined) => {
    const el = $<HTMLInputElement | HTMLTextAreaElement>(id);
    if (el) el.value = val || '';
  };

  setVal('profProfileName', profile.name);
  setVal('profBusinessName', d.businessName);
  setVal('profTradingName', d.tradingName);
  setVal('profWebsite', d.website);
  setVal('profContactName', d.contactName);
  setVal('profFirstName', d.firstName);
  setVal('profLastName', d.lastName);
  setVal('profEmail', d.email);
  setVal('profPhone', d.phone);
  setVal('profMobile', d.mobile);

  const addr = d.address || { street: '', city: '', state: '', postalCode: '', country: '' };
  setVal('profStreet', addr.street);
  setVal('profCity', addr.city);
  setVal('profState', addr.state);
  setVal('profPostalCode', addr.postalCode);
  setVal('profCountry', addr.country);

  populateOpeningHours(d.openingHours || {});

  const desc = d.descriptions || { short: '', full: '' };
  setVal('profDescShort', desc.short);
  const shortCount = $('shortCharCount');
  if (shortCount) shortCount.textContent = `${desc.short?.length || 0} chars`;
  setVal('profDescFull', desc.full || (typeof d.description === 'string' ? d.description : ''));
}

function collectOpeningHours(): BusinessHours {
  const openingHours: BusinessHours = {
    monday: { open: '07:00', close: '18:00', closed: false },
    tuesday: { open: '07:00', close: '18:00', closed: false },
    wednesday: { open: '07:00', close: '18:00', closed: false },
    thursday: { open: '07:00', close: '18:00', closed: false },
    friday: { open: '07:00', close: '18:00', closed: false },
    saturday: { open: '07:00', close: '18:00', closed: false },
    sunday: { open: '07:00', close: '18:00', closed: false },
    alwaysOpen: $<HTMLInputElement>('profHours247')?.checked ?? false,
    rawHoursText: $<HTMLTextAreaElement>('profHoursRaw')?.value.trim() || ''
  };

  DAYS.forEach((dayAbbr, idx) => {
    const full = FULL_DAYS[idx];
    const openEl = $<HTMLInputElement>(`hours_${dayAbbr}_open`);
    const closeEl = $<HTMLInputElement>(`hours_${dayAbbr}_close`);
    const closedEl = $<HTMLInputElement>(`hours_${dayAbbr}_closed`);

    openingHours[full] = {
      open: openEl?.value || '07:00',
      close: closeEl?.value || '18:00',
      closed: closedEl?.checked ?? false
    };
  });

  return openingHours;
}

export function collectProfileFormData(
  currentServices: string[],
  currentFaqs: FaqItem[],
  currentCustomFields: CustomField[]
): CompanyProfile {
  const getVal = (id: string) => ($<HTMLInputElement | HTMLTextAreaElement>(id)?.value || '').trim();

  return {
    businessName: getVal('profBusinessName'),
    tradingName: getVal('profTradingName'),
    website: getVal('profWebsite'),
    contactName: getVal('profContactName'),
    firstName: getVal('profFirstName'),
    lastName: getVal('profLastName'),
    email: getVal('profEmail'),
    phone: getVal('profPhone'),
    mobile: getVal('profMobile'),
    address: {
      street: getVal('profStreet'),
      city: getVal('profCity'),
      state: getVal('profState'),
      postalCode: getVal('profPostalCode'),
      country: getVal('profCountry')
    },
    services: currentServices,
    openingHours: collectOpeningHours(),
    descriptions: {
      short: getVal('profDescShort'),
      full: getVal('profDescFull')
    },
    faqs: currentFaqs.filter((f) => f.q.trim() || f.a.trim()),
    customFields: currentCustomFields.filter((c) => c.key.trim() || c.value.trim())
  };
}
