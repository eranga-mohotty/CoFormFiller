/**
 * Legacy Extension Profile Converter
 */

function createEmptyProfileData() {
  return {
    businessName: '',
    tradingName: '',
    contactName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    mobile: '',
    website: '',
    address: { street: '', city: '', state: '', postalCode: '', country: '' },
    services: [],
    openingHours: {
      monday: { open: '07:00', close: '18:00', closed: false },
      tuesday: { open: '07:00', close: '18:00', closed: false },
      wednesday: { open: '07:00', close: '18:00', closed: false },
      thursday: { open: '07:00', close: '18:00', closed: false },
      friday: { open: '07:00', close: '18:00', closed: false },
      saturday: { open: '08:00', close: '16:00', closed: false },
      sunday: { open: '', close: '', closed: false, onCall24_7: true },
      alwaysOpen: false,
      rawHoursText: ''
    },
    descriptions: { short: '', full: '', tagline: '' },
    faqs: [],
    customFields: []
  };
}

function processContactField(id, name, val, parsed) {
  if (id === 'fullname' || name === 'full name') parsed.contactName = val;
  else if (id === 'firstname' || name === 'first name') parsed.firstName = val;
  else if (id === 'lastname' || name === 'last name') parsed.lastName = val;
  else if (id === 'email' || name.includes('email')) parsed.email = val;
  else if (id === 'phone' || id === 'tel' || name.includes('phone') || name.includes('tel')) parsed.phone = val;
  else if (id === 'portfolio' || id === 'website' || name.includes('portfolio') || name.includes('website') || name.includes('url')) parsed.website = val;
  else return false;
  return true;
}

function processAddressField(id, name, val, parsed) {
  if (id === 'address' || name === 'address' || id.includes('street')) parsed.address.street = val;
  else if (id === 'city' || name === 'city' || id === 'suburb') parsed.address.city = val;
  else if (id === 'state' || name === 'state' || id === 'region') parsed.address.state = val;
  else if (id === 'postcode' || id === 'zip' || name.includes('postcode') || name.includes('zip')) parsed.address.postalCode = val;
  else if (id === 'country' || name === 'country') parsed.address.country = val;
  else return false;
  return true;
}

function processFaqBlock(val, parsed) {
  const qaBlocks = val.split(/(?=Q\))/gi);
  for (const block of qaBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^Q\)\s*([\s\S]*?)\s*A\)\s*([\s\S]*)$/i);
    if (match) {
      parsed.faqs.push({ q: match[1].trim(), a: match[2].trim() });
    } else {
      parsed.faqs.push({ q: 'General Inquiry', a: trimmed });
    }
  }
}

function processContentField(id, name, val, parsed) {
  if (name.includes('services provided') || id.includes('service')) {
    parsed.services = val.split(/,|\n/).map((s) => s.trim()).filter(Boolean);
  } else if (name.includes('faq') || name.includes('frequently asked')) {
    processFaqBlock(val, parsed);
  } else if (id === 'description' || name === 'description' || name.includes('about')) {
    parsed.descriptions.full = val;
    if (val.length > 140) {
      const firstSentence = val.split(/\. |\n/)[0];
      parsed.descriptions.short = firstSentence ? firstSentence.trim() + '.' : val.substring(0, 140);
    } else {
      parsed.descriptions.short = val;
    }
  } else if (id.includes('hour') || name.includes('hour') || name.includes('open')) {
    parsed.openingHours.rawHoursText = val;
  }
}

function inferBusinessName(parsedData, profileName) {
  if (parsedData.businessName) return parsedData.businessName;
  if (parsedData.website) {
    try {
      const domain = new URL(parsedData.website).hostname.replace('www.', '').split('.')[0];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (_e) {
      return profileName;
    }
  }
  return profileName;
}

export function parseLegacyProfile(legacyProfile) {
  const profileId = legacyProfile.id || ('prof_' + Math.random().toString(36).substring(2, 8));
  const profileName = legacyProfile.name || 'Imported Profile';
  const createdAt = legacyProfile.createdAt ? new Date(legacyProfile.createdAt).getTime() : Date.now();
  const updatedAt = legacyProfile.updatedAt ? new Date(legacyProfile.updatedAt).getTime() : Date.now();

  const rawFields = legacyProfile.fields || {};
  const fieldList = Array.isArray(rawFields) ? rawFields : Object.values(rawFields);
  const parsedData = createEmptyProfileData();

  for (const f of fieldList) {
    if (!f || typeof f !== 'object') continue;
    const id = String(f.id || '').toLowerCase();
    const name = String(f.name || '').toLowerCase();
    const val = (f.value !== undefined && f.value !== null) ? String(f.value).trim() : '';
    if (!val) continue;

    const handled = processContactField(id, name, val, parsedData) || processAddressField(id, name, val, parsedData);
    if (!handled) processContentField(id, name, val, parsedData);

    parsedData.customFields.push({ key: f.name || f.id || 'Field', value: val, category: f.category || 'general' });
  }

  parsedData.businessName = inferBusinessName(parsedData, profileName);
  return {
    id: profileId,
    name: profileName === 'Personal' && parsedData.businessName ? `${parsedData.businessName} Profile` : profileName,
    createdAt,
    updatedAt,
    data: parsedData
  };
}
