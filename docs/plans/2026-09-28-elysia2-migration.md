# Elysia 2 Migration + AOT Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate `apps/api` from Elysia 1.3 to Elysia 2 beta with an AOT vite build, and bump pos-app's Eden client to 2.0 beta, so the Cloudflare Worker deploys with lower memory and cold-start cost.

**Architecture:** Codemod-first migration of the 9 api route modules, adapter swap (`CloudflareAdapter` → `WebStandardAdapter`), replace the unused-pino `@bogeychan/elysia-logger` with a custom `requestLog` hook that logs single-line JSON via `console.log` (the only path that actually reaches `logs/api.log`), then move dev/build from `wrangler dev` to `vite dev` with `@cloudflare/vite-plugin` + `elysia/plugin/aot/vite`.

**Tech Stack:** elysia 2.0.0-beta.19, @elysia/cors 2.0.0-beta.1, @elysia/eden 2.0.0-beta.5, vite, @cloudflare/vite-plugin, bun test.

**Design doc:** `docs/plans/2026-09-28-elysia2-migration-design.md`

**Verified facts (do not re-verify):**
- `elysia@2.0.0-beta.19` exports: `WebStandardAdapter` from `elysia/adapter/web-standard` (there is NO cloudflare-worker adapter in 2.x — Workers use web-standard fetch); `Manifest` (aliased `Capture`), `problem`, `NotFound`, `ValidationError`, `status`, `t` from root; `aot` from `elysia/plugin/aot/vite` as `(entry: string, options?) => VitePlugin`.
- `@elysia/cors@2.0.0-beta.1` (npm dist-tag `next`) exists; `@elysiajs/cors` stays 1.x forever.
- `@elysia/eden@2.0.0-beta.5` (dist-tag `next`) peers `elysia >= 2.0.0-beta.2`.
- API entry: `apps/api/src/index.ts` is just `export default app` — AOT-compatible (it needs an exported Elysia instance).
- `apps/api` never uses `ctx.log` from elysia-logger — only its `autoLogging` side effect.
- `logs/api.log` today contains zero pino output (workerd never forwarded it); only `[wrangler:info]` request lines. `console.log` from the worker DOES reach it.
- Our code has no `onError`, no error-code dictionary, no macros, no `.ws()`, no `{as:'scoped'}` — codemod surface is small.
- `packages/sync-contract` has no elysia imports; pos-app surface is `src/lib/api/eden.ts` (treaty), `src/lib/auth/cloud.ts` (`throwIfError`), `src/types/api-backend-types.d.ts`.

---

### Task 1: Baseline measurements

**Files:** none modified.

**Step 1:** Run the api test suite and record the count.

Run: `bun test apps/api/src` (from repo root) — or `cd apps/api && bun test`
Expected: 66 tests pass.

**Step 2:** Run pos-app tests.

Run: `cd apps/pos-app && bun test`
Expected: 131 pass (`adaptive-dialog.test.tsx` may flake under parallel load — rerun if so).

**Step 3:** Record cold-start baseline. Start the dev server, then time the first request:

```bash
# terminal 1
apps/api/scripts/dev
# terminal 2, after server prints ready
time curl -sf http://127.0.0.1:3001/ -o /dev/null
```

Expected: `Sakti POS API v1`; note the real time in the task notes below (append to this file when executing).

**Task 1 notes (fill during execution):** api tests ____ passing; pos-app ____ passing; cold-start first-request ____ ms.

---

### Task 2: Dependency bump + codemod + adapter/plugin fixes

**Files:**
- Modify: `apps/api/package.json` (deps)
- Modify: `apps/api/src/app.ts` (adapter, cors, logger removal)
- Modify: `apps/api/src/lib/authenticated.ts` (`resolve`→`derive`)
- Modify: all 9 route modules under `apps/api/src/*/routes.ts` (signature swap via codemod)

**Step 1: Swap dependencies**

```bash
cd apps/api
bun remove @bogeychan/elysia-logger @elysiajs/cors
bun add elysia@next @elysia/cors@next
```

Then pin exact versions in `apps/api/package.json` (remove `^`/ranges): `elysia`, `@elysia/cors` → `2.0.0-beta.19` / `2.0.0-beta.1`.

**Step 2: Run the codemod**

Run: `cd apps/api && bunx @elysia/codemod@latest`
Expected: route signatures swapped to `.post(path, {schema}, handler)`, `resolve`→`derive`, hook renames. **Review the full diff** (`git diff apps/api/src`) — codemod is ~95%; check each module compiles logically. Do not commit yet.

**Step 3: Fix app.ts manually**

