# Baresync Doctor Heuristics Investigation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Investigate why `bun run doctor` reports many warnings on a valid paired-schema setup, then harden Baresync diagnostics so they distinguish real schema problems from expected defaults and coarse heuristics.

**Architecture:** Keep the investigation grounded in the Baresync repo source, not in app-specific guesses. Start by reproducing the warnings on the canonical inventory example and on the Sakti POS contract, then inspect the generator diagnostics and contract metadata model to identify which warnings are true validations, which are heuristics, and which need new metadata to become actionable. Only after that, decide whether the fix belongs in diagnostics, config surface, or docs.

**Tech Stack:** TypeScript, Bun, Baresync generator/runtime, Vitest, Drizzle ORM, SQLite schema metadata.

---

## Investigation Scope

The current issue is not a broken app sync path. The issue is that `doctor` emits warning noise that makes it hard to trust:

- `SYNC_INDEX_MISSING_SCOPE_WATERMARK` is emitted even when the schema already has the expected composite index shape.
- `SYNC_INDEX_MISSING_LOCAL_DIRTY` is emitted based on the presence of `is_synced`, not on whether the dirty-row index exists.
- `SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1` fires on the default paired-schema configuration, which is expected for the current API/local split.
- `SYNC_SCHEMA_NO_CONFLICT_STRATEGY` and `SYNC_SCHEMA_NO_DELETE_STRATEGY` are only useful if the config surface can actually express those strategies.

The plan below records the investigation path and the likely fix surfaces.

## Task 1: Reproduce the current diagnostics on reference setups

**Files:**
- Read: `/home/eekrain/CODE/baresync/examples/inventory-json-polling/packages/sync-contract/sync.config.ts`
- Read: `/home/eekrain/CODE/baresync/examples/inventory-json-polling/packages/sync-contract/src/api-synced-schema.ts`
- Read: `/home/eekrain/CODE/baresync/examples/inventory-json-polling/packages/sync-contract/src/local-synced-schema.ts`
- Read: `/home/eekrain/CODE/sakti-pos/packages/sync-contract/sync.config.ts`
- Read: `/home/eekrain/CODE/sakti-pos/packages/sync-contract/src/api-synced-schema.ts`
- Read: `/home/eekrain/CODE/sakti-pos/packages/sync-contract/src/local-synced-schema.ts`

**Step 1: Capture baseline warnings**

Run:

```bash
bun run doctor
```

from both repos.

Expected:
- The example should show the same warning classes, or a useful subset, if the heuristics are global.
- Sakti POS should show the same categories of warnings on its synced tables.

**Step 2: Record the exact warning set**

Run:

```bash
bun run doctor 2>&1 | tee /tmp/baresync-doctor.log
```

Expected:
- A saved log that can be compared against future diagnostic changes.

## Task 2: Trace each warning to its source condition

