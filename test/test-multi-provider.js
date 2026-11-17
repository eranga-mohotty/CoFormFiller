/**
 * Unit & Integration Test Suite for Multi-Provider AI Architecture
 * Covers: Ollama (local), OpenAI, LM Studio, Anthropic Claude, Custom Endpoints,
 * Response Parsers, Schema Path Resolvers, and Whitelist Validation.
 */

import assert from 'node:assert/strict';
import {
  parseJsonFills,
  extractOpenAiOrOllamaText,
  extractClaudeText,
  resolveJsonPath,
  callOpenAiCompatibleApi,
  callClaudeApi,
  callCustomEndpointApi,
  callAiProvider,
  testAiConnection,
  getExtensionOrigin
} from '../src/engine/ai-agent.js';

console.log('=== MULTI-PROVIDER AI AGENT TEST SUITE ===\n');

// -------------------------------------------------------------
// TEST 1: Response Text Extraction for OpenAI and Ollama formats
// -------------------------------------------------------------
console.log('--- TEST 1: OpenAI & Ollama Text Extractors ---');

// 1A: Ollama native /api/chat response
const ollamaChatResponse = {
  model: 'qwen2.5:3b',
  created_at: '2026-11-15T17:06:35.02004264Z',
  message: {
    role: 'assistant',
    content: '{"fills":[{"uid":"field_email","value":"contact@acme.com"}]}'
  },
  done: true
};
const extractedOllama = extractOpenAiOrOllamaText(ollamaChatResponse);
assert.strictEqual(
  extractedOllama,
  '{"fills":[{"uid":"field_email","value":"contact@acme.com"}]}',
  'Must extract content from Ollama message.content'
);
console.log('✓ Successfully extracted text from Ollama /api/chat payload');

// 1B: OpenAI / LM Studio / Groq / DeepSeek /v1/chat/completions response
const openAiCompletionsResponse = {
  id: 'chatcmpl-987xyz',
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '{"fills":[{"uid":"field_phone","value":"+61400111222"}]}'
      },
      finish_reason: 'stop'
    }
  ]
};
const extractedOpenAi = extractOpenAiOrOllamaText(openAiCompletionsResponse);
assert.strictEqual(
  extractedOpenAi,
  '{"fills":[{"uid":"field_phone","value":"+61400111222"}]}',
  'Must extract content from OpenAI choices[0].message.content'
);
console.log('✓ Successfully extracted text from OpenAI /v1/chat/completions payload');

// 1C: Ollama native /api/generate fallback
const ollamaGenerateResponse = {
  model: 'llama3.2',
  response: '{"fills":[{"uid":"field_city","value":"Perth"}]}',
  done: true
};
const extractedOllamaGen = extractOpenAiOrOllamaText(ollamaGenerateResponse);
assert.strictEqual(
  extractedOllamaGen,
  '{"fills":[{"uid":"field_city","value":"Perth"}]}',
  'Must extract text from Ollama response field'
);
console.log('✓ Successfully extracted text from Ollama /api/generate fallback');

// -------------------------------------------------------------
// TEST 2: Response Text Extraction for Anthropic Claude format
// -------------------------------------------------------------
console.log('\n--- TEST 2: Anthropic Claude Text Extractor ---');

const claudeResponse = {
  id: 'msg_01XFDUDYJgAACzvnptvVoYEE',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: '```json\n{\n  "fills": [\n    {"uid": "field_state", "value": "WA"}\n  ]\n}\n```'
    }
  ],
  model: 'claude-3-5-haiku-20241022'
};
const extractedClaude = extractClaudeText(claudeResponse);
assert.ok(extractedClaude.includes('"field_state"'), 'Must extract text from Claude content[0].text');
console.log('✓ Successfully extracted text from Claude /v1/messages payload');

// -------------------------------------------------------------
// TEST 3: Safe Dot-Path JSON Path Resolver (for Custom Endpoints)
// -------------------------------------------------------------
console.log('\n--- TEST 3: Safe JSON Path Resolver ---');

const testNestedObj = {
  choices: [
    {
      message: {
        content: 'Hello World from choices[0]'
      }
    }
  ],
  data: {
    result: {
      generatedText: 'Hello from nested result'
    },
    items: ['zero', 'one', 'two']
  },
  topLevel: 'Direct property'
};

