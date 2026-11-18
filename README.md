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
     - _Security Best Practice_: To prevent unauthorized web pages from querying your local models, run Ollama allowing only your specific extension origin: `OLLAMA_ORIGINS="chrome-extension://<id>" ollama serve` (or `moz-extension://<uuid>` on Firefox). The Settings UI includes a 1-click copy button with your exact ID.
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

- **AES-256-GCM Vault Encryption & Master Password**: Protects all stored profiles, credentials, and fill logs with client-side authenticated encryption (`crypto.subtle`). Uses a random 16-byte salt and 600,000 PBKDF2 iterations to harden even short PINs against dictionary attacks.
- **Session Caching via `chrome.storage.session`**: Unlocking with your PIN/passphrase caches the key strictly in RAM for your browser session, surviving background worker sleep cycles while auto-locking when the browser exits.
- **Dual-Mode Backup Export**: Choose between 🔒 **Encrypted Vault Backup** (safe for cloud drives and external storage) or 📄 **Plaintext JSON** (for manual editing or scripting). Encrypted backups are automatically detected on import.
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

1. **Install dependencies and build the extension bundle**:
   ```bash
   cd smartform-ai-extension
   npm install
   npm run build
   ```
   This compiles all TypeScript modules via `esbuild` and populates the `dist/` distribution folder.
2. Open your browser and navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** (toggle switch in the top right corner).
4. Click the **Load unpacked** button.
5. Select the **`dist/`** directory:
   ```
   ./smartform-ai-extension/dist
   ```
6. The **SmartForm AI** extension icon will now appear in your browser toolbar!

---

## Setup & First Fill

1. **Import Your Profile**:
   - Click the extension icon in the toolbar, then click the **⚙️ Settings** icon (or right-click the extension icon -> _Options_).
   - Navigate to the **Import & Export** tab.
   - Paste or drag-and-drop your exported JSON configuration file.
   - Click **Process & Import Configuration**. All your services, FAQs, address, contact details, and descriptions will load instantly!
2. **Configure Your AI Provider**:
   - Go to the **AI Engine & Providers** tab.
   - Select your active provider:
     - **Google Gemini**: Enter your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
     - **OpenAI & Local Models**: Select a Quick Preset (e.g. _Ollama Local_ or _LM Studio Local_), or enter your endpoint and model name.
     - **Anthropic Claude**: Enter your Claude API key.
     - **Custom Endpoint**: Configure custom headers and templates.
   - Click **Test Connection** to verify connection and measure round-trip latency.
   - Click **Save AI Settings**.
3. **Test with the Local Business Directory**:
   - In the settings sidebar, click **🧪 Open Test Form** (or open `test-forms/business-directory-form.html` in Chrome).
   - Click the floating `✨ AI Fill` button (or click the extension popup and hit _⚡ Fill Form on Page_).
   - Watch the form fill with company name, contact info, operating hours, service checkboxes, character-limited descriptions, and FAQs!

---

## Project Structure