**Files:**
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/diagnostics.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/schema/synced-table.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/config.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/index.ts`

**Step 1: Map warning codes to implementation branches**

Expected outcome:
- Confirm which warnings are unconditional.
- Confirm which warnings only inspect metadata fields, not actual index definitions.
- Confirm whether any warning has enough information today to become a real validation.

**Step 2: Classify diagnostics**

Expected outcome:
- Real error validation.
- Real warning validation.
- Heuristic warning.
- Warning that is impossible to make actionable with the current config API.

## Task 3: Decide the minimal fix surface for the library

**Files:**
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/diagnostics.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/schema/contract.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/diagnostics.test.ts`
- Read: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/generator.test.ts`

**Step 1: Decide whether each warning should be**

- removed,
- downgraded,
- made conditional,
- or backed by new metadata/config.

**Step 2: Record the implementation boundary**

Expected outcome:
- `diagnostics.ts` only warns when it can prove a meaningful issue.
- `config.ts` only grows if the library needs new author-supplied metadata.
- If a warning cannot be supported by current schema/config metadata, it should not stay as a high-noise default.

## Task 4: Add regression tests for the diagnostics behavior

**Files:**
- Modify: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/diagnostics.test.ts`
- Modify: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/generator.test.ts`

**Step 1: Write failing tests that codify the correct behavior**

Cover at least:
- a table that already has the expected composite index should not be flagged by the scope-watermark check,
- a table with the dirty-row index should not be flagged by the local-dirty check,
- the paired-schema default should not trigger the batteries-included warning unless there is an actual mixed one-sided business-column pattern,
- any strategy warning should only appear when the config can actually represent a missing strategy or when the library intentionally wants to enforce it.

**Step 2: Run the tests**

Run:

```bash
bun test packages/baresync/src/generator/__test__/diagnostics.test.ts
```

Expected:
- Tests fail before the diagnostics are corrected.

**Step 3: Implement the smallest source fix**

Expected:
- Warnings become conditional on actual schema/index metadata.
- Unsupported or overly broad warnings are reclassified or removed.

**Step 4: Re-run the targeted tests**

Expected:
- The diagnostics tests pass.

## Task 5: Add a dedicated warning-regression fixture set

**Files:**
- Create: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/fixtures/doctor-heuristics.ts`
- Create: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/doctor-heuristics.test.ts`
- Modify: `/home/eekrain/CODE/baresync/packages/baresync/src/generator/__test__/diagnostics.test.ts`

**Step 1: Write shared fixtures for the known noisy scenarios**

The fixture file should define small, reusable Drizzle tables for:

- a valid synced table with a real `(scope, sync_updated_at)` composite index,
- a valid local synced table with a real `is_synced` dirty-row index,
- a table that mixes built-in sync metadata with extra one-sided columns,
- a table that intentionally lacks the relevant index so the warning still triggers.

**Step 2: Write regression tests against the fixture set**

The tests should assert:

- no warning for the valid scope/watermark index case,
- no warning for the valid local-dirty index case,
- no warning for the default paired-schema built-ins only case,
- a warning still appears when the index is actually missing,
- a warning still appears when there are real non-built-in local-only and server-only columns on the same table.

**Step 3: Run the focused doctor-heuristic tests**

Run:

```bash
bun test packages/baresync/src/generator/__test__/doctor-heuristics.test.ts
```

Expected:
- The new fixture-backed tests fail until the Baresync heuristics are corrected.
- Once the Baresync patch lands, these tests become the long-term regression guard.

## Task 6: Re-run the public doctor command on both example and Sakti POS

**Files:**
- Read: `/home/eekrain/CODE/baresync/examples/inventory-json-polling/packages/sync-contract/sync.config.ts`
- Read: `/home/eekrain/CODE/sakti-pos/packages/sync-contract/sync.config.ts`

**Step 1: Verify the example still reports only meaningful warnings**

Run:

```bash
bun run doctor
```

in the example contract package.

**Step 2: Verify Sakti POS no longer gets heuristic-only noise**

Run:

```bash
bun run doctor
```

in `packages/sync-contract`.

Expected:
- The warnings should be materially reduced.
- Any remaining warnings should be understandable and actionable.

## Task 7: Document the diagnostic policy

**Files:**
- Modify: `/home/eekrain/CODE/sakti-pos/docs/adr/` if a policy decision is needed
- Modify: `/home/eekrain/CODE/sakti-pos/docs/plans/2026-06-04-baresync-doctor-heuristics-investigation.md` if the investigation changes shape
- Modify: `/home/eekrain/CODE/baresync/apps/docs/content/docs/schema/diagnostics.mdx`

**Step 1: Write the rule for when a diagnostic becomes a warning vs an error**

Expected outcome:
- Future contributors know whether the goal is correctness, performance advice, or conservative safety.

**Step 2: Update public docs/examples if behavior changes**

Expected outcome:
- The doctor command no longer surprises users with warnings that look like bugs.

## Success Criteria

- `doctor` emits only actionable warnings on a correct paired-schema setup.
- The warning set is explainable from the library source, not from tribal knowledge.
- Heuristics that cannot inspect real schema/index metadata are either removed or explicitly documented as advisory.
- Tests lock in the intended behavior so the warning noise does not regress later.
