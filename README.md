# SmartForm AI - Intelligent Form Filling Agent (Manifest V3)

SmartForm AI is a next-generation, schema-agnostic Chrome Extension that automates web form filling using a **Hybrid Two-Tier Engine**:
- **Tier 1 (Fast Pattern Matching)**: Instantly matches obvious fields (Email, Phone, Name, Suburb) with zero latency and zero API cost.
- **Tier 2 (Pluggable Multi-Provider AI Reasoning)**: Intelligently handles complex form architectures:
  - Adapting business descriptions to field character limits (`maxLength`).
  - Mapping operating and trading hours to diverse UI controls (dropdown pairs, time pickers, 24/7 radios).
  - Checking only relevant service checkboxes from a business capability list.
  - Semantic option selection on `<select>` elements (e.g. matching "Western Australia" to `WA`).
  - Synthesizing direct answers to custom inquiries and FAQs without hallucinating.

---

## Supported AI Providers & Models

SmartForm AI connects directly from your browser to your chosen AI engine without third-party middleman servers:

1. **Google Gemini (Official REST API)**:
   - Ultra-fast non-streaming default: `gemini-3.1-flash-lite`.
   - Also supports `gemini-3.8-flash` and `gemini-4-hydrogen`.
   - Free tier with Google AI Studio key.
2. **Local Offline Models (Zero Cloud Data Leakage)**:
   - **Ollama**: `http://localhost:11434/api/chat` (e.g. `qwen2.5:3b`, `llama3.2`). Zero API key required!
     - *Security Best Practice*: To prevent unauthorized web pages from querying your local models, run Ollama allowing only your specific extension origin: `OLLAMA_ORIGINS="chrome-extension://<id>" ollama serve` (or `moz-extension://<uuid>` on Firefox). The Settings UI includes a 1-click copy button with your exact ID.
   - **LM Studio**: `http://localhost:1234/v1/chat/completions` (e.g. `local-model`).
3. **OpenAI & Compatible Cloud Services**:
   - OpenAI (`gpt-4o-mini`, `gpt-4o`).
   - Groq (`llama-3.3-70b-versatile`) for ultra-low latency inference.
   - DeepSeek (`deepseek-chat`).
4. **Anthropic Claude**:
   - Direct connection via Messages API (`claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`).
5. **Custom Webhook Endpoints (Power Users)**:
   - Configure arbitrary internal endpoints, proxies, custom authorization headers, and body template tokens (`{{MODEL}}`, `{{SYSTEM_PROMPT}}`, `{{USER_PROMPT}}`, `{{TEMPERATURE}}`).
   - Extract response JSON using dot-paths (e.g. `choices[0].message.content` or `data.result.text`).

---

## Key Features

- **100% Publishable & Privacy-First**: Starts completely clean upon installation. Zero hardcoded personal data. All profile facts, model configurations, and API keys reside strictly inside your browser's local storage (`chrome.storage.local`).
- **Localhost Calling Support**: Chrome Extension service worker communicates with `http://localhost:11434` or `http://localhost:1234` out of the box with zero CORS issues.
- **Strict Fill Whitelist & Deduplication**: Irrespective of the provider or model used, every single suggested field fill must pass strict client-side DOM UID whitelisting, duplicate prevention, and maximum character length capping (5,000 chars) before any DOM mutation occurs.
- **Schema-Agnostic Multi-Profile Knowledge Base**: Create and switch between multiple profiles. Profiles support structured business information, services tags, day-by-day operating hours, FAQs, and arbitrary custom key-value pairs.
- **Full Configuration Replacement & Swapping**: Ingests JSON files (including legacy extension export formats) and replaces all configurations cleanly, enabling seamless profile swapping.
- **On-Page Floating Action Button**: A subtle, dockable `✨ AI Fill` button appears on pages with detected forms for 1-click execution.
- **Framework-Aware Event Inserter**: Overrides native prototype property setters and dispatches `input`, `change`, and `blur` events so React, Vue, Angular, and modern single-page apps accept form values immediately.
- **Visual Feedback**: Temporary glowing highlights (Cyan for Fast Match, Emerald Green for AI) let you review all filled fields at a glance.
- **Smart Learning Mode (Self-Improving Knowledge Base)**: If a form contains fields your profile doesn't know yet, filling them manually displays an unobtrusive prompt card to save them to your active profile with a single click. Sensitive fields (passwords, cards, CVVs, OTPs) and utility fields (search, captchas, coupons) are strictly protected.
- **Live AI Inspector & Latency Logs**: Every fill and connection test records complete duration, prompt, and response logs for transparent inspection and debugging.