assert.strictEqual(resolveJsonPath(testNestedObj, 'choices[0].message.content'), 'Hello World from choices[0]');
assert.strictEqual(resolveJsonPath(testNestedObj, 'data.result.generatedText'), 'Hello from nested result');
assert.strictEqual(resolveJsonPath(testNestedObj, 'data.items[2]'), 'two');
assert.strictEqual(resolveJsonPath(testNestedObj, 'topLevel'), 'Direct property');
assert.strictEqual(resolveJsonPath(testNestedObj, 'nonExistent.sub.path'), '');
assert.strictEqual(resolveJsonPath(testNestedObj, ''), '');
console.log('✓ Correctly resolved nested object paths and array indices');

// -------------------------------------------------------------
// TEST 4: parseJsonFills Resilience (Markdown Fences & Conversational Text)
// -------------------------------------------------------------
console.log('\n--- TEST 4: parseJsonFills Parsing Engine ---');

// 4A: Markdown fences
const markdownFenced = '```json\n{\n  "fills": [{"uid": "f1", "value": "123"}]\n}\n```';
const parsed1 = parseJsonFills(markdownFenced);
assert.strictEqual(parsed1.length, 1);
assert.strictEqual(parsed1[0].uid, 'f1');
assert.strictEqual(parsed1[0].value, '123');
console.log('✓ Parsed JSON enclosed in markdown code fences');

// 4B: Conversational pre-amble and post-amble
const conversational = 'Certainly! Here is the JSON requested:\n{"fills":[{"uid":"f2","checked":true,"reasoning":"Matched service"}]}\nHope this helps you!';
const parsed2 = parseJsonFills(conversational);
assert.strictEqual(parsed2.length, 1);
assert.strictEqual(parsed2[0].uid, 'f2');
assert.strictEqual(parsed2[0].checked, true);
console.log('✓ Parsed JSON embedded within conversational chat text');

// 4C: Direct array format fallback
const directArray = '[{"uid": "f3", "value": "Direct Array"}]';
const parsed3 = parseJsonFills(directArray);
assert.strictEqual(parsed3.length, 1);
assert.strictEqual(parsed3[0].value, 'Direct Array');
console.log('✓ Parsed direct JSON array format fallback');

// -------------------------------------------------------------
// TEST 5: Mock Provider API End-to-End Handlers
// -------------------------------------------------------------
console.log('\n--- TEST 5: Mock Provider HTTP Request & Dispatch ---');

const originalFetch = globalThis.fetch;