```ts
import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import { WebStandardAdapter } from "elysia/adapter/web-standard";
import { assetsRoutes } from "./assets/routes";
import { authRoutes } from "./auth/routes";
import { requestLog } from "./lib/request-log";
import { merchantsRoutes } from "./merchants/routes";
import { outletsRoutes } from "./outlets/routes";
import { paymentSettingsRoutes } from "./payment-settings/routes";
import { registersRoutes } from "./registers/routes";
import { staffRoutes } from "./staff/routes";
import { syncRoutes } from "./sync/routes";

const app = new Elysia({ adapter: WebStandardAdapter })
  .use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      maxAge: 86_400,
    }),
  )
  .use(requestLog)
  .use(authRoutes)
  .use(assetsRoutes)
  .use(merchantsRoutes)
  .use(outletsRoutes)
  .use(paymentSettingsRoutes)
  .use(registersRoutes)
  .use(staffRoutes)
  .use(syncRoutes)
  .get("/", () => "Sakti POS API v1");

export type App = typeof app;

export default app.compile();
```

(requestLog doesn't exist yet — create a stub `apps/api/src/lib/request-log.ts` exporting `new Elysia({ name: "request-log" })` for now; Task 3 implements it.)

**Step 4: Typecheck loop**

Run: `cd apps/api && bun run typecheck`
Expected: fix remaining codemod misses by hand (common: old `onX` hook names in guards, `status()` usage is unchanged in 2.x). Loop until clean.

**Step 5: Run tests — expect only error-shape failures**

Run: `cd apps/api && bun test`
Expected: most tests pass; failures are limited to assertions on error response bodies (`.error` key / plain strings → RFC 9457 `application/problem+json`). If anything OTHER than error-shape fails, stop and debug before continuing (use @superpowers:systematic-debugging).

**Step 6: Commit**

```bash
git add apps/api
git commit -m "refactor(api): migrate to Elysia 2 beta — codemod, adapter, cors

- elysia 2.0.0-beta.19 (pinned), @elysia/cors 2.0.0-beta.1
- CloudflareAdapter -> WebStandardAdapter (2.x has no CF adapter; Workers are web-standard)
- resolve -> derive, route signature swap via @elysia/codemod
- drop @bogeychan/elysia-logger (pino output never reached logs/api.log)"
```

---

### Task 3: `requestLog` hook (TDD)

**Files:**
- Create: `apps/api/src/lib/request-log.ts`
- Test: `apps/api/src/lib/__test__/request-log.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { requestLog } from "../request-log";

const lines: string[] = [];
const originalLog = console.log;

describe("requestLog", () => {
  it("emits one JSON line per request with method/path/status/ms", async () => {
    console.log = (line: string) => lines.push(line);
    try {
      const app = new Elysia().use(requestLog).get("/ping", () => "pong");
      const res = await app.handle(new Request("http://localhost/ping"));
      expect(res.status).toBe(200);
      expect(lines.length).toBe(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(parsed["lvl"]).toBe("info");
      expect(parsed["origin"]).toBe("API");
      expect(parsed["msg"]).toBe("request");
      expect(parsed["method"]).toBe("GET");
      expect(parsed["path"]).toBe("/ping");
      expect(parsed["status"]).toBe(200);
      expect(typeof parsed["ms"]).toBe("number");
    } finally {
      console.log = originalLog;
    }
  });

  it("does not log OPTIONS preflight", async () => {
    lines.length = 0;
    console.log = (line: string) => lines.push(line);
    try {
      const app = new Elysia().use(requestLog);
      await app.handle(new Request("http://localhost/any", { method: "OPTIONS" }));
      expect(lines.length).toBe(0);
    } finally {
      console.log = originalLog;
    }
  });

  it("logs errors at lvl=error with name+status, no message", async () => {
    lines.length = 0;
    console.log = (line: string) => lines.push(line);
    try {
      const app = new Elysia()
        .use(requestLog)
        .get("/boom", () => {
          throw new Error("secret-internal-detail");
        });
      const res = await app.handle(new Request("http://localhost/boom"));
      expect(res.status).toBe(500);
      const errLine = lines.find((l) => (JSON.parse(l) as Record<string, unknown>)["lvl"] === "error");
      expect(errLine).toBeDefined();
      const parsed = JSON.parse(errLine!) as Record<string, unknown>;
      expect(parsed["name"]).toBe("Error");
      expect(parsed["status"]).toBe(500);
      expect(JSON.stringify(parsed)).not.toContain("secret-internal-detail");
    } finally {
      console.log = originalLog;
    }
  });
});
```

**Step 2: Run to verify failure**

Run: `cd apps/api && bun test src/lib/__test__/request-log.test.ts`
Expected: FAIL (requestLog is an empty stub / no output captured).

**Step 3: Implement**

```ts
import { Elysia } from "elysia";

/**
 * Single-line JSON request logging. console.log is the only output path
 * workerd forwards to the dev process, which `apps/api/scripts/dev` tees
 * into logs/api.log for agent reference (pino's stream never arrived there).
 */
export const requestLog = new Elysia({ name: "request-log" })
  .request(({ request, store }) => {
    (store as Record<string, unknown>).startTime = performance.now();
    void request;
  })
  .afterResponse(({ request, set, store }) => {
    if (request.method === "OPTIONS") return;
    const s = store as Record<string, unknown>;
    const ms = Math.round(performance.now() - ((s.startTime as number) ?? 0));
    console.log(
      JSON.stringify({
        lvl: "info",
        origin: "API",
        msg: "request",
        method: request.method,
        path: new URL(request.url).pathname,
        status: set.status ?? 200,
        ms,
      }),
    );
  })
  .error(({ error, request, set }) => {
    if (request.method === "OPTIONS") return;
    console.log(
      JSON.stringify({
        lvl: "error",
        origin: "API",
        msg: "request",
        method: request.method,
        path: new URL(request.url).pathname,
        name: error instanceof Error ? error.name : "UnknownError",
        status: set.status ?? 500,
      }),
    );
  });
```

Note: verify against beta.19 typings — if `.request()`/`.afterResponse()`/`.error()` context fields differ (e.g. `set.status` type), adjust to the compiler's guidance; the emitted JSON shape is the contract.

**Step 4: Run to verify pass**

Run: `cd apps/api && bun test src/lib/__test__/request-log.test.ts`
Expected: 3 passing.

**Step 5: Commit**

```bash
git add apps/api/src/lib/request-log.ts apps/api/src/lib/__test__/request-log.test.ts
git commit -m "feat(api): requestLog hook — single-line JSON request logs via console.log"
```

---

### Task 4: Error shapes → RFC 9457

**Files:**
- Modify: error-body assertions in `apps/api/src/**/__test__/*.test.ts` (7 files have `.error` assertions)
- Modify: `apps/pos-app/src/lib/auth/cloud.ts` (`throwIfError`)

**Step 1: Run the api suite and list failures**

Run: `cd apps/api && bun test 2>&1 | grep -B2 "error" | head -40`
Expected: failures where tests assert `body.error === "..."`.

**Step 2: Update assertions**

Elysia 2 returns `application/problem+json` bodies like `{ type, title, status, detail }` (thrown `status(401, {error:"Unauthorized"})` values may be nested — inspect an actual response body first):

```ts
const body = (await response.json()) as Record<string, unknown>;
console.log(JSON.stringify(body)); // run once to learn the exact shape
```

Then update each assertion to the actual field(s). Keep the intent (status codes + distinguishing messages), not the old wire format.

**Step 3: Update pos-app `throwIfError`**

Read `apps/pos-app/src/lib/auth/cloud.ts:87` — `throwIfError` inspects Eden's `{data, error}` result. With Eden 2 beta (still on 1.x until Task 5 — this task makes it forward-compatible) error payloads arrive as problem+json objects instead of `{error: string}`. Adjust extraction to read `error.value?.detail ?? error.value?.title ?? JSON.stringify(error.value)` so both shapes work.

**Step 4: Full suites**

Run: `cd apps/api && bun test` → all green.
Run: `cd apps/pos-app && bun test` → all green (Eden still 1.x client against not-yet-deployed server — type-level only changes are fine).

**Step 5: Commit**

```bash
git add apps/api apps/pos-app
git commit -m "fix(api,pos-app): handle RFC 9457 problem+json error bodies"
```

---

### Task 5: Eden 2 beta in pos-app

**Files:**
- Modify: `apps/pos-app/package.json`
- Possibly modify: `apps/pos-app/src/lib/api/eden.ts` (import shape), `apps/pos-app/src/types/api-backend-types.d.ts`

**Step 1: Bump**

```bash
cd apps/pos-app
bun add @elysia/eden@next
```

Pin exact: `2.0.0-beta.5`.

**Step 2: Typecheck**

Run: `cd apps/pos-app && bun run typecheck`
Expected: treaty import `import { treaty } from "@elysia/eden"` is unchanged in 2.x beta; if the compiler flags the `App` type flow (api-backend-types re-export), follow its guidance. The api workspace dep gives pos-app the Elysia 2 types transitively.

**Step 3: Tests**

Run: `cd apps/pos-app && bun test`
Expected: all pass.

**Step 4: Commit**

```bash
git add apps/pos-app
git commit -m "refactor(pos-app): @elysia/eden 2.0.0-beta.5"
```

---

### Task 6: Vite + AOT build

**Files:**
- Create: `apps/api/vite.config.ts`
- Modify: `apps/api/package.json` (devDeps + scripts)
- Modify: `apps/api/wrangler.toml` (`main`)
- Modify: `apps/api/scripts/dev` (vite dev instead of wrangler dev)
- Maybe modify: `apps/api/src/db/index.ts` (`Manifest.isCapturing()` guard)

**Step 1: Install devDeps**

```bash
cd apps/api
bun add -d vite @cloudflare/vite-plugin
```

**Step 2: Create vite.config.ts**

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { aot } from "elysia/plugin/aot/vite";

export default defineConfig({
  plugins: [cloudflare(), aot("src/index.ts")],
  server: {
    host: "0.0.0.0", // LAN reachability — pos-app talks to 192.168.1.2:3001
    port: 3001,
  },
});
```

**Step 3: Point wrangler deploy at the build output**

In `apps/api/wrangler.toml`, change `"main": "src/index.ts"` to the vite plugin's worker output (confirm exact path after first build — typically `"dist/_worker.js"` per @cloudflare/vite-plugin convention). The `dev` block becomes unused by vite (vite serves dev), keep vars (vite plugin reads them from wrangler.toml).

**Step 4: Update scripts/dev**

Replace the wrangler line (`npx wrangler dev > >(tee "$LOG_FILE") 2>&1 &`) with:

```bash
bunx vite dev > >(tee "$LOG_FILE") 2>&1 &
```

Everything else (turso, drizzle push, studio, cleanup trap) stays.

**Step 5: First build — watch for AOT dry-run issues**

Run: `cd apps/api && bunx vite build`
Expected: build succeeds. If it HANGS, a module-level client is keeping the event loop alive (blog warns about DB pools) — guard it:

```ts
import { Manifest } from "elysia";
// in db/index.ts, only create/connect the client at true runtime:
if (!Manifest.isCapturing()) { /* eager init */ }
```

`@libsql/client` is lazy-connect so this is expected to pass without the guard.

**Step 6: Dev server smoke test**

Run: `apps/api/scripts/dev` (terminal 1); then:

```bash
curl -sf http://127.0.0.1:3001/ # expect: Sakti POS API v1
curl -si -X OPTIONS http://127.0.0.1:3001/api/sync/v1/status | head -1 # expect CORS preflight 204
grep '"origin":"API"' logs/api.log | tail -1 # expect JSON request line from requestLog
```

Expected: all three pass; `logs/api.log` now contains structured JSON lines.

**Step 7: Update package.json scripts**

```json
"dev": "vite dev",
"build": "vite build",
"deploy": "bun run build && wrangler deploy",
"preview": "wrangler dev dist/_worker.js"
```

(Adjust `dist/_worker.js` to the real output path from Step 5.)

**Step 8: Commit**

```bash
git add apps/api
git commit -m "build(api): vite + Cloudflare plugin + Elysia AOT — build-time compilation

- vite dev replaces wrangler dev (tee into logs/api.log unchanged)
- AOT precompiles handlers/schemas; TypeBox compile cost leaves cold start
- wrangler main -> dist output for deploys"
```

---

### Task 7: Docs

**Files:**
- Modify: `openspec/APP-LOGGING-DOCS.md`

**Step 1:** Add an "API server logs" section documenting the new `logs/api.log` line format:

```
{"lvl":"info"|"error","origin":"API","msg":"request","method":…,"path":…,"status":…,"ms":…}
```

with the note that `[wrangler:info]` lines are gone and grep examples:
`grep '"origin":"API"' logs/api.log`, `grep '"lvl":"error"' logs/api.log`.

**Step 2: Commit**

```bash
git add openspec/APP-LOGGING-DOCS.md
git commit -m "docs: API request-log format in APP-LOGGING-DOCS"
```

---

### Task 8: Final verification

**Step 1:** Full test suites.

```bash
cd apps/api && bun test        # all green
cd apps/pos-app && bun test    # all green
bun x ultracite check          # lint clean (both apps)
```

**Step 2:** Cold-start comparison. Restart dev server; `time curl -sf http://127.0.0.1:3001/ -o /dev/null`. Record vs Task 1 baseline in the design doc.

**Step 3:** Device pass. With pos-app dev build (`bun app:dev`) pointed at the vite-dev API: login → open register → run a sync → confirm QRIS settings still arrive (payment_settings is synced). Watch `logs/api.log` for the JSON lines.

**Step 4:** Append measured numbers to `docs/plans/2026-09-28-elysia2-migration-design.md` (Verification section) and commit:

```bash
git add docs/plans
git commit -m "docs: Elysia 2 migration verification results"
```

---

## Rollback

Everything is reversible via git (single-purpose commits per task). If a beta blocker appears mid-migration, `git revert` the task commits; the 1.x state is the last commit before Task 2.

## Follow-ups (not in scope)

- Bump all `@next` pins to Elysia 2.0 stable when released (should be drop-in)
- Workers observability/logpush for production logs
- Revisit `syncServer.status()` passthrough (sync/routes.ts:110) once Elysia 2's `problem` helper is better understood