---

## Quickstart: Installing in Chrome / Chromium / Brave

1. Open your browser and navigate to:
   ```
   chrome://extensions
   ```
2. Enable **Developer mode** (toggle switch in the top right corner).
3. Click the **Load unpacked** button.
4. Select the project directory:
   ```
   /home/eranga/.gemini/antigravity/scratch/smartform-ai-extension
   ```
5. The **SmartForm AI** extension icon will now appear in your browser toolbar!

---

## Setup & First Fill

1. **Import Your Profile**:
   - Click the extension icon in the toolbar, then click the **⚙️ Settings** icon (or right-click the extension icon -> *Options*).
   - Navigate to the **Import & Export** tab.
   - Paste or drag-and-drop your exported JSON configuration file.
   - Click **Process & Import Configuration**. All your services, FAQs, address, contact details, and descriptions will load instantly!
2. **Configure Your AI Provider**:
   - Go to the **AI Engine & Providers** tab.
   - Select your active provider:
     - **Google Gemini**: Enter your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
     - **OpenAI & Local Models**: Select a Quick Preset (e.g. *Ollama Local* or *LM Studio Local*), or enter your endpoint and model name.
     - **Anthropic Claude**: Enter your Claude API key.
     - **Custom Endpoint**: Configure custom headers and templates.
   - Click **Test Connection** to verify connection and measure round-trip latency.
   - Click **Save AI Settings**.
3. **Test with the Local Business Directory**:
   - In the settings sidebar, click **🧪 Open Test Form** (or open `test-forms/business-directory-form.html` in Chrome).
   - Click the floating `✨ AI Fill` button (or click the extension popup and hit *⚡ Fill Form on Page*).
   - Watch the form fill with company name, contact info, operating hours, service checkboxes, character-limited descriptions, and FAQs!

---

## Project Structure

```
smartform-ai-extension/
├── manifest.json                  # Manifest V3 extension configuration
├── README.md                      # Documentation & instructions
├── src/
│   ├── background/
│   │   └── service-worker.js     # Background worker handling AI dispatching & messaging
│   ├── content/
│   │   ├── content.js            # Content script injecting floating button & orchestrating fills
│   │   ├── content.css           # Glowing highlights & floating pill styling
│   │   └── inserter.js           # Framework-aware DOM property setter & event dispatcher
│   ├── engine/
│   │   ├── scanner.js            # DOM inspector extracting fields, labels, limits & contexts
│   │   ├── pattern-matcher.js    # Tier 1: Fast regex heuristic matcher (0 tokens)
│   │   └── ai-agent.js           # Tier 2: Universal AI reasoning client (Gemini, Ollama, Claude, Custom)
│   ├── popup/
│   │   ├── popup.html            # Extension toolbar popup interface
│   │   ├── popup.js              # Active profile switcher & 1-click trigger
│   │   └── popup.css             # Toolbar popup styling
│   ├── options/
│   │   ├── options.html          # 5-Tab Settings & Profile Manager dashboard
│   │   ├── options.js            # Controller for profiles, visual builder, import/export, logs
│   │   └── options.css           # Dark Slate theme styling
│   ├── services/
│   │   └── storage.js            # Multi-profile & settings storage layer (chrome.storage.local)
│   ├── utils/
│   │   └── importer.js           # Universal JSON parser (handles legacy & native formats)
│   └── icons/
│       ├── icon.svg              # Scalable master icon vector
│       ├── icon16.png            # 16x16 icon
│       ├── icon48.png            # 48x48 icon
│       └── icon128.png           # 128x128 icon
├── test-forms/
│   ├── business-directory-form.html  # Australian business directory listing test page
│   └── quote-request-form.html       # Commercial supplier tender test page
└── test/
    ├── test-importer.js          # Unit tests verifying legacy JSON parsing & export fidelity
    ├── test-pipeline.js          # Unit tests verifying Tier 1 matching & Tier 2 prompt building
    ├── test-edge-cases.js        # Unit tests verifying dates, times, comboboxes, and security checks
    ├── test-learning.js          # Unit tests verifying Smart Learning Mode and field guardrails
    └── test-multi-provider.js    # Unit & integration tests for Ollama, Claude, OpenAI & Custom Endpoints
```
```