try {
  // Test 5A: Ollama Local (no API Key required)
  let fetchHistory = [];
  globalThis.fetch = async (url, options) => {
    fetchHistory.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'qwen2.5:3b',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            fills: [
              { uid: 'f_test_1', value: 'Ollama Value', reasoning: 'Ollama local inference' }
            ]
          })
        }
      })
    };
  };

  const ollamaSettings = {
    aiProvider: 'openai-compatible',
    openaiBaseUrl: 'http://localhost:11434/api/chat',
    openaiModel: 'qwen2.5:3b',
    openaiApiKey: '', // Zero key for local
    temperature: 0.1
  };

  const payload = {
    systemInstruction: 'You are SmartForm AI.',
    userPrompt: 'Fill the form.',
    fields: [{ uid: 'f_test_1', label: 'Test Field' }]
  };

  const rawOllama = await callOpenAiCompatibleApi(payload, ollamaSettings);
  const fillsOllama = parseJsonFills(rawOllama);
  assert.strictEqual(fillsOllama.length, 1);
  assert.strictEqual(fillsOllama[0].value, 'Ollama Value');
  assert.strictEqual(fetchHistory[0].url, 'http://localhost:11434/api/chat');
  // Confirm NO Authorization header sent when API key is blank
  assert.strictEqual(fetchHistory[0].options.headers['Authorization'], undefined);
  console.log('✓ Ollama Local call succeeded with zero API key requirement');

  // Test 5B: OpenAI Cloud (with Bearer Token and /v1/chat/completions)
  fetchHistory = [];
  globalThis.fetch = async (url, options) => {
    fetchHistory.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-test',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                fills: [{ uid: 'f_test_1', value: 'OpenAI Cloud Value' }]
              })
            }
          }
        ]
      })
    };
  };

  const openaiSettings = {
    aiProvider: 'openai-compatible',
    openaiBaseUrl: 'https://api.openai.com/v1/chat/completions',
    openaiModel: 'gpt-4o-mini',
    openaiApiKey: 'sk-test-secret-key-123',
    temperature: 0.1
  };

  const rawOpenAi = await callOpenAiCompatibleApi(payload, openaiSettings);
  const fillsOpenAi = parseJsonFills(rawOpenAi);
  assert.strictEqual(fillsOpenAi.length, 1);
  assert.strictEqual(fillsOpenAi[0].value, 'OpenAI Cloud Value');
  assert.strictEqual(fetchHistory[0].options.headers['Authorization'], 'Bearer sk-test-secret-key-123');
  console.log('✓ OpenAI Cloud call passed with Bearer Authorization header');

  // Test 5C: Anthropic Claude (x-api-key, anthropic-version, system prompt parameter)
  fetchHistory = [];
  globalThis.fetch = async (url, options) => {
    fetchHistory.push({ url, options });
    const reqBody = JSON.parse(options.body);
    assert.strictEqual(reqBody.system, 'You are SmartForm AI.');
    assert.strictEqual(reqBody.messages[0].role, 'user');
    assert.strictEqual(reqBody.messages[0].content, 'Fill the form.');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg_test',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              fills: [{ uid: 'f_test_1', value: 'Claude Response Value' }]
            })
          }
        ]
      })
    };
  };

  const claudeSettings = {
    aiProvider: 'claude',
    claudeApiKey: 'sk-ant-test-key-456',
    claudeModel: 'claude-3-5-haiku-20241022',
    temperature: 0.1
  };

  const rawClaude = await callClaudeApi(payload, claudeSettings);
  const fillsClaude = parseJsonFills(rawClaude);
  assert.strictEqual(fillsClaude.length, 1);
  assert.strictEqual(fillsClaude[0].value, 'Claude Response Value');
  assert.strictEqual(fetchHistory[0].options.headers['x-api-key'], 'sk-ant-test-key-456');
  assert.strictEqual(fetchHistory[0].options.headers['anthropic-version'], '2023-06-01');
  console.log('✓ Anthropic Claude call passed with x-api-key, version and system parameter');

  // Test 5D: Custom Webhook Endpoint with Token Replacement
  fetchHistory = [];
  globalThis.fetch = async (url, options) => {
    fetchHistory.push({ url, options });
    const parsedBody = JSON.parse(options.body);
    assert.strictEqual(parsedBody.model, 'custom-llm-v1');
    assert.strictEqual(parsedBody.temp, 0.2);
    assert.ok(parsedBody.prompt.includes('Custom Webhook System'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payload: {
          generation: JSON.stringify({
            fills: [{ uid: 'f_test_1', value: 'Custom Endpoint Result' }]
          })
        }
      })
    };
  };

  const customSettings = {
    aiProvider: 'custom',
    customEndpointUrl: 'https://internal-llm.company.com/generate',
    customHeaders: 'X-Tenant-Id: enterprise-123\nAuthorization: Bearer webhook-token',
    customBodyTemplate: '{\n  "model": "{{MODEL}}",\n  "prompt": "{{SYSTEM_PROMPT}}\\n\\n{{USER_PROMPT}}",\n  "temp": {{TEMPERATURE}}\n}',
    customResponsePath: 'payload.generation',
    customModel: 'custom-llm-v1',
    temperature: 0.2
  };

  const customPayload = {
    systemInstruction: 'Custom Webhook System',
    userPrompt: 'Fill payload',
    fields: [{ uid: 'f_test_1', label: 'Field 1' }]
  };

  const rawCustom = await callCustomEndpointApi(customPayload, customSettings);
  const fillsCustom = parseJsonFills(rawCustom);
  assert.strictEqual(fillsCustom.length, 1);
  assert.strictEqual(fillsCustom[0].value, 'Custom Endpoint Result');
  assert.strictEqual(fetchHistory[0].options.headers['X-Tenant-Id'], 'enterprise-123');
  assert.strictEqual(fetchHistory[0].options.headers['Authorization'], 'Bearer webhook-token');
  console.log('✓ Custom HTTP endpoint passed with token substitution and custom headers');

  // Test 5E: Universal callAiProvider Whitelist & Deduplication Enforcement
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: 'qwen2.5:3b',
      message: {
        role: 'assistant',
        content: JSON.stringify({
          fills: [
            { uid: 'f_valid_1', value: 'Valid Value 1' },
            { uid: 'f_valid_1', value: 'Duplicate Value' }, // duplicate UID
            { uid: 'f_hallucinated_xyz', value: 'Attacker injection' } // invalid UID
          ]
        })
      }
    })
  });

  const universalPayload = {
    systemInstruction: 'System',
    userPrompt: 'User',
    fields: [
      { uid: 'f_valid_1', label: 'Allowed Field 1' }
    ]
  };

  const resUniversal = await callAiProvider(universalPayload, ollamaSettings);
  assert.strictEqual(resUniversal.fills.length, 1, 'Must reject hallucinated UIDs and deduplicate');
  assert.strictEqual(resUniversal.fills[0].uid, 'f_valid_1');
  assert.strictEqual(resUniversal.fills[0].value, 'Valid Value 1');
  console.log('✓ Universal callAiProvider strictly enforced whitelist and deduplication across providers');

  // Test 5F: testAiConnection Ping Tests
  const pingResult = await testAiConnection(ollamaSettings);
  assert.strictEqual(pingResult.success, true);
  assert.strictEqual(pingResult.provider, 'openai-compatible');
  assert.strictEqual(pingResult.model, 'qwen2.5:3b');
  console.log('✓ testAiConnection ping succeeded for Ollama configuration');

  // -------------------------------------------------------------
  // TEST 6: Ollama Security & Specific Origin Guardrails
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Ollama Specific Origin & Error Detection ---');

  // Test 6A: Cross-Browser Extension Origin Resolution
  const originalChrome = globalThis.chrome;

  // 6A.1: Chrome runtime origin
  globalThis.chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://smartform-ai-test-id/${p || ''}`
    }
  };
  const chromeOrigin = getExtensionOrigin();
  assert.strictEqual(chromeOrigin, 'chrome-extension://smartform-ai-test-id', 'Must extract Chromium extension origin');
  console.log(`✓ Chromium origin resolved: "${chromeOrigin}"`);

  // 6A.2: Firefox runtime origin
  globalThis.chrome = {
    runtime: {
      getURL: (p) => `moz-extension://3c880a9d-9c3f-42a9-b69c-d0092f254f1d/${p || ''}`
    }
  };
  const firefoxOrigin = getExtensionOrigin();
  assert.strictEqual(firefoxOrigin, 'moz-extension://3c880a9d-9c3f-42a9-b69c-d0092f254f1d', 'Must extract Firefox extension origin');
  console.log(`✓ Firefox origin resolved: "${firefoxOrigin}"`);

  // Reset back to Chrome mock for remaining tests
  globalThis.chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://smartform-ai-secure-id/${p || ''}`
    }
  };

  // Test 6B: Ollama 403 Forbidden Origin Block Detection
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => 'Origin not allowed'
  });

  let error403 = null;
  try {
    await callOpenAiCompatibleApi(
      { systemInstruction: 'System', userPrompt: 'Hello' },
      { openaiBaseUrl: 'http://localhost:11434/api/chat', openaiModel: 'qwen2.5:3b' }
    );
  } catch (err) {
    error403 = err;
  }

  assert.ok(error403, 'Must throw error on 403 Forbidden');
  assert.ok(error403.message.includes('Ollama Origin Block (403 Forbidden)'), 'Must identify Ollama 403 origin block');
  assert.ok(
    error403.message.includes('OLLAMA_ORIGINS="chrome-extension://smartform-ai-secure-id" ollama serve'),
    'Must provide exact, specific extension origin (not insecure wildcard)'
  );
  console.log('✓ Ollama 403 origin block correctly caught and prompted with specific origin command');

  // Test 6C: Localhost Network / CORS Fetch Failure
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  let fetchError = null;
  try {
    await callOpenAiCompatibleApi(
      { systemInstruction: 'System', userPrompt: 'Hello' },
      { openaiBaseUrl: 'http://localhost:11434/api/chat', openaiModel: 'qwen2.5:3b' }
    );
  } catch (err) {
    fetchError = err;
  }

  assert.ok(fetchError, 'Must throw error on fetch failure');
  assert.ok(fetchError.message.includes('Failed to reach local server'), 'Must identify local server failure');
  assert.ok(
    fetchError.message.includes('OLLAMA_ORIGINS="chrome-extension://smartform-ai-secure-id" ollama serve'),
    'Must guide user with specific origin command on connection/CORS drop'
  );
  console.log('✓ Localhost connection/CORS failure correctly caught with actionable specific command');

  // Restore chrome
  globalThis.chrome = originalChrome;

  // -------------------------------------------------------------
  // TEST 7: Advanced Customizations (Model Override, Timeout, Blacklist)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Advanced Customizations (Model Override, Timeout, Blacklist) ---');

  // Test 7A: Gemini Custom Model Override
  let recordedModel = '';
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    recordedModel = body.model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        steps: [
          { type: 'thought' },
          {
            type: 'model_output',
            content: [{ type: 'text', text: '{"fills":[{"uid":"f1","value":"Gemini custom"}]}' }]
          }
        ]
      })
    };
  };

  const resGeminiCustom = await callAiProvider(
    { systemInstruction: 'System', userPrompt: 'Fill', fields: [{ uid: 'f1' }] },
    {
      aiProvider: 'gemini',
      geminiApiKey: 'AIzaSyFakeKey',
      geminiModel: 'gemini-3.1-flash-lite',
      geminiCustomModel: 'gemini-2.5-pro-experimental'
    }
  );
  assert.strictEqual(recordedModel, 'gemini-2.5-pro-experimental', 'Must use geminiCustomModel override when set');
  assert.strictEqual(resGeminiCustom.model, 'gemini-2.5-pro-experimental');
  console.log('✓ Gemini custom model override passed');

  // Test 7B: Claude Custom Model Override
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    recordedModel = body.model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg_test',
        content: [{ type: 'text', text: '{"fills":[{"uid":"f1","value":"Claude custom"}]}' }]
      })
    };
  };

  const resClaudeCustom = await callAiProvider(
    { systemInstruction: 'System', userPrompt: 'Fill', fields: [{ uid: 'f1' }] },
    {
      aiProvider: 'claude',
      claudeApiKey: 'sk-ant-fake',
      claudeModel: 'claude-3-5-haiku-20241022',
      claudeCustomModel: 'claude-3-7-sonnet'
    }
  );
  assert.strictEqual(recordedModel, 'claude-3-7-sonnet', 'Must use claudeCustomModel override when set');
  assert.strictEqual(resClaudeCustom.model, 'claude-3-7-sonnet');
  console.log('✓ Claude custom model override passed');

  // Test 7C: Timeout configuration (seconds to ms)
  let recordedSignal = null;
  globalThis.fetch = async (url, options) => {
    recordedSignal = options.signal;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'qwen2.5:3b',
        message: { role: 'assistant', content: '{"fills":[]}' }
      })
    };
  };

  await callAiProvider(
    { systemInstruction: 'System', userPrompt: 'Fill', fields: [] },
    {
      aiProvider: 'openai-compatible',
      openaiBaseUrl: 'http://localhost:11434/api/chat',
      timeoutSeconds: 120
    }
  );
  assert.ok(recordedSignal, 'Must provide abort signal for configured timeout');
  console.log('✓ Configurable timeout (seconds) initialized successfully');

  // Test 7D: Domain Blacklist Matching Logic
  const blacklistRules = 'paypal.com\nchase.com\ninternal-portal.company';
  function isDomainBlacklisted(hostname, blacklistStr) {
    if (!hostname || !blacklistStr) return false;
    const host = hostname.toLowerCase();
    const patterns = blacklistStr.split(/[\n,]/).map(p => p.trim().toLowerCase()).filter(Boolean);
    return patterns.some(p => host === p || host.endsWith('.' + p));
  }

  assert.strictEqual(isDomainBlacklisted('paypal.com', blacklistRules), true);
  assert.strictEqual(isDomainBlacklisted('checkout.paypal.com', blacklistRules), true);
  assert.strictEqual(isDomainBlacklisted('chase.com', blacklistRules), true);
  assert.strictEqual(isDomainBlacklisted('my-cleaners.com.au', blacklistRules), false);
  assert.strictEqual(isDomainBlacklisted('google.com', blacklistRules), false);
  console.log('✓ Domain blacklist correctly blocked target domains and subdomains while allowing normal sites');

} finally {
  globalThis.fetch = originalFetch;
}

console.log('\n✅ All Multi-Provider AI Architecture Tests Passed Successfully!');
