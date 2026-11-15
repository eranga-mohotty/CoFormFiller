/**
 * Automated Test for SmartForm AI Pipeline
 * Tests Tier 1 Pattern Matcher and Tier 2 AI Agent Prompt Builder
 */

import { runPatternMatcher } from '../src/engine/pattern-matcher.js';
import { buildPromptPayload, validateAiFills, extractInteractionText } from '../src/engine/ai-agent.js';

const mockProfile = {
  name: 'Acme Commercial Profile',
  data: {
    businessName: 'Acme Commercial',
    tradingName: 'Acme Services',
    contactName: 'Alex Jordan Taylor',
    firstName: 'Alex',
    lastName: 'Taylor',
    email: 'contact@acmecommercialdemo.com',
    phone: '+61400111222',
    website: 'https://acmecommercialdemo.com',
    address: {
      street: '123 Business Way',
      city: 'Perth',
      state: 'Western Australia',
      postalCode: '6000',
      country: 'Australia'
    },
    services: [
      'Office Cleaning',
      'Medical Centre Cleaning',
      'Warehouse Cleaning',
      'Commercial Carpet Cleaning',
      'Gym Cleaning',
      'Strata Cleaning'
    ],
    openingHours: {
      monday: { open: '07:00', close: '18:00', closed: false },
      friday: { open: '07:00', close: '18:00', closed: false },
      saturday: { open: '08:00', close: '16:00', closed: false },
      sunday: { open: '', close: '', closed: false, onCall24_7: true },
      alwaysOpen: true
    },
    descriptions: {
      short: 'Tailored commercial & office cleaning services.',
      full: 'Acme Commercial provides tailored commercial and office cleaning services for facilities.'
    },
    faqs: [
      {
        q: 'What commercial cleaning services do you provide?',
        a: 'We provide tailored commercial cleaning solutions across metropolitan areas.'
      }
    ]
  }
};

const mockScannedFields = [
  // 1. Obvious email (Tier 1)
  {
    info: {
      uid: 'field_email',
      tag: 'input',
      type: 'email',
      name: 'contact_email',
      label: 'Business Email Address *'
    }
  },
  // 2. Obvious phone (Tier 1)
  {
    info: {
      uid: 'field_phone',
      tag: 'input',
      type: 'tel',
      name: 'contact_phone',
      label: 'Business Phone Number'
    }
  },
  // 3. Obvious business name (Tier 1)
  {
    info: {
      uid: 'field_company',
      tag: 'input',
      type: 'text',
      name: 'company_name',
      label: 'Company / Business Name *'
    }
  },
  // 4. Obvious suburb (Tier 1)
  {
    info: {
      uid: 'field_city',
      tag: 'input',
      type: 'text',
      name: 'suburb',
      label: 'City / Suburb'
    }
  },
  // 5. State dropdown (Tier 2 - requires semantic select matching)
  {
    info: {
      uid: 'field_state',
      tag: 'select',
      type: 'select-one',
      name: 'state_select',
      label: 'State / Territory',
      options: [
        { value: 'NSW', text: 'New South Wales (NSW)' },
        { value: 'VIC', text: 'Victoria (VIC)' },
        { value: 'WA', text: 'Western Australia (WA)' },
        { value: 'SA', text: 'South Australia (SA)' }
      ]
    }
  },
  // 6. Monday open time dropdown (Tier 2)
  {
    info: {
      uid: 'field_mon_open',
      tag: 'select',
      type: 'select-one',
      name: 'mon_open',
      label: 'Open Time | Monday',
      groupContext: 'Trading / Operating Hours',
      options: [
        { value: '06:00', text: '6:00 AM' },
        { value: '07:00', text: '7:00 AM' },
        { value: '08:00', text: '8:00 AM' }
      ]
    }
  },
  // 7. Service checkbox: Office Cleaning (Tier 2)
  {
    info: {
      uid: 'field_service_office',
      tag: 'input',
      type: 'checkbox',
      name: 'services',
      label: 'Office & Workplace Cleaning',
      valueAttr: 'office_cleaning'
    }
  },
  // 8. Service checkbox: Pet Grooming (Tier 2 - negative test)
  {
    info: {
      uid: 'field_service_pet',
      tag: 'input',
      type: 'checkbox',
      name: 'services',
      label: 'Pet Grooming & Washing',
      valueAttr: 'pet_grooming'
    }
  },
  // 9. Short Summary with character limit (Tier 2)
  {
    info: {
      uid: 'field_short_desc',
      tag: 'input',
      type: 'text',
      name: 'short_summary',
      label: 'Short Summary / Tagline (Max 120 Characters)',
      maxLength: 120
    }
  },
  // 10. FAQ textarea (Tier 2)
  {
    info: {
      uid: 'field_faq',
      tag: 'textarea',
      type: 'textarea',
      name: 'custom_faq',
      label: 'What commercial cleaning services do you provide in Perth?'
    }
  }
];

