# API Auth Guard Route Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize API route modules so Elysia auth guards protect whole route groups instead of repeating `requireSession(request)` in every handler.

**Architecture:** Create one reusable authenticated Elysia plugin/guard that resolves `session` into route context. Split mixed public/protected modules, especially registers, so guarded apps contain only protected endpoints and public apps remain unguarded. Preserve every existing URL and response contract while changing only route composition and auth plumbing.

**Tech Stack:** Bun, Elysia, TypeScript, Narvik session validation, Drizzle ORM, Bun test, Ultracite/Biome.

---

## Constraints

- Work directly on the current branch, not a git worktree.
- Do not broaden this into all HTTP/protobuf migration work.
- Do not change existing API paths.
- Do not protect public auth routes or `POST /api/registers/pair`.
- Keep route behavior identical for `401`, `403`, `404`, validation, and protobuf sync responses.
- Follow TDD: write a failing test, run it and verify the failure, implement the smallest code change, rerun tests.

## Target Shape

Route modules should move toward this shape:

```txt
apps/api/src/lib/authenticated.ts
apps/api/src/registers/public-routes.ts
apps/api/src/registers/protected-routes.ts
apps/api/src/registers/routes.ts
apps/api/src/merchants/routes.ts
apps/api/src/outlets/routes.ts
apps/api/src/staff/routes.ts
apps/api/src/sync/routes.ts
```

Fully protected modules use:

```ts
.use(authenticated)
```

Mixed modules split into public and protected modules first, then compose:

```ts
export const registersRoutes = new Elysia()
  .use(publicRegisterRoutes)
  .use(protectedRegisterRoutes);
```

---

### Task 1: Add Failing Tests For Guard-Based Session Context

**Files:**
- Create: `apps/api/src/lib/__test__/authenticated.test.ts`
- Later create: `apps/api/src/lib/authenticated.ts`

**Step 1: Write the failing test**

Create `apps/api/src/lib/__test__/authenticated.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "bun:test";
import { Elysia } from "elysia";

const mockValidateSession = vi.fn();

vi.mock("../auth", () => ({
  narvik: {
    cookieName: "narvik_session",
    validateSession: (...args: unknown[]) => mockValidateSession(...args),
  },
}));

const { authenticated } = await import("../authenticated");

async function requestProtected(cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.cookie = cookie;
  }

  const app = new Elysia()
    .use(authenticated)
    .get("/protected", ({ session }) => ({ userId: session.userId }))
    .compile();

  const response = await app.handle(
    new Request("http://localhost/protected", { headers })
  );
  const json = await response.json();
  return { json, status: response.status };
}

describe("authenticated guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 before the handler when no session exists", async () => {
    mockValidateSession.mockResolvedValue(null);

    const { json, status } = await requestProtected();

    expect(status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  test("adds session to guarded route context", async () => {
    mockValidateSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    });

    const { json, status } = await requestProtected(
      "narvik_session=valid-token"
    );

    expect(status).toBe(200);
    expect(json).toEqual({ userId: "user-1" });
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/api/src/lib/__test__/authenticated.test.ts
```

Expected: FAIL because `../authenticated` does not exist.

**Step 3: Implement minimal guard**

Create `apps/api/src/lib/authenticated.ts`:

```ts
import { Elysia } from "elysia";
import { getSessionFromRequest } from "./session";

export const authenticated = new Elysia({ name: "authenticated" }).resolve(
  async ({ request, status }) => {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return status(401, { error: "Unauthorized" });
    }

    return { session };
  }
);
```

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/lib/__test__/authenticated.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/lib/authenticated.ts apps/api/src/lib/__test__/authenticated.test.ts
git commit -m "test: cover authenticated route guard"
```

---

### Task 2: Reorganize Registers Into Public And Protected Route Modules

**Files:**
- Create: `apps/api/src/registers/public-routes.ts`
- Create: `apps/api/src/registers/protected-routes.ts`
- Modify: `apps/api/src/registers/routes.ts`
- Modify: `apps/api/src/registers/__test__/routes.test.ts`

**Step 1: Write the failing tests**

Add these tests to `apps/api/src/registers/__test__/routes.test.ts`:

```ts
test("keeps pairing route public without a session", async () => {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  const { json, status } = await makeRequest("/api/registers/pair", {
    method: "POST",
    body: { pairingCode: "AB12CD34" },
  });

  expect(status).toBe(400);
  expect((json as Record<string, unknown>).error).toBe("Invalid pairing code");
  expect(mockValidateSession).not.toHaveBeenCalled();
});

