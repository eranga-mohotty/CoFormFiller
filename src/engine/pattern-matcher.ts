/**
 * Tier 1: Fast Heuristic Pattern Matcher
 * Zero-token, instant regex matching for standard fields.
 */

import type { CompanyProfile } from '../types/domain.js';
import type { FillInstruction, MatcherResult, ScannedElementEntry, ScannedFormField } from '../types/engine.js';

export interface HeuristicPatternRule {
  readonly category: string;
  readonly test: (info: ScannedFormField) => boolean;
  readonly extract: (data: CompanyProfile) => string | undefined;
}

// Heuristic pattern definitions
export const PATTERNS: readonly HeuristicPatternRule[] = [
  {
    category: 'email',
    test: (i) => i.type === 'email' || testText(i, /\b(e[-_]?mail|emailaddress)\b/i),
    extract: (d) => d.email
  },
  {
    category: 'phone',
    test: (i) => i.type === 'tel' || testText(i, /\b(phone|telephone|mobile|cell|contact\s*(number|no))\b/i),
    extract: (d) => d.phone || d.mobile
  },
  {
    category: 'firstName',
    test: (i) => testText(i, /\b(first\s*name|given\s*name|fname)\b/i),
    extract: (d) => d.firstName || (d.contactName ? d.contactName.split(' ')[0] : '')
  },
  {
    category: 'lastName',
    test: (i) => testText(i, /\b(last\s*name|surname|family\s*name|lname)\b/i),
    extract: (d) => d.lastName || (d.contactName ? d.contactName.split(' ').slice(1).join(' ') : '')
  },
  {
    category: 'contactName',
    test: (i) => testText(i, /\b(your\s*name|full\s*name|contact\s*name|contact\s*person)\b/i) && !testText(i, /\bbusiness|company\b/i),
    extract: (d) => d.contactName || (d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : '')
  },
  {
    category: 'businessName',
    test: (i) => testText(i, /\b(business\s*name|company\s*name|trading\s*name|organization|organisation)\b/i),
    extract: (d) => d.businessName || d.tradingName
  },
  {
    category: 'website',
    test: (i) => i.type === 'url' || testText(i, /\b(website|portfolio|web\s*url|homepage)\b/i),
    extract: (d) => d.website
  },
  {
    category: 'street',
    test: (i) => testText(i, /\b(street\s*address|address\s*line\s*1|^address$)\b/i),
    extract: (d) => (d.address ? d.address.street : '')
  },
  {
    category: 'city',
    test: (i) => testText(i, /\b(city|suburb|town)\b/i),
    extract: (d) => (d.address ? d.address.city : '')
  },
  {
    category: 'state',
    test: (i) => testText(i, /\b(state|province|region)\b/i) && i.tag !== 'select',
    extract: (d) => (d.address ? d.address.state : '')
  },
  {
    category: 'postalCode',
    test: (i) => testText(i, /\b(postcode|postal\s*code|zip(\s*code)?)\b/i),
    extract: (d) => (d.address ? d.address.postalCode : '')
  },
  {
    category: 'country',
    test: (i) => testText(i, /\b(country)\b/i) && i.tag !== 'select',
    extract: (d) => (d.address ? d.address.country : '')
  }
];

function testText(info: ScannedFormField, regex: RegExp): boolean {
  return regex.test([info.label, info.name, info.id, info.placeholder].join(' '));
}

function isTier1Eligible(info: ScannedFormField): boolean {
  return !(info.tag === 'textarea' || info.type === 'checkbox' || info.type === 'radio' || info.tag === 'select');
}

function tryMatchPattern(item: ScannedElementEntry, profileData: CompanyProfile): FillInstruction | null {
  const info = item.info;
  for (const pattern of PATTERNS) {
    if (!pattern.test(info)) continue;
    const value = pattern.extract(profileData);
    if (typeof value === 'string' && value.trim()) {
      return {
        uid: info.uid, value: value.trim(), fieldInfo: info, element: item.element,
        tier: 'tier1', matchedCategory: pattern.category
      };
    }
  }
  return null;
}

export function runPatternMatcher(
  scannedFields: readonly ScannedElementEntry[],
  profileData?: CompanyProfile | null
): MatcherResult {
  if (!profileData) {
    return { matchedFills: [], remainingFields: [...scannedFields] };
  }

  const matchedFills: FillInstruction[] = [];
  const remainingFields: ScannedElementEntry[] = [];

  for (const item of scannedFields) {
    if (!isTier1Eligible(item.info)) {
      remainingFields.push(item);
      continue;
    }
    const matchedFill = tryMatchPattern(item, profileData);
    if (matchedFill) {
      matchedFills.push(matchedFill);
    } else {
      remainingFields.push(item);
    }
  }

  return { matchedFills, remainingFields };
}
