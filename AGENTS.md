# AGENTS.md — SmartForm AI Contributor & Agent Guide

> **Audience:** Human contributors, AI coding agents, and delegated subagents  
> **Project:** SmartForm AI — Manifest V3 browser extension  
> **Purpose:** Preserve the project's architecture, security properties, and maintainability across contributors and fresh agent sessions.

This file describes the durable rules and the current architectural model. It is not a substitute for inspecting the repository: source code, tests, `package.json`, and tool configuration are the final authority on current implementation details. When this guide and the repository disagree, verify the discrepancy, follow the actual automated configuration, and update this guide when the discrepancy represents an intentional lasting change.

---

## 1. Start Here: Required Workflow for Every Task

Before changing code:

1. Read this file and the relevant sections of `README.md`.
2. Inspect `git status --short` and the current branch; preserve all pre-existing user changes. Never discard, overwrite, or reformat unrelated work.
3. Read `package.json`, `tsconfig.json`, `eslint.config.js`, `knip.json`, `manifest.json`, and `build.js` when the task touches tooling, compilation, extension permissions, entry points, or packaging.
4. Trace the existing implementation end-to-end: find the feature's callers, callees, data contracts, storage effects, runtime messages, and relevant tests. Do not design from a filename or this guide alone.
5. Identify the smallest layer and set of files that own the requested behaviour. State any important assumptions before making a change when they affect product behaviour, data handling, security, or compatibility.

While implementing:

- Make the smallest coherent change that solves the request; avoid unrelated refactors, speculative abstractions, drive-by formatting, and opportunistic dependency upgrades.
- Follow established patterns when they are sound. Do not introduce a new architectural pattern merely to make one feature look more abstract or "clean".
- Keep business rules separate from browser/UI plumbing where the existing boundaries allow it.
- Prefer readable, explicit code over cleverness. Use descriptive names and small functions with one clear responsibility, but do not split code into meaningless one-line wrappers.
- Do not silently change user-visible behaviour, stored data formats, provider request formats, message contracts, or security policy as part of an unrelated task.

Before reporting completion:

- Run the relevant tests and checks described in [Verification](#9-verification-and-test-strategy).
- Review the final diff for accidental changes, secrets, debug output, generated files, and unrelated edits.
- Report what changed, which checks actually ran, any checks that failed or were skipped, and remaining risks. Never claim a command passed unless it was executed successfully.

If a request is underspecified, make a sensible low-risk assumption and state it. Ask before proceeding only when a material product, privacy, security, data-loss, or compatibility decision cannot be resolved from the repository or request.

---

## 2. Product Model and Non-Negotiable Properties

SmartForm AI is a schema-agnostic browser extension that scans web forms and fills fields using a hybrid two-tier pipeline:

- **Tier 1 — heuristic matching:** locally matches recognisable fields against the active profile without an AI request.
- **Tier 2 — AI reasoning:** sends the remaining field metadata and relevant profile context through the configured provider to reason about complex fields and return fill instructions.

The extension supports multiple profiles, learned fields, business/contact information, services, operating hours, FAQs, and custom fields. It also provides settings and profile management, import/export, fill logs, a vault, and a learning mode.

### Product and privacy boundaries

- The extension has no project-owned application backend in its normal provider flow; AI requests are made directly from the extension to the configured provider or endpoint.
- **Do not describe all data as remaining on-device in every configuration.** When a cloud provider or custom endpoint is selected, information included in the prompt is sent to that destination. Local Ollama/LM Studio configurations are the local-inference path.
- Do not add telemetry, analytics, a new intermediary service, a new data destination, or broader data collection without explicit approval and a documented privacy review.
- Treat profiles, form contents, prompts, AI responses, API keys, custom headers, exported backups, and vault material as sensitive. Never add unnecessary logging or expose secrets in errors, UI, tests, screenshots, or reports.
- Preserve the user's control over provider selection, profile data, vault state, and when filling is initiated. Do not silently submit forms or take unrelated page actions.

### Behavioural invariants

- Tier 1 and Tier 2 must remain distinct: use deterministic matching where it is sufficient and reserve AI reasoning for fields that remain unresolved.
- AI output is untrusted input. Validate the returned structure, allowed field identifiers, duplicate instructions, and applicable value constraints before any DOM mutation.
- Only fill elements discovered by the current scan and represented in the current scan map; never let a model choose arbitrary selectors, page scripts, or DOM targets.
- Sensitive fields and fields excluded by the scanner's security rules must not become eligible through AI output, learning mode, import data, or a fallback path.
- Preserve the user's configured `fillOnlyEmptyFields` behaviour, blacklist behaviour, and tier enablement settings.
- Preserve the explicit distinction between normal settings storage and encrypted vault data. Do not weaken vault locking, credential isolation, or encryption to make a feature easier to implement.

---

## 3. Architecture: How the Pieces Fit Together

The project uses a lightweight, modular TypeScript architecture built on browser APIs. It is not a framework-heavy Clean Architecture implementation; keep its boundaries pragmatic and consistent with the existing code.

### Main runtime flow

1. **Content script (`src/content/`)** runs in the page context. `content.ts` coordinates the fill workflow and user-facing on-page controls.
2. **Scanner (`src/engine/scanner.ts` and `scanner-rules.ts`)** discovers supported form controls, extracts field metadata, handles open Shadow DOM traversal, and applies visibility/sensitive-field rules.
3. **Tier 1 matcher (`src/engine/pattern-matcher.ts`)** compares scanned fields with active profile data and produces candidate fill instructions.
4. **Inserter (`src/content/inserter.ts` and `inserter-normalization.ts`)** applies validated instructions to the previously scanned elements, using framework-aware property setters and appropriate events.
5. **Tier 2 IPC** sends remaining field metadata and page context to the Manifest V3 service worker.
6. **Background (`src/background/`)** routes extension messages, reads settings/profile/vault state through services, and coordinates AI requests.
7. **AI engine (`src/engine/ai-agent.ts` and `src/engine/ai/`)** builds prompts, dispatches to a provider transport, parses the response, and validates candidate fills before returning them.
8. The content script applies the returned instructions to the current scan map and presents feedback. Learning mode (`src/content/content-learning.ts`) separately offers user-approved saving of eligible manually entered values.

### Responsibilities by area

| Area | Owns | Should not become |
|---|---|---|
| `src/types/` | Shared domain, storage, engine, and IPC contracts; focused runtime type guards | A home for feature logic, browser orchestration, or duplicated local models |
| `src/engine/` | Form scanning/rules, deterministic matching, AI orchestration, prompt/response processing, provider transports | Popup/options UI or persistent-storage ownership |
| `src/services/` | Storage adapters/facades and cryptographic/vault operations | Page DOM manipulation or UI event handling |
| `src/background/` | MV3 service-worker lifecycle, alarms, message routing, cross-context orchestration | A second implementation of storage or provider transport logic |
| `src/content/` | Page integration, scanning/fill workflow orchestration, DOM insertion, on-page UI, learning interaction | Persistent business data ownership or provider-specific request construction |
| `src/popup/` | Toolbar popup UI, presentation, and messaging to extension contexts | Duplicated background business logic |
| `src/options/` | Settings/profile/vault/import-export/logs UI and its controllers | A separate persistence implementation or duplicated domain rules |
| `src/utils/` | Reusable parsing, serialization, import/export, and compatibility helpers | Browser lifecycle or UI orchestration |
| `test/` | Automated behavioural, integration-style, and challenger tests | Production implementation code |
| `test-forms/` | Manual/fixture pages used to exercise real form behaviour | Extension runtime entry points |

### Current source landmarks

Use this as a navigation aid, not as an exhaustive or immutable file inventory:

```text
src/
├── types/                 # domain.ts, storage.ts, engine.ts, messages.ts, index.ts
├── engine/
│   ├── scanner.ts         # field discovery
│   ├── scanner-rules.ts   # field interpretation and exclusions
│   ├── pattern-matcher.ts # Tier 1
│   ├── ai-agent.ts        # Tier 2 coordinator and validation
│   └── ai/                # prompt builder, response parser, provider transports
├── services/
│   ├── crypto.ts          # Web Crypto and encrypted payload operations
│   └── storage/           # storage backend, settings, logs, profiles, templates, vault
├── background/            # service worker, message handlers, vault handlers
├── content/               # content orchestrator, inserter, UI, learning mode
├── popup/                 # popup controller, IPC client, UI
├── options/               # options entry point and focused controllers/forms
├── utils/                 # import/export and legacy-format handling
└── icons/
```

`manifest.json` defines extension capabilities and entry resources. `build.js` defines the bundle entry points and creates the loadable output under `dist/`. Check both before adding or moving an entry point, script, stylesheet, icon, or dynamically loaded module. Treat `dist/` as generated output; change source/configuration and rebuild rather than hand-editing generated files.

---

## 4. Dependency Direction and Design Decisions

Use these preferred dependency directions:

- Shared contracts are defined once in `src/types/`; consumers import them rather than recreating structurally similar interfaces.
- Engine and service modules may depend on shared contracts and browser/platform APIs, but should not depend on popup/options presentation code.
- Background and UI/content entry points compose lower-level modules; keep orchestration at these boundaries rather than pushing it down into type or utility modules.
- Keep storage access behind the existing service/storage modules. Do not introduce direct `chrome.storage` calls into new feature modules when the storage facade already provides the required operation; preserve existing direct-access patterns only where there is a clear reason and avoid expanding them.
- Keep provider-specific HTTP details inside `src/engine/ai/` transports. The AI coordinator owns provider selection and the common request/response lifecycle.
- Keep import-format compatibility in the importer/legacy-importer path. Do not spread legacy format detection across UI controllers or storage modules.
- Avoid circular dependencies. `src/types/` must not import implementation modules from the rest of `src/`.

### How to decide where code belongs

Ask: **which layer owns the reason this code changes?** A field-identification rule belongs with scanning/matching; a provider wire-format detail belongs in its transport; a storage representation belongs in services/types; a DOM interaction belongs in content/inserter; a message-routing concern belongs in background. If a function mixes several of these reasons, separate only the responsibilities that genuinely have different owners.

### Architectural changes

Before introducing a new layer, service, manager, abstraction, state container, or dependency:

1. Search for an existing module that already owns the responsibility.
2. Explain why extending that module would be worse than creating the new abstraction.
3. Consider the impact on tests, bundle size, MV3 constraints, privacy, and future maintenance.
4. Keep the change local unless a broader migration is explicitly requested.

For a decision that materially changes module boundaries, runtime dependencies, IPC contracts, persisted data, provider behaviour, or security/privacy properties, add a concise decision record under `docs/decisions/` (create the directory when first needed). Record the context, options considered, decision, and consequences. Do not create an ADR for routine implementation details.

Do not introduce a new runtime npm dependency without demonstrating that a platform API or existing dependency cannot reasonably solve the problem. Explain its runtime footprint, security/supply-chain implications, and maintenance cost; seek approval before adding one.

---

## 5. TypeScript and Code Quality Standards

The actual compiler and linter configuration is authoritative. At the time this guide was prepared, the project uses strict TypeScript settings (`strict`, `strictNullChecks`, `noImplicitAny`, `allowJs: false`) and ESLint rules for source files under `src/`.

- Avoid `any`. Use `unknown` for untrusted or externally sourced values and narrow it with runtime checks before use. If an `any` is genuinely unavoidable at a third-party boundary, isolate it and explain why.
- Use the shared domain/storage/engine/message types in `src/types/`; avoid duplicate definitions and unsafe casts that merely silence the compiler.
- Prefer explicit return types for exported functions, public APIs, and complex boundaries; let the compiler infer trivial local implementation details where that improves readability.
- Handle `null` and `undefined` deliberately. Do not use non-null assertions or broad casts to hide an unhandled state.
- Prefer `readonly` for input data and shared contracts when mutation is not part of the contract.
- Use type-only imports for types. Follow the existing relative import convention, including `.js` specifiers in TypeScript source modules.
- Keep functions cohesive, names descriptive, and control flow straightforward. Prefer early validation and guard clauses when they make invalid states obvious.
- Do not suppress TypeScript or ESLint errors broadly. Any suppression must be narrow, justified, and, where practical, linked to a follow-up issue.

### Automated size rules

ESLint currently enforces both limits for files in `src/` (blank lines and comments are excluded):

- **200 lines per source file**.
- **40 lines per function**, including IIFEs.

These are real build-quality constraints, not optional style suggestions. Split an over-limit module along meaningful responsibilities and preserve a cohesive public interface. Do not evade the rule with compressed formatting, artificial fragments, or meaningless wrappers. If the limits are changed, update `eslint.config.js` deliberately and document the rationale in the change.

---

## 6. Browser Extension, IPC, and DOM Safety

### Manifest V3 execution model

- The background is an MV3 service worker and may be suspended/restarted. Do not rely on module-level state persisting across worker lifetimes; persist durable state through the existing storage/service mechanisms and use alarms for scheduled work.
- Keep browser-context boundaries clear: the service worker is not a page and has no page DOM; content scripts interact with host-page DOM; popup/options scripts own their respective extension UIs.
- Review `manifest.json` permissions, host permissions, content-script matches, web-accessible resources, and CSP implications for any feature that touches browser capabilities or new origins.
- A dynamically imported extension module must be emitted by the build and made available through the manifest where required. Verify the packaged `dist/` output, not just TypeScript compilation.

### Runtime messaging

- Treat `src/types/messages.ts` as the central contract for extension messages and response envelopes. When changing a message, update its type, sender, receiver, and tests together.
- Prefer the canonical `action` discriminator. Existing `type` message names provide compatibility with older call sites; preserve compatibility when modifying an existing action and do not remove an alias without proving it is no longer needed.
- Validate runtime messages at the receiving boundary. TypeScript types do not validate data crossing Chrome messaging boundaries.
- Async `chrome.runtime.onMessage` listeners must return `true` synchronously when they will call `sendResponse` asynchronously; keep this behaviour covered by tests.
- Keep response shapes predictable and handle failed, missing, and malformed responses without leaving the caller hanging.

### DOM and page safety

- Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` for dynamic content. The current ESLint `no-unsanitized` rules enforce unsafe DOM sinks in `src/`.
- Construct dynamic DOM with safe APIs such as `document.createElement`, `textContent`, safe attributes, event listeners, and `replaceChildren`.
- Never add inline event-handler attributes; attach listeners in JavaScript.
- Treat the host page DOM, labels, attributes, form values, and events as untrusted. Do not assume page elements exist, are visible, or retain their state between scan and fill.
- Use the scanner's existing visibility and sensitive-field rules. Before extending supported field types, inspect both scanner and inserter behaviour and add regression tests for the new control.
- Apply fills only to elements in the current scan result. Preserve framework-aware native value setting and the relevant `input`/`change`/`blur` events; do not replace it with a naive assignment without proving framework compatibility.

---

## 7. AI, Data Validation, Storage, and Cryptography

### AI provider integration

- Follow the existing provider pattern: common orchestration in `ai-agent.ts`, provider HTTP details in the relevant transport, and common parsing/validation in the response-processing path.
- Treat every provider response as untrusted, malformed, and potentially adversarial. Parse from `unknown`, validate shape, reject unknown/duplicate field IDs, and constrain values before returning fills.
- Never accept executable code, selectors, arbitrary DOM instructions, or provider-supplied scripts as output.
- Preserve request timeouts/cancellation, clear error handling, and consistent provider result shapes.
- Keep credentials out of prompts, logs, URLs, and error messages. Do not add automatic fallback to a different provider or endpoint that changes where user data is sent without explicit approval.
- When changing prompt structure, model output schema, transport payloads, or response parsing, add tests for valid output, malformed output, provider errors, and boundary/edge cases.

### Sensitive fields and learning

- Use the central scanner security rules rather than creating a second sensitive-field classifier.
- Ensure sensitive inputs (including password, one-time-code, payment-card/security-code, and comparable authentication fields) remain excluded from both AI filling and Smart Learning Mode.
- Learning is user-mediated: preserve the explicit prompt/approval step before saving a discovered value.
- Validate learned keys/values and avoid saving empty, oversized, duplicate, or otherwise ineligible values.

### Storage and compatibility

- Use the storage service facade and its focused modules. Keep storage keys, schemas, default settings, and migration/normalization logic consistent with `src/types/` and `src/services/storage/`.
- Treat existing user data as durable. Do not rename/remove storage keys, change profile semantics, or alter import/export shapes without a compatibility or migration plan.
- For changes to imports/exports, preserve supported legacy formats and round-trip behaviour unless the request explicitly removes compatibility.
- Test encrypted and unencrypted vault paths where relevant, including lock/unlock, incorrect credentials, empty/missing data, and session lifecycle behaviour.
- Never store secrets in source code, test fixtures intended for publication, logs, or committed sample configuration.

### Cryptography and vault

- Use the native Web Crypto implementation in `src/services/crypto.ts`; do not substitute home-grown cryptography or a different algorithm for convenience.
- Never reduce KDF work factors, weaken key sizes, reuse AES-GCM IVs, bypass authentication checks, or introduce plaintext fallbacks to make an operation succeed.
- Treat changes to algorithms, KDF parameters, envelope formats, salt/IV handling, key export/import, or vault state transitions as security-sensitive architecture changes. Require compatibility tests and a documented review before implementation.
- Read current parameter values from the implementation and persisted metadata; do not duplicate fixed cryptographic constants in this guide or in unrelated modules.

---

## 8. Tests, Documentation, and Agent Coordination

### Test strategy

Tests are JavaScript files under `test/` and use the repository's TypeScript registration/resolution setup to exercise source modules. The core test command currently runs fixed suites for importer, pipeline, edge cases, learning, multi-provider behaviour, and encryption. `npm run test:challenger` runs challenger and empirical stress suites matched by its script glob.

- Add or update tests with every behaviour change. Prefer tests that express user-visible behaviour and observable contracts over tests coupled to private implementation details.
- Cover normal cases, boundary cases, invalid/untrusted inputs, failure paths, and regressions appropriate to the change.
- For scanners/inserters, test realistic DOM control types and framework-relevant event behaviour where practical.
- For IPC/lifecycle changes, test async responses, malformed messages, duplicate/concurrent dispatch, and service-worker lifecycle assumptions where relevant.
- For storage/import/export/vault changes, test backward compatibility and data preservation, not just the happy path.
- The current ESLint and TypeScript commands target `src/`; do not assume they lint or type-check JavaScript tests. Run the test commands themselves.
- Run challenger tests for changes to security filters, parsing/validation, IPC, concurrency, lifecycle, vault/crypto, or other adversarial/high-risk paths. `npm run verify` does **not** currently include `npm run test:challenger`.

### Documentation maintenance

- Update `README.md` when user-facing features, installation/setup steps, supported providers, permissions, privacy behaviour, or usage instructions change.
- Update this file only when a durable architectural boundary, important invariant, standard workflow, or verification command changes. Do not edit it for every implementation detail or routine refactor.
- Keep commands and examples grounded in `package.json` and current configuration. Never leave stale file inventories, model names, crypto constants, or claims about privacy/security.
- If implementation and documentation disagree, verify which is intended, then update the appropriate source of truth and the docs in the same change where practical.

### Subagents and parallel work

- The coordinating agent remains responsible for the overall design, integration, final diff review, and verification; delegating a task does not transfer that responsibility.
- Give each subagent a narrow objective, explicit file ownership, allowed scope, expected output, and checks to run.
- Prefer parallel work on independent modules. Do not have multiple agents edit shared contracts, `package.json`, `manifest.json`, `build.js`, global styles, or the same controller at the same time without explicit coordination.
- Have subagents report assumptions, changed files, tests run, and unresolved issues. Review their changes rather than accepting their summaries as proof.
- Treat role-specific instructions in `.agents/agents/` as scoped guidance, not as more authoritative than this file or the live repository configuration. Check that a role's task and assumptions still match the current code before using it.

---

## 9. Verification and Test Strategy

The scripts in `package.json` are the canonical commands. Confirm their current definitions before relying on this list.

| Command | Purpose |
|---|---|
| `npm run build` | Bundle the extension and generate `dist/` |
| `npm run watch` | Rebuild on source changes |
| `npm run type-check` | Run strict TypeScript checking with no output |
| `npm run lint` | Run ESLint against `src/` |
| `npm run knip` | Detect unused files, exports, and dependencies |
| `npm test` | Run the six core automated test suites |
| `npm run test:challenger` | Run challenger/empirical stress suites |
| `npm run verify` | Run lint, type-check, knip, core tests, and build |

### Required checks

- For normal code changes, run `npm run verify` before completion.
- Also run `npm run test:challenger` when the change touches any high-risk areas listed in [Test strategy](#test-strategy), or when the task explicitly asks for full verification.
- For documentation-only changes, inspect the diff and verify that referenced commands/paths are correct; running the full build is usually unnecessary.
- If a command fails, determine whether the failure was introduced by the change or was already present. Do not hide it, bypass it, or report the task as fully verified.
- If a check cannot be run because dependencies, environment, or tooling are unavailable, state that limitation and provide the exact command the contributor should run.
- After building, check the generated package where the task affects manifest entries, dynamic imports, assets, permissions, or runtime loading.

`npm run verify` is the standard gate, but it is not a substitute for targeted manual testing or challenger tests when the changed risk area requires them.

---

## 10. Git and Change Management

- Work on the current task branch. Do not switch branches, commit, push, force-push, reset, rebase, or rewrite history unless explicitly requested by the user or repository maintainer.
- Never commit generated `dist/` output unless the repository's current release workflow explicitly requires it.
- Keep changes reviewable and focused. Do not alter unrelated files simply to make the working tree look clean.
- When asked to create commits, use the repository's established Conventional Commit style (`feat`, `fix`, `refactor`, `types`, `test`, `docs`, `chore`) and make commits atomic and accurately scoped.
- Never claim a change is ready to merge without reporting the verification performed and any known limitations.

---

## 11. Definition of Done

A task is complete when:

1. The requested behaviour is implemented at the correct architectural boundary with no unrelated changes.
2. Existing product, privacy, security, IPC, storage, and compatibility invariants are preserved, or any approved change to them is documented.
3. Relevant automated tests have been added or updated and pass.
4. Required verification has passed, or every skipped/failed check is explicitly reported.
5. User-facing documentation and durable architecture guidance are updated when the change warrants it.
6. The final report names the important files/behaviours changed, commands actually run, and any remaining risks or follow-up work.