test("protects register creation through the authenticated guard", async () => {
  const { json, status } = await makeRequest("/api/outlets/outlet-1/registers", {
    method: "POST",
    body: { name: "Register 1" },
  });

  expect(status).toBe(401);
  expect((json as Record<string, unknown>).error).toBe("Unauthorized");
});
```

If equivalent assertions already exist, tighten them so they prove the public route does not call session validation and protected routes still return `401`.

**Step 2: Run test to verify current behavior**

Run:

```bash
bun test apps/api/src/registers/__test__/routes.test.ts
```

Expected: Existing tests may pass; the new `mockValidateSession` assertion should fail if the current combined module still initializes auth for public routes. If it passes, continue anyway and use the test as regression coverage for the split.

**Step 3: Move public route code**

Create `apps/api/src/registers/public-routes.ts` and move only `POST /registers/pair` into it:

```ts
import { outlets, registers } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { recordSyncEvent } from "../lib/sync-events";

export const publicRegisterRoutes = new Elysia({ prefix: "/api" }).post(
  "/registers/pair",
  async ({ body, set }) => {
    // Move current handler body unchanged.
  },
  {
    body: t.Object({
      pairingCode: t.String({
        minLength: 8,
        maxLength: 8,
        pattern: "^[A-Z0-9]{8}$",
      }),
    }),
  }
);
```

**Step 4: Move protected route code and use guard**

Create `apps/api/src/registers/protected-routes.ts` with:

```ts
import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { authenticated } from "../lib/authenticated";
import { ForbiddenRequestError, throwIfFalse } from "../lib/request-auth";
import { recordSyncEvent } from "../lib/sync-events";

export const protectedRegisterRoutes = new Elysia({ prefix: "/api" })
  .use(authenticated)
  // Move current protected handlers here.
```

Inside each moved handler:

```ts
async ({ body, params: { outletId }, session }) => {
  throwIfFalse(
    await verifyOutletOwnership(session.userId, outletId),
    new ForbiddenRequestError()
  );
}
```

Remove `request` from handler destructuring where it is only used for `requireSession`.

**Step 5: Compose routes**

Replace `apps/api/src/registers/routes.ts` with:

```ts
import { Elysia } from "elysia";
import { protectedRegisterRoutes } from "./protected-routes";
import { publicRegisterRoutes } from "./public-routes";

export const registersRoutes = new Elysia()
  .use(publicRegisterRoutes)
  .use(protectedRegisterRoutes);
```

**Step 6: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/registers/__test__/routes.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/registers apps/api/src/registers/__test__/routes.test.ts
git commit -m "refactor: split public and protected register routes"
```

---

### Task 3: Convert Merchants Routes To Authenticated Guard

**Files:**
- Modify: `apps/api/src/merchants/routes.ts`
- Modify: `apps/api/src/merchants/__test__/routes.test.ts`

**Step 1: Write the failing test**

Add or tighten this test in `apps/api/src/merchants/__test__/routes.test.ts`:

```ts
test("injects session into merchant creation without manual request auth", async () => {
  mockValidateSession.mockResolvedValue({
    id: "session-1",
    userId: "user-1",
  });

  const insertedValues: unknown[] = [];
  mockInsert.mockImplementation(() => ({
    values: vi.fn().mockImplementation((vals: unknown) => {
      insertedValues.push(vals);
      return {
        returning: vi.fn().mockResolvedValue([
          { id: "merchant-1", ...(vals as Record<string, unknown>) },
        ]),
      };
    }),
  }));

  const { status } = await makeRequest("/api/merchants", {
    method: "POST",
    body: { name: "Test Merchant" },
    cookie: "narvik_session=valid-token",
  });

  expect(status).toBe(200);
  expect(insertedValues[1]).toEqual(
    expect.objectContaining({
      merchantId: "merchant-1",
      role: "owner",
      userId: "user-1",
    })
  );
});
```

**Step 2: Run test before implementation**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts
```

Expected: PASS before refactor is acceptable here because behavior already exists. This test becomes the safety net for the refactor.

**Step 3: Use guard in route module**

Modify `apps/api/src/merchants/routes.ts`:

```ts
import { authenticated } from "../lib/authenticated";
```

Change route declaration:

```ts
export const merchantsRoutes = new Elysia({ prefix: "/api/merchants" })
  .use(authenticated)
```

Change handlers:

```ts
async ({ body, session }) => {
  // remove: const session = await requireSession(request);
}
```

```ts
.get("/", async ({ session }) => {
  // remove: const session = await requireSession(request);
});
```

Remove unused `requireSession` import.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/merchants/routes.ts apps/api/src/merchants/__test__/routes.test.ts
git commit -m "refactor: guard merchant routes"
```

