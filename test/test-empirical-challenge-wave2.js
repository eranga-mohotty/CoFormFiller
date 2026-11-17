/**
 * Empirical Challenge Harness: Wave 2 Gate Evaluation (AI Transports & Prompt Modules)
 * Critic / Specialist: challenger_wave2_2
 *
 * Stress-testing:
 * 1. src/engine/ai/response-parser.ts (Adversarial parsing, extractors, path resolution, whitelisting)
 * 2. src/engine/ai/prompt-builder.ts (Edge cases, large field sets, special chars, contract validation)
 * 3. src/engine/ai/gemini-transport.ts (Mock HTTP errors, 200 FAILED, network disconnects, abort signals)
 * 4. src/engine/ai/openai-transport.ts (Mock HTTP errors, Ollama 403, local network error, abort signals)
 * 5. src/engine/ai/claude-transport.ts (Mock HTTP errors, empty content, network disconnects, abort signals)
 * 6. src/engine/ai/custom-transport.ts (Mock HTTP errors, template substitution, dollar-sign corruption, abort signals)
 */

import assert from 'assert';
import {
  parseJsonFills,
  validateAiFills,
  resolveJsonPath,
  extractInteractionText,
  extractOpenAiOrOllamaText,
  extractClaudeText
} from '../src/engine/ai/response-parser.js';
import { buildPromptPayload } from '../src/engine/ai/prompt-builder.js';
import { callGeminiApiTransport } from '../src/engine/ai/gemini-transport.js';
import { callOpenAiCompatibleApi } from '../src/engine/ai/openai-transport.js';
import { callClaudeApi } from '../src/engine/ai/claude-transport.js';
import { callCustomEndpointApi } from '../src/engine/ai/custom-transport.js';

let passed = 0;
let total = 0;
const findings = [];

function recordFinding(severity, title, description) {
  findings.push({ severity, title, description });
}

