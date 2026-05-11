# Outlet Receipt Fields Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-outlet receipt header fields so printer settings can edit the printed merchant name and address, with the merchant name as the default value.

**Architecture:** Keep the outlet record as the source of truth and store receipt-specific header values alongside the outlet. The settings UI edits the active outlet's receipt name and receipt address, the outlet update API persists them, and receipt formatting reads them when generating print output. If the dedicated receipt fields are empty, printing falls back to the outlet's existing merchant name and address so existing outlets keep working.

**Tech Stack:** SolidJS, Tauri, Drizzle, protobuf-ts generated contracts, Rust backend commands, Vitest, Ultracite/Biome.

---

### Task 1: Add Receipt Header Fields To The Outlet Data Contract

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Modify: `packages/database/src/api-schema.ts`
- Modify: `packages/protobuf/proto/common.proto`
- Modify: `packages/protobuf/proto/outlets.proto`
- Modify: `apps/api/src/protobuf/domain.ts`
- Modify: `apps/api/src/outlets/routes.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`
- Modify: `apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts`
- Modify: `apps/api/src/protobuf/__test__/domain.test.ts`
- Modify: `apps/api/src/outlets/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/__test__/cloud.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- `Outlet` protobuf messages round-trip `receipt_name` and `receipt_address`.
- `encodeOutlet()` includes the receipt fields and falls back to outlet name/address when the dedicated fields are empty.
- `createOutlet()` and `updateOutlet()` accept and return the new fields.
- The cloud adapter passes the fields through `getOutlets()` and `createOutlet()`.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/api/src/protobuf/__test__/domain.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: fail because the receipt-specific fields do not exist yet.

**Step 3: Write the minimal implementation**

- Add nullable receipt-specific columns to the outlet schemas.
- Extend the proto schema and regenerate the protobuf TypeScript files.
- Update API create/update/list handlers and local encoding helpers.
- Preserve existing outlet behavior by defaulting the receipt name to the outlet name.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/api/src/protobuf/__test__/domain.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: PASS.

### Task 2: Expose Receipt Header Editing In Printer Settings

**Files:**
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts`
- Modify: `apps/pos-app/src/components/settings/printer-settings.tsx`
- Modify: `apps/pos-app/src/pages/settings/outlet.tsx`
- Modify: `apps/pos-app/src/pages/settings/__test__/use-settings.test.ts`
- Modify: `apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx`
- Modify: `apps/pos-app/src/pages/settings/__test__/settings.test.tsx`

**Step 1: Write the failing tests**

Add tests that prove:
- The outlet settings state loads receipt name and receipt address for the selected outlet.
- Saving updates those fields through the outlet update flow.
- The printer settings UI shows editable receipt name/address inputs and the saved values.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx apps/pos-app/src/pages/settings/__test__/settings.test.tsx
```

Expected: fail because the UI and settings state do not yet expose those fields.

**Step 3: Write the minimal implementation**

- Extend the settings store with receipt name/address signals and save handlers.
- Add form inputs to printer settings with clear labels and outlet-specific save behavior.
- Keep timezone saving separate so one field does not overwrite the other.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx apps/pos-app/src/pages/settings/__test__/settings.test.tsx
```

Expected: PASS.

### Task 3: Use Outlet Receipt Fields During Printing

**Files:**
- Modify: `apps/pos-app/src/pages/pos/use-pos.ts`
- Modify: `apps/pos-app/src/lib/receipt/format-receipt.ts`
- Modify: `apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts`
- Modify: `apps/pos-app/src/lib/printer/__test__/client.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- Receipt formatting prints the dedicated receipt name and address when they are set.
- Receipt formatting falls back to the outlet name/address when the dedicated fields are empty.
- Checkout receipts continue to include the correct merchant header without hardcoding `SAKTI POS`.

**Step 2: Run the tests to verify they fail**

Run:
```bash
bun run test -- apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts apps/pos-app/src/lib/printer/__test__/client.test.ts
```

Expected: fail because receipt formatting still hardcodes the app name path.

**Step 3: Write the minimal implementation**

- Pass the outlet receipt fields into the receipt data used at checkout.
- Update receipt formatting to prefer the dedicated receipt fields and fall back safely.
- Keep the rest of the receipt layout unchanged.

**Step 4: Run the tests to verify they pass**

Run:
```bash
bun run test -- apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts apps/pos-app/src/lib/printer/__test__/client.test.ts
```

Expected: PASS.

### Task 4: Verify The Whole Flow

**Files:**
- All files changed above

**Step 1: Run the relevant targeted test set**

Run:
```bash
bun run test -- apps/api/src/protobuf/__test__/domain.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/pos-app/src/pages/settings/__test__/use-settings.test.ts apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts apps/pos-app/src/lib/printer/__test__/client.test.ts
```

Expected: PASS.

**Step 2: Run formatting and lint checks**

Run:
```bash
bun x ultracite fix
bun x ultracite check
```

Expected: both pass with no remaining issues.

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add outlet receipt header fields"
```
