/**
 * Domain Entities & Core Business Models for SmartForm AI
 * Pure TypeScript definitions with zero runtime dependencies.
 */

export type FieldCategory =
  | 'general'
  | 'learned'
  | 'compliance'
  | 'personal'
  | 'contact'
  | 'address'
  | 'business'
  | 'web'
  | (string & {});

export interface ContactInfo {
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CompanyDescriptions {
  short: string;
  full: string;
  tagline?: string;
}

export interface DailyHours {
  open: string;
  close: string;
  closed: boolean;
  onCall24_7?: boolean;
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface BusinessHours {
  monday: DailyHours;
  tuesday: DailyHours;
  wednesday: DailyHours;
  thursday: DailyHours;
  friday: DailyHours;
  saturday: DailyHours;
  sunday: DailyHours;
  alwaysOpen?: boolean;
  onCall24_7?: boolean;
  notes?: string;
  rawHoursText?: string;
  [dayOrProp: string]: DailyHours | boolean | string | undefined;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface CustomField {
  key: string;
  value: string;
  category?: FieldCategory;
  createdAt?: number;
  updatedAt?: number;
}

export interface LearnedField extends CustomField {
  category: 'learned';
}

export interface LearnedFieldSaveResult {
  success: boolean;
  profileId: string;
  profileName: string;
  key: string;
  value: string;
}

export interface CompanyProfile extends ContactInfo {
  businessName: string;
  tradingName?: string;
  address: Address;
  services: string[];
  openingHours: BusinessHours;
  descriptions: CompanyDescriptions;
  faqs: FaqItem[];
  customFields: CustomField[];
  business?: { businessName?: string; [key: string]: unknown };
  description?: string;
  [key: string]: unknown;
}

export type ProfileData = CompanyProfile;

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  data: CompanyProfile;
}

export type ProfileUpdateInput = Partial<Omit<Profile, 'id' | 'createdAt'>>;

export function isCustomField(val: unknown): val is CustomField {
  if (typeof val !== 'object' || val === null) return false;
  const cf = val as Record<string, unknown>;
  return typeof cf.key === 'string' && typeof cf.value === 'string';
}

export function isLearnedField(val: unknown): val is LearnedField {
  return isCustomField(val) && val.category === 'learned';
}

export function isFaqItem(val: unknown): val is FaqItem {
  if (typeof val !== 'object' || val === null) return false;
  const item = val as Record<string, unknown>;
  return typeof item.q === 'string' && typeof item.a === 'string';
}

export function isProfile(val: unknown): val is Profile {
  if (typeof val !== 'object' || val === null) return false;
  const p = val as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.createdAt === 'number' &&
    typeof p.updatedAt === 'number' &&
    typeof p.data === 'object' &&
    p.data !== null
  );
}