function it(desc, fn) {
  total++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(
        () => {
          passed++;
          console.log(`  ✓ ${desc}`);
        },
        (err) => {
          console.error(`  ✗ ${desc}`);
          console.error(err);
          throw err;
        }
      );
    }
    passed++;
    console.log(`  ✓ ${desc}`);
    return Promise.resolve();
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SUITE 1: Response Parser Adversarial Testing
// ---------------------------------------------------------------------------
async function runResponseParserTests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 1: Response Parser Adversarial Testing');
  console.log('======================================================');

  await it('1.1: Markdown code fences with ```json ... ``` parsed correctly', () => {
    const input = 'Here is the JSON:\n```json\n{"fills": [{"uid": "f1", "value": "test1"}]}\n```\nHope this helps!';
    const res = parseJsonFills(input);
    assert.strictEqual(Array.isArray(res), true);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].uid, 'f1');
    assert.strictEqual(res[0].value, 'test1');
  });

  await it('1.2: Generic markdown code fences with ``` ... ``` parsed correctly', () => {
    const input = '```\n{"fills": [{"uid": "f2", "value": "test2"}]}\n```';
    const res = parseJsonFills(input);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].uid, 'f2');
  });

  await it('1.3: Unclosed code fence with valid inner JSON recovers via brace match', () => {
    const input = '```json\n{"fills": [{"uid": "f3", "value": "test3"}]}';
    const res = parseJsonFills(input);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].uid, 'f3');
  });

  await it('1.4: Code fence with malformed JSON inside throws error (documents unhandled SyntaxError)', () => {
    const input = '```json\n{"fills": [ {uid: unquoted_val, \n```';
    let threw = false;
    let errType = '';
    try {
      parseJsonFills(input);
    } catch (e) {
      threw = true;
      errType = e.constructor.name;
    }
    assert.strictEqual(threw, true, 'Must throw on malformed JSON inside code fence');
    if (errType === 'SyntaxError') {
      recordFinding(
        'LOW',
        'parseJsonFills throws raw SyntaxError on malformed JSON inside code fence',
        'When a code fence is matched but contains invalid JSON, JSON.parse(match[1]) throws a SyntaxError directly instead of the structured Error("No valid JSON fills found in AI output...").'
      );
    }
  });

  await it('1.5: Surrounding conversational text without code fences parsed via brace match', () => {
    const input = 'Certainly! Based on your business profile, here are the filled fields:\n{"fills": [{"uid": "field_email", "value": "info@example.com"}]}\nLet me know if you need anything else.';
    const res = parseJsonFills(input);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].uid, 'field_email');
    assert.strictEqual(res[0].value, 'info@example.com');
  });

  await it('1.6: Empty JSON object {} returns empty array', () => {
    const res = parseJsonFills('{}');
    assert.deepStrictEqual(res, []);
  });

  await it('1.7: Empty JSON array [] returns empty array', () => {
    const res = parseJsonFills('[]');
    assert.deepStrictEqual(res, []);
  });

  await it('1.8: Empty string, null, undefined, and non-string inputs safely return empty array; whitespace throws', () => {
    assert.deepStrictEqual(parseJsonFills(''), []);
    assert.deepStrictEqual(parseJsonFills(null), []);
    assert.deepStrictEqual(parseJsonFills(undefined), []);
    assert.deepStrictEqual(parseJsonFills(12345), []);
    let threw = false;
    try {
      parseJsonFills('   ');
    } catch (e) {
      threw = true;
      assert.ok(e.message.includes('No valid JSON fills found'));
    }
    assert.strictEqual(threw, true, 'Whitespace-only string must throw No valid JSON fills found');
  });

  await it('1.9: Truncated JSON without closing braces throws descriptive error', () => {
    const input = '{"fills": [{"uid": "field_1", "value": "incomplete...';
    let threw = false;
    let errorMsg = '';
    try {
      parseJsonFills(input);
    } catch (e) {
      threw = true;
      errorMsg = e.message;
    }
    assert.strictEqual(threw, true);
    assert.ok(errorMsg.includes('No valid JSON fills found in AI output'));
  });

  await it('1.10: Multiple curly braces before/after JSON (investigates greedy regex behavior)', () => {
    // Greedy regex /\{[\s\S]*\}/ will capture from {start} to {end}
    const input = 'Note {prefix}: {"fills": [{"uid": "f_multi", "value": "valid"}]} Note {suffix}';
    let threw = false;
    try {
      parseJsonFills(input);
    } catch (e) {
      threw = true;
    }
    // Because /\{[\s\S]*\}/ is greedy, it will fail to parse '{prefix}: ... {suffix}'
    if (threw) {
      recordFinding(
        'MEDIUM',
        'Greedy regex in parseJsonFills fails if conversational text contains curly braces',
        'In response-parser.ts line 121, rawText.match(/\\{[\\s\\S]*\\}/) is greedy. If the LLM includes curly braces in conversational notes (e.g. "Note {1}: {...} {done}"), the regex matches from the first { to the last }, causing JSON.parse to fail.'
      );
    }
    assert.ok(true);
  });

  await it('1.11: Extractors for all multi-provider formats', () => {
    // Gemini interactions steps
    const geminiSteps = { steps: [{ content: [{ text: 'gemini step text' }] }] };
    assert.strictEqual(extractInteractionText(geminiSteps), 'gemini step text');

    // Gemini interactions outputs
    const geminiOutputs = { outputs: [{ text: 'gemini output text' }] };
    assert.strictEqual(extractInteractionText(geminiOutputs), 'gemini output text');

    // Gemini candidates
    const geminiCandidates = { candidates: [{ content: { parts: [{ text: 'gemini candidate text' }] } }] };
    assert.strictEqual(extractInteractionText(geminiCandidates), 'gemini candidate text');

    // OpenAI message.content
    const openaiMsg = { choices: [{ message: { content: 'openai message text' } }] };
    assert.strictEqual(extractOpenAiOrOllamaText(openaiMsg), 'openai message text');

    // Ollama message
    const ollamaMsg = { message: { content: 'ollama message text' } };
    assert.strictEqual(extractOpenAiOrOllamaText(ollamaMsg), 'ollama message text');

    // Ollama response fallback
    const ollamaResp = { response: 'ollama generate text' };
    assert.strictEqual(extractOpenAiOrOllamaText(ollamaResp), 'ollama generate text');

    // Claude content array
    const claudeResp = { content: [{ text: 'claude text part 1 ' }, { text: 'part 2' }] };
    assert.strictEqual(extractClaudeText(claudeResp), 'claude text part 1 part 2');

    // Empty / null inputs to extractors
    assert.strictEqual(extractInteractionText(null), '');
    assert.strictEqual(extractInteractionText({}), '');
    assert.strictEqual(extractOpenAiOrOllamaText(null), '');
    assert.strictEqual(extractOpenAiOrOllamaText({}), '');
    assert.strictEqual(extractClaudeText(null), '');
    assert.strictEqual(extractClaudeText({}), '');
  });

  await it('1.12: resolveJsonPath adversarial dot and bracket resolution', () => {
    const data = {
      choices: [
        { message: { content: 'choice 0 text' } },
        { message: { content: 'choice 1 text' } }
      ],
      deep: {
        nested: {
          flag: true,
          count: 0,
          empty: ''
        }
      },
      matrix: [[100, 200], [300, 400]]
    };

    assert.strictEqual(resolveJsonPath(data, 'choices[0].message.content'), 'choice 0 text');
    assert.strictEqual(resolveJsonPath(data, 'choices[1].message.content'), 'choice 1 text');
    assert.strictEqual(resolveJsonPath(data, 'deep.nested.flag'), 'true');
    assert.strictEqual(resolveJsonPath(data, 'deep.nested.count'), '0');
    assert.strictEqual(resolveJsonPath(data, 'deep.nested.empty'), '');
    assert.strictEqual(resolveJsonPath(data, 'matrix[1][0]'), '300');
    assert.strictEqual(resolveJsonPath(data, 'choices[99].message'), '');
    assert.strictEqual(resolveJsonPath(data, 'nonexistent.path'), '');
    assert.strictEqual(resolveJsonPath(null, 'foo.bar'), '');
    assert.strictEqual(resolveJsonPath(data, ''), '');
  });

  await it('1.13: resolveJsonPath with quoted bracket notation vs unquoted bracket notation', () => {
    const data = { user: { name: 'Alice' } };
    assert.strictEqual(resolveJsonPath(data, 'user[name]'), 'Alice');
    // Quoted bracket notation like user["name"] or user['name'] is not stripped by \w+ regex
    assert.strictEqual(resolveJsonPath(data, 'user["name"]'), '');
    assert.strictEqual(resolveJsonPath(data, "user['name']"), '');
  });
}

