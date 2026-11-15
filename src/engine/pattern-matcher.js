/**
 * Tier 1: Fast Heuristic Pattern Matcher
 * Zero-token, instant regex matching for standard fields.
 */

// Heuristic pattern definitions
const PATTERNS = [
  {
    category: 'email',
    test: (info) => info.type === 'email' || testText(info, /\b(e[-_]?mail|emailaddress)\b/i),
    extract: (data) => data.email
  },
  {
    category: 'phone',
    test: (info) => info.type === 'tel' || testText(info, /\b(phone|telephone|mobile|cell|contact\s*(number|no))\b/i),
    extract: (data) => data.phone || data.mobile
  },
  {
    category: 'firstName',
    test: (info) => testText(info, /\b(first\s*name|given\s*name|fname)\b/i),
    extract: (data) => data.firstName || (data.contactName ? data.contactName.split(' ')[0] : '')
  },
  {
    category: 'lastName',
    test: (info) => testText(info, /\b(last\s*name|surname|family\s*name|lname)\b/i),
    extract: (data) => data.lastName || (data.contactName ? data.contactName.split(' ').slice(1).join(' ') : '')
  },
  {
    category: 'contactName',
    test: (info) => testText(info, /\b(your\s*name|full\s*name|contact\s*name|contact\s*person)\b/i) && !testText(info, /\bbusiness|company\b/i),
    extract: (data) => data.contactName || (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : '')
  },
  {
    category: 'businessName',
    test: (info) => testText(info, /\b(business\s*name|company\s*name|trading\s*name|organization|organisation)\b/i),
    extract: (data) => data.businessName || data.tradingName
  },
  {
    category: 'website',
    test: (info) => info.type === 'url' || testText(info, /\b(website|portfolio|web\s*url|homepage)\b/i),
    extract: (data) => data.website
  },
  {
    category: 'street',
    test: (info) => testText(info, /\b(street\s*address|address\s*line\s*1|^address$)\b/i),
    extract: (data) => data.address ? data.address.street : ''
  },
  {
    category: 'city',
    test: (info) => testText(info, /\b(city|suburb|town)\b/i),
    extract: (data) => data.address ? data.address.city : ''
  },
  {
    category: 'state',
    test: (info) => testText(info, /\b(state|province|region)\b/i) && info.tag !== 'select',
    extract: (data) => data.address ? data.address.state : ''
  },
  {
    category: 'postalCode',
    test: (info) => testText(info, /\b(postcode|postal\s*code|zip(\s*code)?)\b/i),
    extract: (data) => data.address ? data.address.postalCode : ''
  },
  {
    category: 'country',
    test: (info) => testText(info, /\b(country)\b/i) && info.tag !== 'select',
    extract: (data) => data.address ? data.address.country : ''
  }
];

function testText(info, regex) {
  const composite = [info.label, info.name, info.id, info.placeholder].join(' ');
  return regex.test(composite);
}

/**
 * Run Tier 1 Pattern Matching
 * Returns { matchedFills: [...], remainingFields: [...] }
 */
export function runPatternMatcher(scannedFields, profileData) {
  const matchedFills = [];
  const remainingFields = [];

  if (!profileData) {
    return { matchedFills: [], remainingFields: scannedFields };
  }

  for (const item of scannedFields) {
    const info = item.info;

    // We do NOT use Tier 1 for textareas, checkboxes, radios, or selects,
    // because those require contextual reasoning or option value alignment!
    if (info.tag === 'textarea' || info.type === 'checkbox' || info.type === 'radio' || info.tag === 'select') {
      remainingFields.push(item);
      continue;
    }

    // Check against patterns
    let matched = false;
    for (const pattern of PATTERNS) {
      if (pattern.test(info)) {
        const value = pattern.extract(profileData);
        if (value && typeof value === 'string' && value.trim()) {
          matchedFills.push({
            uid: info.uid,
            value: value.trim(),
            fieldInfo: info,
            element: item.element,
            tier: 'tier1',
            matchedCategory: pattern.category
          });
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      remainingFields.push(item);
    }
  }

  return { matchedFills, remainingFields };
}
