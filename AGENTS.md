# AGENTS.md — SmartForm AI Agent Rules & Project Standards

This document establishes the binding rules, architectural constraints, and quality standards for all autonomous agents, subagents, and human contributors working on the **SmartForm AI** codebase.

---

## 1. Project Context & Architecture

SmartForm AI is an intelligent, multi-provider browser extension designed for Manifest V3 (MV3). It autonomously detects, normalizes, and autofills complex web forms using instant local heuristic pattern matching (Tier 1) and privacy-first LLM reasoning (Tier 2: Google Gemini, OpenAI, Anthropic Claude, Ollama local, or Custom REST).

### Core Architectural Boundaries
- **Manifest Version**: Manifest V3 (`manifest.json`), targeting Chromium and Firefox (Gecko).
- **Service Worker (`src/background/`)**: Headless message router and background coordinator. Zero DOM access; handles tab state and cross-context messaging.
- **Content Scripts (`src/content/`)**: Injected into web pages at `document_idle`. Dynamically imports scanner, matcher, and DOM inserter. Renders floating UI (toast, learning card, vault unlock modal).
- **Extension Pages (`src/popup/`, `src/options/`)**: Secure internal browser extension environments with full access to `chrome.storage` and `chrome.runtime`.
- **Vault & Cryptography (`src/services/crypto.ts`, `src/services/storage/`)**: Client-side AES-256-GCM encryption with PBKDF2 (100,000 iterations). Zero external cryptographic libraries; uses native Web Crypto API exclusively (`crypto.subtle`).
- **Engine (`src/engine/`)**: Pure, decoupled form analysis and AI logic. Can be imported in both browser and headless Node.js test environments.

---

## 2. Strict TypeScript & Code Quality Standards

### Zero Tolerance for Uncontrolled `any`
1. **No Implicit or Explicit `any`**:
   - `any` is strictly prohibited in function parameters, return values, variable declarations, and type definitions.
   - For ambiguous external inputs (e.g., JSON parsing, message payloads, DOM events), use `unknown` combined with runtime type guards or zod/type assertions.
   - If an edge case truly requires bypassing the type system (e.g., non-standard legacy browser globals), it must be accompanied by an inline comment explaining why, formatted as: `// TYPE-SAFETY EXCEPTION: <specific reason>`.
2. **Explicit Function Return Types**:
   - Every exported function, public class method, and API boundary must declare explicit return types.
3. **Strict Null Checks**:
   - Never assume DOM elements, storage entries, or message responses exist. Handle `null` and `undefined` exhaustively via optional chaining (`?.`), nullish coalescing (`??`), or guard assertions.
4. **Discriminated Unions for Inter-Process Messaging**:
   - Every message sent via `chrome.runtime.sendMessage` must be typed as a discriminated union (e.g., `{ action: 'FILL_PAGE'; payload: ... }`).
   - Every message handler must return a strongly typed response envelope `{ success: boolean; data?: T; error?: string }`.

---

## 3. Clean Code & Modularity Guardrails

All code must strictly comply with the established automated guardrails configured in ESLint:

1. **Max 200 Lines of Code Per File**:
   - No source file in `src/` may exceed 200 physical lines (excluding blank lines and comment blocks).
   - If a module approaches or exceeds this limit, refactor it immediately into specialized submodules with a cohesive facade (follow the `src/services/storage/` pattern).
2. **Max 40 Lines of Code Per Function**:
   - No function, method, or closure may exceed 40 lines.
   - Decompose long pipelines into single-responsibility pure helper functions.
3. **Dead Code Elimination**:
   - Unused imports, unused variables, and orphaned exports are rejected by `knip` and `eslint`. Maintain clean exports.

---

## 4. Manifest V3 & Browser Security Constraints

1. **No `innerHTML` or Unsanitized DOM Writes**:
   - Enforced by `eslint-plugin-no-unsanitized`.
   - Never assign untrusted strings or templates to `innerHTML`, `outerHTML`, or `insertAdjacentHTML`.
   - Construct UI elements using safe DOM APIs (`document.createElement`, `textContent`, `setAttribute`, `replaceChildren`).
2. **No Remote Code Execution**:
   - Never use `eval()`, `new Function()`, or inline `<script>` tags.
   - All code executed by the extension must be bundled locally inside the extension package.
3. **CSP Compliance**:
   - Never place inline event handlers (`onclick`, `onsubmit`) in HTML files (e.g., `options.html`, `popup.html`, `test-forms/*.html`). Always attach listeners via JavaScript (`addEventListener`).
4. **Zero External Runtime Dependencies**:
   - The runtime extension bundle must not pull in bloated external npm runtime dependencies. All core logic must rely on standard Web Platform APIs (`fetch`, `crypto.subtle`, standard DOM).

---

## 5. Trunk-Based Development & Git Workflow

1. **Single Source of Truth (`main`)**:
   - Work is committed directly to the `main` branch in small, verified, atomic increments.
2. **Commit Message Format**:
   - Follow Conventional Commits:
     - `feat(...)`: New feature or user-facing capability.
     - `fix(...)`: Bug fix or security remediation.
     - `refactor(...)`: Code restructuring without behavioral change.
     - `types(...)`: Type additions, interface adjustments, or TS conversion.
     - `test(...)`: Unit test additions or test harness updates.
     - `chore(...)`: Tooling, build config, or dependency updates.
3. **Mandatory Pre-Commit Verification**:
   - Never commit broken code, failing tests, or type errors to `main`.
   - Run `npm run verify` before committing.

---

## 6. Pre-Completion Verification Checklist

Before reporting any task, wave, or PR as complete, subagents and developers must execute and verify:

```bash
npm run verify
```

This command runs:
1. `npm run lint` — ESLint flat config with `eslint-plugin-no-unsanitized` and LOC limits.
2. `npm run type-check` — TypeScript compiler checks (`tsc --noEmit`).
3. `npm run knip` — Knip dead code, orphaned export, and unused dependency check.
4. `npm test` — All 6 automated test suites (importer, pipeline, edge cases, smart learning, multi-provider AI, encryption).
5. Build output validation (when bundler active) — ensuring bundled output is generated error-free in `dist/`.
