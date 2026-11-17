# AGENTS.md — SmartForm AI Autonomous Agent Operating Guide

> **Target Audience**: AI Coding Agents (Claude Code, Cursor, Gemini CLI, Antigravity, Copilot) & Human Engineers.  
> **Status**: Invariant Reference & System Standard  
> **Repository**: [smartform-ai-extension](file:///home/eranga/.gemini/antigravity/scratch/smartform-ai-extension)

This document is the **single source of truth** for working on this repository. Even if prior chat sessions or instructions are deleted, any agent or developer reading this guide can immediately navigate, build, extend, test, and maintain the codebase with zero regression risk.

---

## 1. Project Overview & Mission

**SmartForm AI** is a privacy-first, schema-agnostic browser extension designed for **Manifest V3 (MV3)**. It autonomously detects, normalizes, and autofills complex web forms (business directories, supplier quotes, job applications, government portals) using a **Hybrid Two-Tier Engine**:

1. **Tier 1 (Instant Heuristic Matching)**: Zero-latency, zero-cost regex pattern matching for standard fields (email, phone, company name, address, suburb).
2. **Tier 2 (Pluggable AI Reasoning)**: Intelligent reasoning over complex fields (operating hours, service checkboxes, character-capped summaries, FAQ synthesis, combobox mapping) using:
   - **Google Gemini** (official REST endpoint)
   - **Local Offline Models** (Ollama at `localhost:11434`, LM Studio at `localhost:1234` — zero cloud data leakage)
   - **OpenAI & Compatible Cloud APIs** (GPT-4o, Groq, DeepSeek)
   - **Anthropic Claude** (Messages API)
   - **Custom Webhook Endpoints** (Arbitrary JSON templates with dot-path response extraction)

### Core Invariants
- **100% Client-Side Privacy**: Zero telemetry, zero middleman servers. All profiles, credentials, and settings reside in browser storage.
- **AES-256-GCM Vault**: Master password/PIN encryption via native Web Crypto API (`crypto.subtle`). Fast PBKDF2 key derivation (100,000 iterations), ephemeral session key caching in RAM (`chrome.storage.session`), and auto-locking alarms.
- **Zero Runtime npm Dependencies**: The extension runtime is built exclusively on standard Web Platform APIs (`fetch`, `crypto.subtle`, DOM standard). No bulky external runtime npm packages.

---

## 2. Architecture & Subsystem Map

The source code resides in `src/` and is bundled by `build.js` into `dist/`.

```
src/
├── types/                      # Centralized TypeScript definitions (Wave 0)
│   ├── domain.ts               # Profile, ContactInfo, BusinessHours, FaqItem, LearnedField
│   ├── storage.ts              # Local/Session storage schemas, EncryptedVault, VaultStatus
│   ├── messages.ts             # ExtensionMessage discriminated union & response envelopes
│   ├── engine.ts               # ScannedFormField, FillInstruction, MatcherResult, AI configs
│   └── index.ts                # Unified barrel exports
├── services/                   # Core infrastructure & persistence
│   ├── crypto.ts               # Native Web Crypto wrapper (AES-256-GCM, PBKDF2, PIN hashing)
│   ├── storage/                # Modular storage layer (each module <= 200 LOC)
│   │   ├── storage-base.ts     # In-memory mock & Chrome storage adapter
│   │   ├── storage-settings.ts # Settings & API key persistence
│   │   ├── storage-logs.ts     # Latency & AI inspector logs
│   │   ├── storage-template.ts # Custom prompt/template storage
│   │   ├── storage-profiles.ts # Multi-profile CRUD & active profile switching
│   │   ├── storage-vault.ts    # Vault status, session key caching, auto-lock
│   │   └── storage-vault-setup.ts # Vault initialization & master password management
│   └── storage.ts              # Cohesive storage facade combining all submodules
├── utils/                      # Parsers & serialization
│   ├── exporter.ts             # Dual-mode backup exporter (encrypted vault vs plaintext JSON)
│   ├── importer.ts             # Universal configuration parser with auto-format detection
│   └── legacy-importer.ts      # Backward-compatibility parser for legacy extension formats
├── engine/                     # Decoupled form analysis & AI agent
│   ├── scanner.ts              # DOM field inspection (tags, types, labels, options, context)
│   ├── scanner-rules.ts        # Normalization heuristics, visibility checks, password blocks
│   ├── pattern-matcher.ts      # Tier 1 fast regex heuristic matcher
│   ├── ai-agent.ts             # Tier 2 universal AI orchestrator & fill validator
│   └── ai/                     # Provider transports & payload builders
│       ├── prompt-builder.ts   # Context & schema-constrained prompt constructor
│       ├── response-parser.ts  # Robust JSON extractor (markdown fences, chat text, arrays)
│       ├── gemini-transport.ts # Google Gemini REST client
│       ├── openai-transport.ts # OpenAI & Ollama/LM Studio compatible client
│       ├── claude-transport.ts # Anthropic Messages API client
│       └── custom-transport.ts # Custom HTTP endpoint client with template token replacement
├── background/                 # Manifest V3 service worker (headless)
│   ├── service-worker.ts       # Service worker lifecycle, alarms, port management
│   ├── message-handlers.ts     # Action router with dual-dispatch & payload unpacking
│   └── vault-handlers.ts       # Vault lifecycle, PIN auth, badge updates
├── content/                    # Web page injection (document_idle)
│   ├── content.ts              # Content orchestrator, runtime message listener
│   ├── inserter.ts             # Framework-aware DOM property setter & event dispatcher
│   ├── inserter-normalization.ts # Select option matching, combobox handling, checkbox toggling
│   ├── floating-button.ts      # Dockable "✨ AI Fill" floating UI pill
│   ├── toast.ts                # Non-intrusive status toast alerts
│   ├── unlock-modal.ts         # In-page vault PIN unlock modal
│   └── learning-card.ts        # Smart Learning Mode prompt card
├── popup/                      # Toolbar action popup
│   ├── popup.html / popup.css  # UI markup & styling
│   └── popup.ts                # Profile switcher, vault state, and 1-click trigger
└── options/                    # Settings & profile dashboard (Options page)
    ├── options.html / options.css # Tabbed dashboard markup & Dark Slate styling
    ├── options.ts              # Dashboard entry point
    └── controllers/            # Decomposed tab controllers (<= 200 LOC each)
        ├── common.ts           # Shared UI helpers (escapeHtml, notifications)
        ├── tab-controller.ts   # Tab navigation & URL hash routing
        ├── profiles-controller.ts # Profile selector & active management
        ├── profiles-form.ts    # Profile editing form & validation
        ├── profiles-collections.ts # Services tags, operating hours, FAQs, custom fields
        ├── ai-controller.ts    # AI engine settings & connection testing
        ├── vault-controller.ts # Master password, PIN setup, auto-lock timeout
        ├── import-export-controller.ts # Backup export & configuration import
        ├── preferences-controller.ts # Highlight colors, blacklist, learning mode
        └── logs-controller.ts  # Latency inspection logs & clear action
```

---

## 3. Canonical Developer & Verification Commands

All development must be verified using the canonical scripts defined in `package.json`:

```bash
# 1. Full Build (bundles TypeScript into dist/)
npm run build

# 2. Watch Mode (rebuilds on file changes)
npm run watch

# 3. TypeScript Type Check (strict, allowJs: false, noEmit)
npm run type-check

# 4. ESLint Check (enforces zero unsanitized DOM and LOC limits)
npm run lint

# 5. Dead Code & Orphaned Export Check
npm run knip

# 6. Core Automated Unit Test Suites
npm test

# 7. Challenger & Stress Test Suites
npm run test:challenger

# 8. Mandatory Pre-Commit Gate (runs lint, type-check, knip, test, and build)
npm run verify
```

> [!IMPORTANT]
> **Never commit or mark a task complete if `npm run verify` fails.** `npm run verify` is the primary gatekeeper of code quality.

---

## 4. Inviolable Architectural & Security Guardrails

### A. Strict TypeScript Standards
1. **Zero Uncontrolled `any`**: `any` is strictly banned in signatures, return types, variables, and casts. Ambiguous external inputs (DOM events, storage values, JSON payloads) must be typed as `unknown` and validated with type guards.
2. **Explicit Return Types**: All exported functions, methods, and API boundaries must declare explicit return types.
3. **Strict Null Checks**: Never assume DOM elements, storage objects, or responses exist. Handle `null` and `undefined` exhaustively via optional chaining (`?.`), nullish coalescing (`??`), or early guard returns.

### B. Clean Code & Modularity Limits
Enforced automatically by ESLint:
1. **Max 200 Physical Lines Per File**: No source file in `src/` may exceed 200 lines. When approaching this limit, split the file into single-responsibility submodules and expose a cohesive facade.
2. **Max 40 Physical Lines Per Function**: Long routines must be decomposed into small, pure helper functions.

### C. Manifest V3 & DOM Security
1. **Zero `innerHTML` or Unsanitized DOM Sinks**:
   - Monitored by `eslint-plugin-no-unsanitized`.
   - Never write to `innerHTML`, `outerHTML`, or `insertAdjacentHTML`.
   - Build all dynamic DOM structures using `document.createElement()`, `textContent`, `setAttribute()`, and `replaceChildren()`.
2. **No Remote Code Execution**:
   - `eval()`, `new Function()`, and inline `<script>` tags are strictly forbidden by Chrome Extension CSP.
3. **No Inline Event Handlers**:
   - Never attach `onclick`, `onsubmit`, or other inline attributes in HTML files. Always attach listeners via JavaScript (`addEventListener`).

### D. Inter-Process Communication (IPC) Protocol
- **Discriminated Unions**: All messages sent across `chrome.runtime.sendMessage` must adhere to the `ExtensionMessage` discriminated union in `src/types/messages.ts`.
- **Dual Dispatch**: Message handlers must support canonical action names (`action: 'RUN_AI_FILL'`) while preserving legacy compatibility (`type: 'SMARTFORM_RUN_AI_FILL'`).
- **Standardized Response Envelopes**: All responses must use `{ success: boolean; data?: T; error?: string }`.
- **Manifest V3 Async Port Channel Rule**: Whenever a message handler performs asynchronous work (e.g., awaiting storage, cryptography, or fetch), the `chrome.runtime.onMessage` listener **must return `true` synchronously** to prevent Chrome from prematurely tearing down the communication channel.

---

## 5. Testing & Test Harness Architecture

- Tests reside in `test/` and run directly against the TypeScript source files via Node.js using `--import ./test/register-ts.js` and `test/ts-resolver.mjs`.
- **Test Suites**:
  1. `test/test-importer.js`: Format detection, legacy format conversion, round-trip fidelity, error handling.
  2. `test/test-pipeline.js`: Tier 1 heuristic pattern matching, prompt synthesis, response schema validation.
  3. `test/test-edge-cases.js`: Date/time controls, comboboxes, frame exclusions, blacklist resolution.
  4. `test/test-learning.js`: Smart Learning Mode, field security filters (passwords, OTPs, CVVs strictly rejected).
  5. `test/test-multi-provider.js`: AI transports (Gemini, Claude, OpenAI, Ollama, LM Studio, Custom).
  6. `test/test-encryption.js`: Web Crypto PBKDF2 derivation, AES-256-GCM encryption/decryption, session RAM caching, vault locking.
  7. `test/test-challenger-*.js`: Adversarial stress tests, lifecycle hooks, concurrent IPC dispatch.

---

## 6. Trunk-Based Development & Commit Rules

1. **Commit directly to `main`**: Keep commits atomic, frequent, and fully verified.
2. **Conventional Commit Messages**:
   - `feat(...)`: New user-facing feature.
   - `fix(...)`: Bug fix or security patch.
   - `refactor(...)`: Restructuring without changing behavior.
   - `types(...)`: Type additions or interface refinements.
   - `test(...)`: Test additions or runner improvements.
   - `docs(...)`: Documentation updates.
   - `chore(...)`: Tooling, build config, or dependency maintenance.

---

## 7. Mandatory Agent Self-Maintenance Rule

> [!IMPORTANT]
> **The Golden Rule for All Agents**:  
> Whenever you add new features, refactor code, introduce new modules, or modify build/test configurations:
> 1. You **MUST** update this file (`AGENTS.md`) if architectural patterns, file maps, or commands change.
> 2. You **MUST** update `README.md` if user-facing setup, supported providers, or features change.
> 3. You **MUST** run `npm run verify` and achieve a 100% green exit code (0) before completing your task.
