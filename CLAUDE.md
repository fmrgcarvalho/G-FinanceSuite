CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral baseline (Karpathy 4 + Mnimiy 8)
These rules apply to every task in this project unless explicitly overridden. Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

Rules 1-4 are the Karpathy baseline (via forrestchang/andrej-karpathy-skills). Rules 5-12 are the Mnimiy extensions (via tweet).

Rule 1 - Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess. Present multiple interpretations when ambiguity exists. Push back when a simpler approach exists. Stop when confused. Name what's unclear.

Rule 2 - Simplicity First
Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No abstractions for single-use code. Test: would a senior engineer say this is overcomplicated? If yes, simplify.

Rule 3 - Surgical Changes
Touch only what you must. Clean up only your own mess. Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style.

Rule 4 - Goal-Driven Execution
Define success criteria. Loop until verified. Don't follow steps. Define success and iterate. Strong success criteria let you loop independently.

Rule 5 - Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction. Do NOT use me for: routing, retries, deterministic transforms. If code can answer, code answers.

Rule 6 - Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens. If approaching budget, summarize and start fresh. Surface the breach. Do not silently overrun.

Rule 7 - Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested). Explain why. Flag the other for cleanup. Don't blend conflicting patterns.

Rule 8 - Read before you write
Before adding code, read exports, immediate callers, shared utilities. "Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

Rule 9 - Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does. A test that can't fail when business logic changes is wrong.

Rule 10 - Checkpoint after every significant step
Summarize what was done, what's verified, what's left. Don't continue from a state you can't describe back. If you lose track, stop and restate.

Rule 11 - Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase. If you genuinely think a convention is harmful, surface it. Don't fork silently.

Rule 12 - Fail loud
"Completed" is wrong if anything was skipped silently. "Tests pass" is wrong if any were skipped. Default to surfacing uncertainty, not hiding it.

---

## Project Context — G-FinanceSuite

### Running the app
```bash
node server.js      # http://localhost:3000  (ou: npm start)
node verify.mjs     # Playwright headless — 12 fluxos, screenshots em verify-shots/
```
The app uses `type="module"` — must be served over HTTP, not `file://`.

### Architecture
ES6 native modules, no bundler. Entry point: `docs/js/app.js`.

```
app.js (orchestrator)
  └── state.js          — AppState, PAGE_SIZE, PDF_MAX_RECORDS (single source of truth)
  └── modules/
        logger.js       — shared Logger (IIFE singleton, not a class)
        ui.js           — show/hide/fmt/setSummaryCards/guessFieldType
        pagination.js   — setPagination / renderPagination (isRecon flag)
        import.js       — file queue, loaders, mapping        (~773 lines, near limit)
        duplicates.js   — Op1 logic + initDuplicatesEvents()  (~519 lines)
        reconciliation.js — Op2 logic + initReconEvents()     (~510 lines)
        export.js       — CSV/JSON/XML/XLSX/PDF for both ops  (~322 lines)
  └── workers/excel.worker.js  — uses importScripts, NOT an ES module
```

**Module size limit: 800 lines.** If a module exceeds this, split it before adding features.
`import.js` is near the limit — if it needs a new major feature, split `loaders.js` out first.

### Conventions locked in
- **No inline handlers**: zero `onclick`/`onchange`/`oninput` in index.html. All wiring in `app.js` DOMContentLoaded via `addEventListener`.
- **Event delegation for dynamic HTML**: templates use `data-action="x"` or `data-field="y"` attributes; parent containers delegate. Set up in `initDuplicatesEvents()`, `initReconEvents()`, and `_setupQueueDelegation()` inside `initImport()`.
- **No `window.X` globals**: everything flows through ES module imports. CDN libraries (XLSX, jspdf, Chart) remain on `window` — that's intentional.
- **AppState is the only state**: never reach for module-level variables for shared data. Read/write `AppState.*` instead.
- **onmouseenter/onmouseleave on buttons**: the only inline handlers allowed — used exclusively on dynamically generated `<button>` elements for hover effects in reconciliation templates, where CSS classes can't reach.

### DOM layout — critical IDs
- Op1 results live entirely inside `#results-section` (summary-cards → filters-section → pagination-top → dup-list → pagination)
- Op2 results live entirely inside `#recon-results-section`
- Both sections are siblings inside `#content`
- Op1 summary card IDs: `s-total`, `s-unique`, `s-dups`, `s-groups`
- Op2 summary card IDs: `recon-s-total`, `recon-s-ok`, `recon-s-nok`, `recon-s-tol`
- Never mix Op1 and Op2 IDs across modules (was a bug, now fixed)

### Key data shapes

**Raw record** (after import, stored in `AppState.rawData[]`):
```javascript
{
  numero_documento: "DOC-001",   // string — varies by source file
  atribuicao:       "FORN-001",  // string — grouping key for reconciliation
  montante:         1500.00,     // number — value field
  data:             "2026-01-10",// string (date as-is from source)
  tipo:             "FV",        // string — type code
  ficheiro_origem:  "file.xlsx", // string — added by import.js, always present
}
```

**Duplicate group** (stored in `AppState.dupGroups[]`):
```javascript
{
  key:     "DOC-001",           // string — composite key from checked fields
  count:   3,                   // number — total records in group
  records: [ ...rawRecord ],    // array of raw records
  sum:     4500.00,             // number — sum of selectedSumField (or 0)
}
```

**Reconciliation group** (stored in `AppState.reconDashboardState.allGroups[]`):
```javascript
{
  key:     "FORN-001",          // string — value of groupField
  records: [ ...rawRecord ],    // array of raw records in this group
  saldo:   0.00,                // number — sum of valField (positive = debits, negative = credits)
  debito:  1500.00,             // number — sum of positive values
  credito: 1500.00,             // number — sum of absolute negative values
  reconciliado: true,           // boolean — |saldo| <= tolerance
}
```

### Before adding a new feature — checklist
1. **Read the target module** from top to bottom. Note its exports and the last ~50 lines.
2. **Check module size**: `wc -l docs/js/modules/<module>.js`. Over 800? Split first.
3. **Identify the DOM IDs** the feature needs. Are they inside Op1 or Op2 section? Don't cross-wire.
4. **Check AppState** — does the feature need new state? Add it to `state.js` AND to `reset()`.
5. **Wire events in app.js or the module's `init*Events()`** — never add inline handlers to HTML.
6. **Verify**: `node verify.mjs` must pass zero JS errors after the change.
7. **Commit** with a message that says WHY, not just what.

### Known limitations (not bugs, by design)
- PDF export capped at PDF_MAX_RECORDS (2000) — enforced in export.js
- Excel parsing runs in a Web Worker; main thread falls back to synchronous if Worker fails
- Chart.js, SheetJS, jsPDF load from CDN — app shows warnings if offline
- Reconciliation sort applied before pagination slice — intentional, ensures consistent order across pages

### Test fixtures
`docs/test-fixtures/sample.json` — 30 records with known expected results:
- **Op1** (group by `numero_documento`): 5 duplicate groups (sizes 3,2,3,2,2), 18 unique records
- **Op2** (group by `atribuicao`, value `montante`, tolerance 1):
  - RECON-OK (2 records, saldo=0) → reconciliado
  - RECON-TOL (2 records, saldo=0.50) → reconciliado com tolerância
  - RECON-NOK (2 records, saldo=700) → por reconciliar
  - DUP-A through DUP-E → grupos com duplicados internos