---

### Task 4: Convert Outlets Routes To Authenticated Guard

**Files:**
- Modify: `apps/api/src/outlets/routes.ts`
- Modify: `apps/api/src/outlets/__test__/routes.test.ts`

**Step 1: Write the failing/safety test**

Add or tighten this test in `apps/api/src/outlets/__test__/routes.test.ts`:

```ts
test("returns 403 when authenticated user cannot access merchant", async () => {
  mockValidateSession.mockResolvedValue({
    id: "session-1",
    userId: "user-1",
  });

  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  const { json, status } = await makeRequest("/api/merchants/m-1/outlets", {
    method: "POST",
    body: { name: "Outlet 1" },
    cookie: "narvik_session=valid-token",
  });

  expect(status).toBe(403);
  expect((json as Record<string, unknown>).error).toBe("Forbidden");
});
```

**Step 2: Run test before implementation**

Run:

```bash
bun test apps/api/src/outlets/__test__/routes.test.ts
```

Expected: PASS before refactor is acceptable because behavior exists; it protects the refactor.

**Step 3: Use guard in route module**

Modify `apps/api/src/outlets/routes.ts`:

```ts
import { authenticated } from "../lib/authenticated";
```

Change route declaration:

```ts
export const outletsRoutes = new Elysia({ prefix: "/api" }).use(authenticated)
```

Replace each handler’s `request` usage:

```ts
async ({ body, params: { merchantId }, session }) => {
  throwIfFalse(
    await verifyMerchantAccess(session.userId, merchantId),
    new ForbiddenRequestError()
  );
}
```

Keep `set` where it is used for `404`.

Remove unused `requireSession` import.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/outlets/__test__/routes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/outlets/routes.ts apps/api/src/outlets/__test__/routes.test.ts
git commit -m "refactor: guard outlet routes"
```

---

### Task 5: Convert Staff Routes To Authenticated Guard

**Files:**
- Modify: `apps/api/src/staff/routes.ts`
- Modify: `apps/api/src/staff/__test__/routes.test.ts`

**Step 1: Write the failing/safety test**

Add or tighten this test in `apps/api/src/staff/__test__/routes.test.ts`:

```ts
test("keeps forbidden merchant access as 403 after auth succeeds", async () => {
  mockValidateSession.mockResolvedValue({
    id: "session-1",
    userId: "user-1",
  });

  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  const { json, status } = await makeRequest("/api/merchants/m-1/staff", {
    method: "POST",
    body: { name: "Cashier", pin: "123456", role: "cashier" },
    cookie: "narvik_session=valid-token",
  });

  expect(status).toBe(403);
  expect((json as Record<string, unknown>).error).toBe("Forbidden");
});
```

**Step 2: Run test before implementation**

Run:

```bash
bun test apps/api/src/staff/__test__/routes.test.ts
```

Expected: PASS before refactor is acceptable; it locks behavior.

**Step 3: Use guard in route module**

Modify `apps/api/src/staff/routes.ts`:

```ts
import { authenticated } from "../lib/authenticated";
```

Change route declaration:

```ts
export const staffRoutes = new Elysia({ prefix: "/api" }).use(authenticated)
```

Replace each handler’s `request` usage with `session`:

```ts
async ({ body, params: { merchantId }, session }) => {
  throwIfFalse(
    await verifyMerchantAccess(session.userId, merchantId),
    new ForbiddenRequestError()
  );
}
```

Keep `set` where it is used for `404`.

Remove unused `requireSession` import.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/staff/__test__/routes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/staff/routes.ts apps/api/src/staff/__test__/routes.test.ts
git commit -m "refactor: guard staff routes"
```

---

### Task 6: Convert Sync Protobuf Routes To Authenticated Guard

**Files:**
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write the failing/safety test**

Add or tighten tests in `apps/api/src/sync/__test__/routes-protobuf.test.ts`:

```ts
test("returns 401 protobuf route response when no session exists", async () => {
  const body = SyncStatusRequest.encode({
    lastServerEventId: 0,
    outletId: "outlet-1",
  }).finish();

  const response = await app.handle(
    new Request("http://localhost/api/sync/status", {
      body,
      headers: {
        "Content-Type": "application/x-protobuf",
      },
      method: "POST",
    })
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Unauthorized" });
});
```

Also add an authenticated path assertion for one endpoint, for example `/api/sync/status`, that proves `verifyOutletAccess(session.userId, outletId)` still runs and returns `403` when access is denied.