// ---------------------------------------------------------------------------
// SUITE 2: AI Fills Sanitization & Whitelisting (validateAiFills)
// ---------------------------------------------------------------------------
async function runAiFillsValidationTests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 2: AI Fills Sanitization & Whitelisting');
  console.log('======================================================');

  await it('2.1: Missing or whitespace-only uid is rejected', () => {
    const raw = [
      { uid: '', value: 'val1' },
      { uid: '   ', value: 'val2' },
      { value: 'no uid' }
    ];
    const res = validateAiFills(raw);
    assert.deepStrictEqual(res, []);
  });

  await it('2.2: Non-string uid types are rejected', () => {
    const raw = [
      { uid: 12345, value: 'number uid' },
      { uid: true, value: 'bool uid' },
      { uid: {}, value: 'obj uid' }
    ];
    const res = validateAiFills(raw);
    assert.deepStrictEqual(res, []);
  });

  await it('2.3: Excessive value length (> 5000 chars) is truncated to 5000 chars', () => {
    const longStr = 'A'.repeat(6500);
    const raw = [{ uid: 'f_long', value: longStr }];
    const res = validateAiFills(raw);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].value.length, 5000);
    assert.strictEqual(res[0].value, 'A'.repeat(5000));
  });

  await it('2.4: Non-string values are converted to string cleanly', () => {
    const raw = [
      { uid: 'f_num', value: 98765 },
      { uid: 'f_bool', value: false },
      { uid: 'f_zero', value: 0 }
    ];
    const res = validateAiFills(raw);
    assert.strictEqual(res[0].value, '98765');
    assert.strictEqual(res[1].value, 'false');
    assert.strictEqual(res[2].value, '0');
  });

  await it('2.5: Missing / null value with boolean checked preserves checked', () => {
    const raw = [
      { uid: 'f_chk_true', checked: true },
      { uid: 'f_chk_false', checked: false, value: null }
    ];
    const res = validateAiFills(raw);
    assert.strictEqual(res[0].checked, true);
    assert.strictEqual(res[0].value, undefined);
    assert.strictEqual(res[1].checked, false);
    assert.strictEqual(res[1].value, undefined);
  });

  await it('2.6: Missing both value and checked retains instruction with uid and reasoning', () => {
    const raw = [{ uid: 'f_no_val', reasoning: 'Not enough profile info' }];
    const res = validateAiFills(raw);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].uid, 'f_no_val');
    assert.strictEqual(res[0].reasoning, 'Not enough profile info');
    assert.strictEqual(res[0].value, undefined);
    assert.strictEqual(res[0].checked, undefined);
  });

  await it('2.7: Duplicate uid deduplication keeps first occurrence', () => {
    const raw = [
      { uid: 'f_dup', value: 'first_value' },
      { uid: 'f_dup', value: 'second_value' }
    ];
    const res = validateAiFills(raw);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].value, 'first_value');
  });

  await it('2.8: Allowed UIDs whitelist strictly filters out hallucinated fields', () => {
    const allowed = ['field_1', 'field_2'];
    const raw = [
      { uid: 'field_1', value: 'val1' },
      { uid: 'field_hallucinated', value: 'fake' },
      { uid: 'field_2', value: 'val2' }
    ];
    const res = validateAiFills(raw, allowed);
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res[0].uid, 'field_1');
    assert.strictEqual(res[1].uid, 'field_2');
  });

  await it('2.9: Non-array inputs to validateAiFills return empty array', () => {
    assert.deepStrictEqual(validateAiFills(null), []);
    assert.deepStrictEqual(validateAiFills(undefined), []);
    assert.deepStrictEqual(validateAiFills({ fills: [] }), []);
    assert.deepStrictEqual(validateAiFills('string'), []);
  });

  await it('2.10: Reasoning strings exceeding 300 characters are capped to 300', () => {
    const longReasoning = 'R'.repeat(450);
    const raw = [{ uid: 'f_reason', reasoning: longReasoning, value: 'ok' }];
    const res = validateAiFills(raw);
    assert.strictEqual(res[0].reasoning.length, 300);
  });

  await it('2.11: Malformed field item using fieldId or id instead of uid is rejected', () => {
    const raw = [
      { fieldId: 'field_1', value: 'value_1' },
      { id: 'field_2', value: 'value_2' },
      { name: 'field_3', value: 'value_3' }
    ];
    const res = validateAiFills(raw);
    assert.deepStrictEqual(res, [], 'Items missing uid must be rejected');
  });

  await it('2.12: Non-primitive values (object, array) are coerced via String()', () => {
    const raw = [
      { uid: 'f_obj', value: { nested: 'data' } },
      { uid: 'f_arr', value: ['alpha', 'beta'] }
    ];
    const res = validateAiFills(raw);
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res[0].value, '[object Object]');
    assert.strictEqual(res[1].value, 'alpha,beta');
  });
}

