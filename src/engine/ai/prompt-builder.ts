/**
 * AI Prompt Builder - Serializes DOM fields and profile context into LLM prompts
 * Pure Web Platform APIs with zero runtime dependencies.
 */

import type {
  FieldMetadata,
  ScannedFormField,
  ScannedElementEntry,
  ScannedFieldOption,
  AiPromptPayload,
  AiRequestOptions,
  Profile,
  CompanyProfile
} from '../../types/index.js';

const SYSTEM_INSTRUCTION_RULES = `FORM FILLING RULES:
1. BUSINESS DESCRIPTIONS & TEXTAREAS:
   - Check 'maxLength'. If a limit is specified (e.g. 150 chars), craft a concise, natural summary that fits within the limit without getting cut off mid-sentence.
   - For unrestricted textareas, provide the complete, detailed description from the profile.
2. OPERATING / TRADING HOURS:
   - Read the profile's opening hours carefully.
   - Map day/time fields (e.g. Monday Open, Monday Close) to the form's UI.
   - If options are provided for a select element, select the exact 'value' that matches the time (e.g., "07:00", "7:00 AM", or "7am").
   - If a radio button or checkbox asks for 24/7, after-hours, or weekend availability, match it against the profile's schedule.
3. SERVICES & MULTI-CHECKBOXES:
   - For checkbox items (e.g. lists of services or specialties), evaluate the checkbox label and value against the profile's services.
   - Set 'checked': true ONLY for services that genuinely match the profile.
   - Set 'checked': false or omit for services the business does NOT provide.
4. DROPDOWNS (<select>) & RADIO BUTTONS:
   - Carefully review the 'options' list provided for each field.
   - Select the best semantic match and return its exact 'value' (e.g. if the option is {"value": "WA", "text": "Western Australia"}, return "WA").
5. QUESTIONS & FAQS:
   - If a form asks questions (e.g. "What areas do you service?", "Why choose your company?"), formulate a direct, professional answer based on the profile facts and FAQs.
6. ANTI-HALLUCINATION / NO-GUESSING:
   - If the profile genuinely does not contain the required information for a field, return null for that field's value or leave it out. Never invent fictional details.

OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no code fences). The JSON must have a "fills" array:
{
  "fills": [
    {
      "uid": "string (the exact uid from the field)",
      "value": "string or number (the text to insert or option value to select)",
      "checked": true/false (required for checkbox and radio inputs),
      "reasoning": "brief 1-sentence explanation"
    }
  ]
}`;

interface MutableSimplifiedField {
  uid: string;
  tag: string;
  type: string;
  label: string;
  groupContext?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number | null;
  options?: readonly ScannedFieldOption[];
  radioOptions?: readonly ScannedFieldOption[];
  valueAttr?: string;
}

export type ScannedPromptFieldInput = ScannedElementEntry | ScannedFormField | FieldMetadata;

function simplifyField(item: ScannedPromptFieldInput): FieldMetadata {
  const f = ('info' in item && item.info ? item.info : item) as ScannedFormField;
  const clean: MutableSimplifiedField = {
    uid: f.uid,
    tag: f.tag,
    type: f.type,
    label: f.label,
    groupContext: f.groupContext || undefined,
    placeholder: f.placeholder || undefined,
    required: f.required || undefined,
    maxLength: f.maxLength != null && f.maxLength > 0 ? f.maxLength : undefined
  };

  if (f.options && f.options.length > 0) {
    clean.options = f.options.map((o) => ({ value: o.value, text: o.text }));
  }
  const radioOptions = f.radioGroup?.options || f.radioOptions;
  if (radioOptions && radioOptions.length > 0) {
    clean.radioOptions = radioOptions.map((o) => ({ value: o.value, text: o.text }));
  }
  if (f.valueAttr) {
    clean.valueAttr = f.valueAttr;
  }

  return clean as FieldMetadata;
}

function buildSystemInstruction(
  profile: Profile | CompanyProfile | Record<string, unknown>,
  settings: AiRequestOptions = {}
): string {
  const customInstructions = settings.customPromptInstructions
    ? `\nUSER CUSTOM INSTRUCTIONS:\n${settings.customPromptInstructions}\n`
    : '';
  const profileData = ('data' in profile && profile.data ? profile.data : profile) ?? {};

  return `You are SmartForm AI, an intelligent executive assistant and form-filling agent.
Your objective is to examine the provided Web Form Fields and fill them using the Profile Knowledge Base provided.

PROFILE KNOWLEDGE BASE:
${JSON.stringify(profileData, null, 2)}
${customInstructions}
${SYSTEM_INSTRUCTION_RULES}`;
}

export function buildPromptPayload(
  fields: readonly ScannedPromptFieldInput[],
  profile: Profile | CompanyProfile | Record<string, unknown>,
  settings: AiRequestOptions = {}
): AiPromptPayload {
  const systemInstruction = buildSystemInstruction(profile, settings);
  const simplifiedFields = fields.map(simplifyField);
  const userPrompt = `Please determine the optimal values for the following ${simplifiedFields.length} form field(s):\n${JSON.stringify(simplifiedFields, null, 2)}`;

  return {
    systemInstruction,
    userPrompt,
    simplifiedFields
  };
}