**Step 2: Run test before implementation**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS before refactor is acceptable; it protects auth/protobuf ordering.

**Step 3: Use guard after protobuf plugin**

Modify `apps/api/src/sync/routes.ts`:

```ts
import { authenticated } from "../lib/authenticated";
```

Route declaration should keep protobuf parser first, then auth:

```ts
export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(tsProtoPlugin)
  .use(authenticated)
```

Replace each handler’s `request` usage:

```ts
async ({ body, set, session }) => {
  const statusRequest = body as SyncStatusRequest;
  throwIfFalse(
    await verifyOutletAccess(session.userId, statusRequest.outletId),
    new ForbiddenRequestError()
  );
}
```

Keep `set` where it is used for `400` or `404`.

Remove unused `requireSession` import.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/routes.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "refactor: guard protobuf sync routes"
```

---

### Task 7: Remove Manual Session Helper Usage From Route Handlers

**Files:**
- Modify: `apps/api/src/lib/request-auth.ts`
- Search all: `apps/api/src/**/*routes.ts`

**Step 1: Write the search-based failing check**

Run:

```bash
rg "requireSession\\(|if \\(!session\\)" apps/api/src
```

Expected before implementation: Finds route-level uses or unused helper code.

**Step 2: Remove route-level `requireSession` imports**

Remove `requireSession` imports from:

```txt
apps/api/src/merchants/routes.ts
apps/api/src/outlets/routes.ts
apps/api/src/registers/protected-routes.ts
apps/api/src/staff/routes.ts
apps/api/src/sync/routes.ts
```

Keep `ForbiddenRequestError` and `throwIfFalse` if still used.

**Step 3: Decide whether `requireSession` stays**

If no production code imports `requireSession`, remove it from `apps/api/src/lib/request-auth.ts` and keep only:

```ts
export class ForbiddenRequestError extends Error {
  status = 403;

  constructor() {
    super("Forbidden");
    this.name = "ForbiddenRequestError";
  }

  toResponse() {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
}

export function throwIfFalse(condition: boolean, error: Error): void {
  if (!condition) {
    throw error;
  }
}
```

If other code still needs `UnauthorizedRequestError`, keep it. Do not delete code used outside routes.

**Step 4: Run search again**

Run:

```bash
rg "requireSession\\(|if \\(!session\\)" apps/api/src
```

Expected: No route-level manual session checks. `requireSession` may remain only if used outside route handlers.

**Step 5: Run focused route tests**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/api/src/registers/__test__/routes.test.ts apps/api/src/staff/__test__/routes.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src
git commit -m "refactor: remove manual session checks from api routes"
```

---

### Task 8: Full Verification And Formatting

**Files:**
- No planned code edits unless verification finds issues.

**Step 1: Run route test suite**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/api/src/registers/__test__/routes.test.ts apps/api/src/staff/__test__/routes.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/lib/__test__/authenticated.test.ts
```

Expected: PASS.

**Step 2: Run broader API tests**

Run:

```bash
bun test apps/api/src
```

Expected: PASS or only known unrelated failures documented with exact failing test names.

**Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS. If the repo has package-specific typecheck scripts instead, use the existing command from `package.json`.

**Step 4: Run Ultracite**

Run:

```bash
bun x ultracite fix
```

Expected: Completes successfully. Review any modified files before committing.

**Step 5: Run final check**

Run:

```bash
bun x ultracite check
```

Expected: PASS.

**Step 6: Commit verification fixes**

```bash
git add apps/api/src docs/plans/2026-05-10-api-auth-guard-route-reorganization.md
git commit -m "chore: verify guarded api routes"
```

---

## Rollback Plan

If Elysia `resolve` still causes route context or prefix typing issues:

1. Keep the public/protected route split because it is still useful.
2. Replace `.use(authenticated)` with a local route-group `beforeHandle`.
3. Keep handlers using `session` only if TypeScript can prove it; otherwise fall back to the current `requireSession(request)` helper inside protected modules.
4. Do not merge a guard implementation that changes route status codes or protects `POST /api/registers/pair`.

## Success Criteria

- `POST /api/registers/pair` remains public.
- All merchant, outlet, protected register, staff, and sync routes reject missing sessions with `401`.
- Authorization failures after successful session validation still return `403`.
- Existing `404` and validation responses remain unchanged.
- Route handlers no longer contain repeated manual `requireSession(request)` calls.
- Protobuf sync routes still decode request bodies and encode successful responses correctly.
- Focused route tests, typecheck, and Ultracite checks pass.