// ---------------------------------------------------------------------------
// SUITE 3: Prompt Builder Adversarial Testing
// ---------------------------------------------------------------------------
async function runPromptBuilderTests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 3: Prompt Builder Adversarial Testing');
  console.log('======================================================');

  await it('3.1: Building prompt with 0 fields produces valid AiPromptPayload', () => {
    const payload = buildPromptPayload([], { name: 'Acme Test' });
    assert.ok(payload.systemInstruction);
    assert.ok(payload.userPrompt.includes('0 form field(s)'));
    assert.deepStrictEqual(payload.simplifiedFields, []);
  });

  await it('3.2: Building prompt with huge field list (150 fields) serializes properly', () => {
    const fields = Array.from({ length: 150 }, (_, i) => ({
      uid: `uid_${i}`,
      tag: 'input',
      type: 'text',
      label: `Field Label ${i}`,
      currentValue: ''
    }));
    const payload = buildPromptPayload(fields, { businessName: 'Big Corp' });
    assert.strictEqual(payload.simplifiedFields.length, 150);
    assert.ok(payload.userPrompt.includes('150 form field(s)'));
    assert.ok(payload.userPrompt.length > 10000);
  });

  await it('3.3: Profile data with quotes, newlines, unicode, emoji, and script tags', () => {
    const adversarialProfile = {
      data: {
        company: 'O\'Connor & "Special" Cleaners \n Inc.',
        script: '<script>alert("xss")</script>',
        unicode: '日本語 \u2028 \u2029 🚀'
      }
    };
    const payload = buildPromptPayload([], adversarialProfile);
    assert.ok(payload.systemInstruction.includes('O\'Connor & \\"Special\\" Cleaners'));
    assert.ok(payload.systemInstruction.includes('<script>alert(\\"xss\\")</script>'));
    assert.ok(payload.systemInstruction.includes('日本語'));
  });

  await it('3.4: Field metadata mapping: options, radioGroup, maxLength, required, groupContext', () => {
    const fieldInput = {
      uid: 'field_full',
      tag: 'select',
      type: 'select-one',
      label: 'Service State',
      groupContext: 'Location Information',
      placeholder: 'Select a state',
      required: true,
      maxLength: 10,
      options: [
        { value: 'WA', text: 'Western Australia' },
        { value: 'NSW', text: 'New South Wales' }
      ],
      radioGroup: {
        name: 'freq',
        options: [{ value: 'weekly', text: 'Weekly' }]
      },
      valueAttr: 'WA',
      currentValue: ''
    };

    const payload = buildPromptPayload([fieldInput], {});
    const simplified = payload.simplifiedFields[0];

    assert.strictEqual(simplified.uid, 'field_full');
    assert.strictEqual(simplified.tag, 'select');
    assert.strictEqual(simplified.groupContext, 'Location Information');
    assert.strictEqual(simplified.placeholder, 'Select a state');
    assert.strictEqual(simplified.required, true);
    assert.strictEqual(simplified.maxLength, 10);
    assert.strictEqual(simplified.options.length, 2);
    assert.strictEqual(simplified.radioOptions.length, 1);
    assert.strictEqual(simplified.valueAttr, 'WA');
  });

  await it('3.5: Null/undefined profile argument produces TypeError (documents input validation gap)', () => {
    let threw = false;
    let errMsg = '';
    try {
      buildPromptPayload([], null);
    } catch (e) {
      threw = true;
      errMsg = e.message;
    }
    assert.strictEqual(threw, true, 'buildPromptPayload(fields, null) throws TypeError');
    recordFinding(
      'MEDIUM',
      'buildPromptPayload throws TypeError when profile is null or undefined',
      'In prompt-builder.ts line 101, ("data" in profile) throws TypeError: Cannot use "in" operator to search for "data" in null. It should guard with (profile && typeof profile === "object" && "data" in profile).'
    );
  });

  await it('3.6: Custom user prompt instructions injected correctly', () => {
    const payload = buildPromptPayload([], { name: 'Acme' }, {
      customPromptInstructions: 'Always answer in formal tone with $50 minimum budget.'
    });
    assert.ok(payload.systemInstruction.includes('USER CUSTOM INSTRUCTIONS:'));
    assert.ok(payload.systemInstruction.includes('Always answer in formal tone with $50 minimum budget.'));
  });
}