async function runPipelineTests() {
  console.log('--- TEST 1: Tier 1 Pattern Matcher ---');
  const { matchedFills, remainingFields } = runPatternMatcher(mockScannedFields, mockProfile.data);

  console.log(`Matched ${matchedFills.length} fields in Tier 1:`);
  matchedFills.forEach((m) => {
    console.log(`  • ${m.matchedCategory} (${m.fieldInfo.label}) -> "${m.value}"`);
  });

  console.log(`Remaining ${remainingFields.length} fields escalated to Tier 2.`);

  if (matchedFills.length !== 4) {
    throw new Error(`Expected 4 Tier 1 matches, got ${matchedFills.length}`);
  }

  const emailMatch = matchedFills.find((m) => m.matchedCategory === 'email');
  if (emailMatch.value !== 'contact@acmecommercialdemo.com') {
    throw new Error('Email value mismatch');
  }

  const companyMatch = matchedFills.find((m) => m.matchedCategory === 'businessName');
  if (companyMatch.value !== 'Acme Commercial') {
    throw new Error('Company name value mismatch');
  }

  console.log('\n--- TEST 2: Tier 2 AI Agent Prompt Construction ---');
  const payload = buildPromptPayload(remainingFields, mockProfile, {
    customPromptInstructions: 'Prefer Australian English spelling.'
  });

  if (!payload.systemInstruction.includes('Acme Commercial')) {
    throw new Error('System instruction does not include profile knowledge');
  }
  if (!payload.systemInstruction.includes('Prefer Australian English spelling.')) {
    throw new Error('Custom instructions missing from prompt');
  }
  if (payload.simplifiedFields.length !== 6) {
    throw new Error(`Expected 6 simplified fields in Tier 2 payload, got ${payload.simplifiedFields.length}`);
  }

  console.log('Prompt built cleanly with JSON schema instruction.');
  console.log('Sample simplified field for AI:\n', JSON.stringify(payload.simplifiedFields[0], null, 2));

  console.log('\n--- TEST 3: Mock AI Reasoning Response Validation ---');
  const mockAiRawResponse = JSON.stringify({
    fills: [
      {
        uid: 'field_state',
        value: 'WA',
        reasoning: 'Profile address is in Western Australia'
      },
      {
        uid: 'field_mon_open',
        value: '07:00',
        reasoning: 'Profile lists Monday opening time as 07:00'
      },
      {
        uid: 'field_service_office',
        checked: true,
        reasoning: 'Office Cleaning is explicitly provided by the business'
      },
      {
        uid: 'field_service_pet',
        checked: false,
        reasoning: 'Pet grooming is not a commercial cleaning service'
      },
      {
        uid: 'field_short_desc',
        value: 'Tailored commercial & office cleaning across metropolitan Perth.',
        reasoning: 'Derived short summary under 120 character limit'
      },
      {
        uid: 'field_faq',
        value: 'We provide tailored commercial cleaning solutions across metropolitan Perth including Office, Strata, Medical and Industrial.',
        reasoning: 'Answered directly from profile FAQ'
      }
    ]
  });

  const parsed = JSON.parse(mockAiRawResponse);
  console.log(`Parsed ${parsed.fills.length} AI fills:`);
  parsed.fills.forEach((f) => {
    console.log(`  • Field ${f.uid}: ${f.value !== undefined ? `"${f.value}"` : `checked=${f.checked}`} (${f.reasoning})`);
  });

  const officeCheck = parsed.fills.find((f) => f.uid === 'field_service_office');
  const petCheck = parsed.fills.find((f) => f.uid === 'field_service_pet');
  const stateSelect = parsed.fills.find((f) => f.uid === 'field_state');

  if (officeCheck.checked !== true) throw new Error('Office cleaning should be checked');
  if (petCheck.checked !== false) throw new Error('Pet grooming should NOT be checked');
  if (stateSelect.value !== 'WA') throw new Error('State dropdown should be WA');

  console.log('\n--- TEST 4: Strict AI Response Schema & Whitelist Validation ---');
  const allowedUids = ['field_state', 'field_mon_open', 'field_short_desc'];
  const testFills = [
    { uid: 'field_state', value: 'WA', reasoning: 'Western Australia' },
    { uid: 'field_state', value: 'NSW', reasoning: 'Duplicate uid should be rejected' },
    { uid: 'hallucinated_rogue_field', value: 'Bad value', reasoning: 'Not in scanned list' },
    { uid: 'field_short_desc', value: 'A'.repeat(6000), reasoning: 'Oversized payload' }
  ];

  const validated = validateAiFills(testFills, allowedUids);
  if (validated.length !== 2) {
    throw new Error(`Expected 2 validated fills, got ${validated.length}`);
  }
  if (validated[0].uid !== 'field_state' || validated[0].value !== 'WA') {
    throw new Error('Expected first entry to be field_state=WA');
  }
  if (validated[1].uid !== 'field_short_desc') {
    throw new Error('Expected second entry to be field_short_desc');
  }
  if (validated[1].value.length !== 5000) {
    throw new Error(`Expected oversized value to be capped at 5000 chars, got ${validated[1].value.length}`);
  }
  console.log('✓ Rejected hallucinated field UIDs');
  console.log('✓ Deduplicated duplicate fill instructions');
  console.log('✓ Enforced maximum character length cap on text values');

  console.log('\n--- TEST 5: Non-Streaming Interaction JSON Text Extraction ---');
  // 1. Standard steps format
  const mockInteractionsStepsResponse = {
    id: 'interaction_123',
    status: 'COMPLETED',
    steps: [
      {
        step_number: 1,
        role: 'model',
        content: {
          parts: [{ text: '{"fills": [{"uid": "f1", "value": "Test Value"}]}' }]
        }
      }
    ]
  };
  const extractedText1 = extractInteractionText(mockInteractionsStepsResponse);
  if (!extractedText1.includes('Test Value')) {
    throw new Error('Failed to extract text from steps response');
  }

  // 2. Outputs format
  const mockInteractionsOutputsResponse = {
    id: 'interaction_456',
    status: 'COMPLETED',
    outputs: [
      {
        text: '{"fills": [{"uid": "f2", "value": "Output Value"}]}'
      }
    ]
  };
  const extractedText2 = extractInteractionText(mockInteractionsOutputsResponse);
  if (!extractedText2.includes('Output Value')) {
    throw new Error('Failed to extract text from outputs response');
  }

  // 3. Exact live Gemini 3.1 flash lite structure (steps[].content array of {text, type})
  const mockLiveGeminiResponse = {
    id: 'v1_ChYwWjM1...',
    status: 'completed',
    steps: [
      {
        signature: 'EnMKcQFp...',
        type: 'thought'
      },
      {
        content: [
          {
            text: '{\n  "fills": [\n    {\n      "uid": "f_state",\n      "value": "NSW"\n    }\n  ]\n}',
            type: 'text'
          }
        ],
        type: 'model_output'
      }
    ]
  };
  const extractedText3 = extractInteractionText(mockLiveGeminiResponse);
  if (!extractedText3.includes('NSW')) {
    throw new Error('Failed to extract text from live Gemini 3.1 flash steps[].content array response');
  }

  console.log('✓ Extracted text from standard Interactions API steps payload');
  console.log('✓ Extracted text from alternate outputs payload');
  console.log('✓ Extracted text from live Gemini 3.1 flash content array payload');

  console.log('\n✅ All Pipeline and Prompt Builder Tests Passed Successfully!');
}

runPipelineTests().catch((err) => {
  console.error('❌ Pipeline test failed:', err);
  process.exit(1);
});