```
smartform-ai-extension/
├── manifest.json                  # Extension manifest (synced to dist/manifest.json)
├── build.js                       # esbuild bundler script (outputs to dist/)
├── tsconfig.json                  # Strict TypeScript compiler configuration
├── knip.json                      # Dead code and unused dependency scanner
├── AGENTS.md                      # Autonomous Agent Operating Guide & project standards
├── README.md                      # Documentation & instructions
├── dist/                          # Compiled, loadable extension package (gitignored)
├── src/                           # 100% Strict TypeScript source files
│   ├── types/                     # Centralized domain, storage, engine & message types
│   │   ├── domain.ts              # Profile, business hours, FAQ & learned field models
│   │   ├── storage.ts             # Storage schemas, vault status, export payloads
│   │   ├── messages.ts            # ExtensionMessage discriminated unions & response envelopes
│   │   ├── engine.ts              # Field analysis, match result & AI provider options
│   │   └── index.ts               # Unified type exports barrel
│   ├── background/
│   │   ├── service-worker.ts      # MV3 service worker lifecycle & alarm scheduler
│   │   ├── message-handlers.ts    # Dual-action dispatch & message routing
│   │   └── vault-handlers.ts      # Vault state machine, PIN authentication, badge updates
│   ├── content/
│   │   ├── content.ts             # In-page orchestrator & message listener
│   │   ├── content.css            # Floating button styling & highlight animations
│   │   ├── inserter.ts            # Framework-aware DOM property setter & event dispatcher
│   │   ├── inserter-normalization.ts # Select option matching & combobox normalizers
│   │   ├── floating-button.ts     # In-page floating "✨ AI Fill" pill
│   │   ├── toast.ts               # Status notification toasts
│   │   ├── unlock-modal.ts        # In-page vault PIN unlock modal
│   │   └── learning-card.ts       # Smart Learning Mode prompt card
│   ├── engine/
│   │   ├── scanner.ts             # DOM field extractor (tags, types, labels, limits)
│   │   ├── scanner-rules.ts       # Security filters (blocks passwords, OTPs, captchas)
│   │   ├── pattern-matcher.ts     # Tier 1: Fast regex heuristic matcher (0 latency/tokens)
│   │   ├── ai-agent.ts            # Tier 2: Multi-provider reasoning orchestrator
│   │   └── ai/                    # Pluggable AI transports & payload builders
│   │       ├── prompt-builder.ts  # Schema-constrained prompt constructor
│   │       ├── response-parser.ts # Robust JSON extractor (markdown fences, chat, arrays)
│   │       ├── gemini-transport.ts# Google Gemini REST client
│   │       ├── openai-transport.ts# OpenAI & Ollama/LM Studio compatible client
│   │       ├── claude-transport.ts# Anthropic Claude Messages API client
│   │       └── custom-transport.ts# Custom HTTP endpoint client with template tokens
│   ├── popup/
│   │   ├── popup.html / popup.css # Extension toolbar popup interface
│   │   └── popup.ts               # Profile switcher & 1-click trigger
│   ├── options/
│   │   ├── options.html / options.css # Dark Slate tabbed dashboard
│   │   ├── options.ts             # Dashboard initialization & controller orchestrator
│   │   └── controllers/           # Modular controllers (each <= 200 LOC)
│   ├── services/
│   │   ├── crypto.ts              # Web Crypto API wrapper (AES-256-GCM, PBKDF2)
│   │   ├── storage/               # Modular storage engine (settings, profiles, logs, vault)
│   │   └── storage.ts             # Cohesive storage facade
│   ├── utils/
│   │   ├── exporter.ts            # Dual-mode backup exporter (encrypted vault vs plaintext)
│   │   ├── importer.ts            # Universal JSON parser (native & encrypted)
│   │   └── legacy-importer.ts     # Backward-compatibility parser for legacy extension formats
│   └── icons/                     # Vector and raster extension icons
├── test-forms/
│   ├── business-directory-form.html  # Australian business directory listing test page
│   └── quote-request-form.html       # Commercial supplier tender test page
└── test/                          # Automated unit, integration & challenger test suites
    ├── test-importer.js           # Importer & storage round-trip tests
    ├── test-pipeline.js           # Tier 1 heuristic matching & Tier 2 prompt building
    ├── test-edge-cases.js         # Date/time controls, comboboxes, blacklist security
    ├── test-learning.js           # Smart Learning Mode & security guardrails
    ├── test-multi-provider.js     # Ollama, Claude, OpenAI & custom HTTP transports
    ├── test-encryption.js         # AES-256-GCM vault, PBKDF2, PINs & session caching
    └── test-challenger-*.js       # Empirical adversarial stress tests & IPC dispatch
```

---

## Developer Workflow: Commands & Verification

All code in this repository adheres to strict automated quality guardrails:

```bash
# Compile and bundle the extension into dist/
npm run build

# Continuous watch mode during development
npm run watch

# Run strict TypeScript compiler verification (allowJs: false, noEmit)
npm run type-check

# Run ESLint (enforces <= 200 LOC/file, <= 40 LOC/function, no-unsanitized DOM)
npm run lint

# Detect orphaned files, unused exports, or stale dependencies
npm run knip

# Execute all automated core unit test suites
npm test

# Run empirical adversarial stress and challenger tests
npm run test:challenger

# Run the complete pre-commit verification pipeline (lint + type-check + knip + test + build)
npm run verify
```

---

## CI/CD & Automated Code Review

- **GitHub Actions Pipeline**: Automatically executes on every push and pull request to `main`. Runs `lint`, `type-check`, `knip`, core test suites, and empirical challenger tests, bundles the extension, and saves a pre-packaged `smartform-ai-extension.zip` build artifact inside the Actions run for rapid testing.
- **Releases**: Pushing a version tag (`git tag v0.1.0-alpha && git push origin v0.1.0-alpha`) automatically builds and publishes a formal GitHub Release with changelog release notes and the production extension `.zip` attached.
- **CodeRabbit AI Review**: Pull requests are reviewed by the open-source [CodeRabbit](https://coderabbit.ai) GitHub App, enforcing architectural and security rules configured in `.coderabbit.yaml`.

> For guidelines, architectural constraints, and rules binding on all human and AI contributors, consult [AGENTS.md](AGENTS.md).