// ---------------------------------------------------------------------------
// SUITE 4: Transport Mock & HTTP Error Handling
// ---------------------------------------------------------------------------
async function runTransportErrorHandlingTests() {
  console.log('\n======================================================');
  console.log('CHALLENGE SUITE 4: Transport Mock & HTTP Error Handling');
  console.log('======================================================');

  const originalFetch = globalThis.fetch;
  const dummyPayload = {
    systemInstruction: 'System instruction prompt',
    userPrompt: 'User prompt text',
    simplifiedFields: []
  };

  try {
    // 4.1: Gemini Transport
    await it('4.1a: Gemini transport rejects when API key is missing', async () => {
      let threw = false;
      try {
        await callGeminiApiTransport(dummyPayload, { apiKey: '' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Google Gemini API Key is missing'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.1b: Gemini transport rejects HTTP 400, 401, 429, 500 with status code & parsed message', async () => {
      for (const status of [400, 401, 429, 500]) {
        globalThis.fetch = async () => new Response(JSON.stringify({
          error: { message: `Gemini quota/auth error code ${status}` }
        }), { status });

        let threw = false;
        try {
          await callGeminiApiTransport(dummyPayload, { apiKey: 'AIzaFakeKey' });
        } catch (e) {
          threw = true;
          assert.ok(e.message.includes(String(status)), `Must include status ${status}`);
          assert.ok(e.message.includes(`Gemini quota/auth error code ${status}`));
        }
        assert.strictEqual(threw, true);
      }
    });

    await it('4.1c: Gemini transport rejects HTTP 200 with status="FAILED" or error object', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({
        status: 'FAILED',
        error: { message: 'Content filtered by safety policy' }
      }), { status: 200 });

      let threw = false;
      try {
        await callGeminiApiTransport(dummyPayload, { apiKey: 'AIzaFakeKey' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Gemini Interaction Error'));
        assert.ok(e.message.includes('Content filtered by safety policy'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.1d: Gemini transport propagates network disconnect / fetch rejection', async () => {
      globalThis.fetch = async () => { throw new TypeError('Network connection reset'); };
      let threw = false;
      try {
        await callGeminiApiTransport(dummyPayload, { apiKey: 'AIzaFakeKey' });
      } catch (e) {
        threw = true;
        assert.strictEqual(e.message, 'Network connection reset');
      }
      assert.strictEqual(threw, true);
    });

    // 4.2: OpenAI / Ollama Transport
    await it('4.2a: OpenAI transport rejects HTTP 400, 401, 429, 500 with status code & parsed error', async () => {
      for (const status of [400, 401, 429, 500]) {
        globalThis.fetch = async () => new Response(JSON.stringify({
          error: { message: `OpenAI error ${status}` }
        }), { status });

        let threw = false;
        try {
          await callOpenAiCompatibleApi(dummyPayload, { apiKey: 'sk-fake', baseUrl: 'https://api.openai.com/v1/chat/completions' });
        } catch (e) {
          threw = true;
          assert.ok(e.message.includes(String(status)));
          assert.ok(e.message.includes(`OpenAI error ${status}`));
        }
        assert.strictEqual(threw, true);
      }
    });

    await it('4.2b: OpenAI transport detects Ollama 403 Forbidden origin block on localhost', async () => {
      globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
      let threw = false;
      try {
        await callOpenAiCompatibleApi(dummyPayload, { baseUrl: 'http://localhost:11434/api/chat' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Ollama Origin Block (403 Forbidden)'));
        assert.ok(e.message.includes('OLLAMA_ORIGINS='));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.2c: OpenAI transport provides actionable message on localhost network failure', async () => {
      globalThis.fetch = async () => { throw new TypeError('Connection refused'); };
      let threw = false;
      try {
        await callOpenAiCompatibleApi(dummyPayload, { baseUrl: 'http://127.0.0.1:11434/api/chat' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Failed to reach local server'));
        assert.ok(e.message.includes('OLLAMA_ORIGINS='));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.2d: OpenAI transport rejects empty responses with descriptive error', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ choices: [] }), { status: 200 });
      let threw = false;
      try {
        await callOpenAiCompatibleApi(dummyPayload, { apiKey: 'sk-fake', baseUrl: 'https://api.openai.com/v1' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('OpenAI/Ollama provider returned an empty response.'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.2e: OpenAI transport external 403 (non-localhost) throws standard API Error without Ollama instructions', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Cloud token expired' } }), { status: 403 });
      let threw = false;
      let errorMsg = '';
      try {
        await callOpenAiCompatibleApi(dummyPayload, { apiKey: 'sk-fake', baseUrl: 'https://api.openai.com/v1' });
      } catch (e) {
        threw = true;
        errorMsg = e.message;
      }
      assert.strictEqual(threw, true);
      assert.ok(errorMsg.includes('OpenAI/Ollama API Error (403): Cloud token expired'));
      assert.strictEqual(errorMsg.includes('OLLAMA_ORIGINS'), false, 'External 403 must not mention Ollama origin block');
    });

    // 4.3: Claude Transport
    await it('4.3a: Claude transport rejects when API key is missing', async () => {
      let threw = false;
      try {
        await callClaudeApi(dummyPayload, { apiKey: '' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Anthropic Claude API Key is missing'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.3b: Claude transport rejects HTTP 400, 401, 429, 500 with status code & parsed error', async () => {
      for (const status of [400, 401, 429, 500]) {
        globalThis.fetch = async () => new Response(JSON.stringify({
          error: { message: `Claude error ${status}` }
        }), { status });

        let threw = false;
        try {
          await callClaudeApi(dummyPayload, { apiKey: 'sk-ant-fake' });
        } catch (e) {
          threw = true;
          assert.ok(e.message.includes(String(status)));
          assert.ok(e.message.includes(`Claude error ${status}`));
        }
        assert.strictEqual(threw, true);
      }
    });

    await it('4.3c: Claude transport rejects empty response text', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ content: [] }), { status: 200 });
      let threw = false;
      try {
        await callClaudeApi(dummyPayload, { apiKey: 'sk-ant-fake' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Claude returned an empty response.'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.3d: Claude transport rejects HTTP 529 Overloaded with descriptive error', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({
        error: { message: 'Anthropic API is temporarily overloaded' }
      }), { status: 529 });
      let threw = false;
      let errorMsg = '';
      try {
        await callClaudeApi(dummyPayload, { apiKey: 'sk-ant-fake' });
      } catch (e) {
        threw = true;
        errorMsg = e.message;
      }
      assert.strictEqual(threw, true);
      assert.ok(errorMsg.includes('529'));
      assert.ok(errorMsg.includes('Anthropic API is temporarily overloaded'));
    });

    // 4.4: Custom Transport
    await it('4.4a: Custom transport rejects when endpointUrl is missing', async () => {
      let threw = false;
      try {
        await callCustomEndpointApi(dummyPayload, { endpointUrl: '' });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('Custom Endpoint URL is required'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.4b: Custom transport rejects HTTP 400, 401, 429, 500 with status code & error text', async () => {
      for (const status of [400, 401, 429, 500]) {
        globalThis.fetch = async () => new Response(`Custom server failed with ${status}`, { status });

        let threw = false;
        try {
          await callCustomEndpointApi(dummyPayload, { endpointUrl: 'https://custom.endpoint.com' });
        } catch (e) {
          threw = true;
          assert.ok(e.message.includes(String(status)));
          assert.ok(e.message.includes(`Custom server failed with ${status}`));
        }
        assert.strictEqual(threw, true);
      }
    });

    await it('4.4c: Custom transport rejects when responsePath cannot extract text', async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ output: { unexpectedKey: 'val' } }), { status: 200 });

      let threw = false;
      try {
        await callCustomEndpointApi(dummyPayload, {
          endpointUrl: 'https://custom.endpoint.com',
          responsePath: 'result.data.text'
        });
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('could not extract text using path: "result.data.text"'));
        assert.ok(e.message.includes('output'));
      }
      assert.strictEqual(threw, true);
    });

    await it('4.4d: Custom transport body template regex replacement pattern bug ($&, $\')', async () => {
      // In formatCustomBody:
      // template.replace(/\{\{USER_PROMPT\}\}/g, JSON.stringify(payload.userPrompt).slice(1, -1))
      // If userPrompt contains $' (e.g. "Price is $'100") or $` or $&, it expands template characters.
      let capturedBody = '';
      globalThis.fetch = async (url, options) => {
        capturedBody = options.body;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      };

      const payloadWithDollar = {
        systemInstruction: 'sys',
        userPrompt: 'Special pricing: $\'99 only',
        simplifiedFields: []
      };

      await callCustomEndpointApi(payloadWithDollar, {
        endpointUrl: 'https://custom.endpoint.com',
        bodyTemplate: '{"prompt": "{{USER_PROMPT}}", "status": "active"}'
      });

      let jsonCorrupt = false;
      try {
        JSON.parse(capturedBody);
      } catch (e) {
        jsonCorrupt = true;
      }

      if (jsonCorrupt) {
        recordFinding(
          'HIGH',
          'formatCustomBody in custom-transport.ts corrupts JSON when prompt contains dollar replacement patterns ($&, $\', $`)',
          'In custom-transport.ts lines 42-43, bodyStr.replace(/\\{\\{USER_PROMPT\\}\\}/g, JSON.stringify(...).slice(1, -1)) uses string replacement without a replacer function. JavaScript replace interprets $\' as the remainder of the template, duplicating characters and corrupting the request body JSON.'
        );
      }
      assert.strictEqual(jsonCorrupt, true, 'Empirically reproduces JSON corruption via dollar replacement in custom transport');
    });

    await it('4.4e: All 4 transports correctly respect AbortSignal (and documents Ollama localhost abort masking)', async () => {
      globalThis.fetch = originalFetch;
      const controller = new AbortController();
      controller.abort();

      const transports = [
        ['Gemini', () => callGeminiApiTransport(dummyPayload, { apiKey: 'key' }, controller.signal)],
        ['OpenAI', () => callOpenAiCompatibleApi(dummyPayload, { apiKey: 'key', baseUrl: 'https://api.openai.com' }, controller.signal)],
        ['Claude', () => callClaudeApi(dummyPayload, { apiKey: 'key' }, controller.signal)],
        ['Custom', () => callCustomEndpointApi(dummyPayload, { endpointUrl: 'https://custom.api' }, controller.signal)]
      ];

      for (const [name, fn] of transports) {
        let aborted = false;
        try {
          await fn();
        } catch (e) {
          aborted = e.name === 'AbortError' || e.message.includes('aborted');
        }
        assert.strictEqual(aborted, true, `${name} must reject with AbortError`);
      }

      // Empirical challenge: Ollama localhost abort error masking
      let ollamaErrorName = '';
      let ollamaErrorMsg = '';
      try {
        await callOpenAiCompatibleApi(dummyPayload, { baseUrl: 'http://localhost:11434/api/chat' }, controller.signal);
      } catch (e) {
        ollamaErrorName = e.name;
        ollamaErrorMsg = e.message;
      }
      assert.strictEqual(ollamaErrorName, 'Error', 'Ollama localhost converts AbortError to generic Error');
      assert.ok(ollamaErrorMsg.includes('Failed to reach local server'), 'Ollama localhost masks abort as server connection failure');
      recordFinding(
        'MEDIUM',
        'OpenAI transport handleNetworkError masks AbortError as an Ollama connection failure on localhost',
        'In openai-transport.ts line 51, handleNetworkError intercepts all errors when url contains localhost/127.0.0.1. If an AbortController cancels the request, netErr (AbortError) is wrapped in Error("Failed to reach local server... OLLAMA_ORIGINS=..."). It should check if (netErr instanceof Error && netErr.name === "AbortError") throw netErr; first.'
      );
    });

    await it('4.4f: Custom transport headers parsing handles colons in values, blank lines, and objects', async () => {
      let capturedHeaders = null;
      globalThis.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'header-test-pass' } }] }), { status: 200 });
      };

      // Multiline string with colons inside values and blank lines
      const headerString = 'Authorization: Bearer my-secret-token\nX-Timestamp: 2026-11-17T05:15:51Z\n\nInvalidLineWithoutColon\nX-Empty-Val: ';
      await callCustomEndpointApi(dummyPayload, {
        endpointUrl: 'https://custom.api/v1',
        headers: headerString
      });

      assert.strictEqual(capturedHeaders['Authorization'], 'Bearer my-secret-token');
      assert.strictEqual(capturedHeaders['X-Timestamp'], '2026-11-17T05:15:51Z');
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
      assert.strictEqual(capturedHeaders['InvalidLineWithoutColon'], undefined);

      // Object format
      await callCustomEndpointApi(dummyPayload, {
        endpointUrl: 'https://custom.api/v1',
        headers: { 'X-Custom-Obj': 'obj-value' }
      });
      assert.strictEqual(capturedHeaders['X-Custom-Obj'], 'obj-value');
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
    });

  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------
async function main() {
  try {
    await runResponseParserTests();
    await runAiFillsValidationTests();
    await runPromptBuilderTests();
    await runTransportErrorHandlingTests();

    console.log('\n======================================================');
    console.log(`EMPIRICAL CHALLENGE SUITE COMPLETE: ${passed}/${total} assertions PASSED`);
    console.log(`Defects / Vulnerabilities Documented: ${findings.length}`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.title}`);
    }
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\nEMPIRICAL CHALLENGE RUNNER FAILED:', err);
    process.exit(1);
  }
}

main();
