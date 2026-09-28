# Elysia 2 Migration + AOT Build — Design

Date: 2026-09-28
Status: Approved
Motivation: `apps/api` deploys to Cloudflare Workers soon. Elysia 2's rewrite
(~33% lower memory, lowest post-loadtest memory of major frameworks) plus the
AOT build plugin (compiles handlers/schemas at build time — Workers ban
`new Function`, so without AOT all compilation is paid at cold start) gives us
the cheapest possible worker from day one.

## Context

- `apps/api` uses `elysia ^1.3` with `CloudflareAdapter`, `@elysiajs/cors`
  ^1.4.2, `@bogeychan/elysia-logger` ^0.1.10 (autoLogging only — `ctx.log` and
  other exports are never used by our code).
- `apps/pos-app` consumes the API via `@elysia/eden` ^1.4.10 treaty client.
- `packages/sync-contract` has no Elysia imports — migration is contained to
  `apps/api` + pos-app's Eden client.
- No `onError` handlers, no error-code dictionaries, no macros, no WebSocket,
  no `{as:'scoped'}` in our code — the risky Elysia 2 breaking changes don't
  touch us.
- Ecosystem (verified 2026-09-28): `elysia@next` 2.0.0-beta.19;
  `@elysia/cors@next` 2.0.0-beta.1 (new scope — `@elysiajs/cors` stays 1.x,
  which is why it looked unmaintained); `@elysia/eden@next` 2.0.0-beta.5
  (peer `elysia >= 2.0.0-beta.2`). `@bogeychan/elysia-logger` has no 2.x and
  we replace it.

## Approach

Codemod-first, then hand-fix: `bunx @elysia/codemod@latest` on `apps/api`
(route-signature swap + `resolve`→`derive`), careful diff review, then manual
work for adapter, plugins, error shapes, build pipeline.

## Dependency Changes

| Now | After |
|---|---|
| `elysia ^1.3` | `elysia@next` 2.0.0-beta.19 (pinned exact) |
| `@elysiajs/cors ^1.4.2` | `@elysia/cors@next` 2.0.0-beta.1 (pinned exact) |
| `@bogeychan/elysia-logger ^0.1.10` | removed — custom `requestLog` hook |
| `@elysia/eden ^1.4.10` (pos-app) | `@elysia/eden@next` 2.0.0-beta.5 (pinned exact) |
| — | devDeps: `vite`, `@cloudflare/vite-plugin` |

## App Changes

- **app.ts**: re-verify `CloudflareAdapter` against Adapter v2 (import
  path/init may differ in beta.19); keep exported instance + `app.compile()`
  (AOT needs the exported instance).
- **authenticated.ts**: `resolve` → `derive` (codemod).
- **Route modules** (~9): signature swap
  `.post(path, handler, {schema})` → `.post(path, {schema}, handler)`
  (codemod ~95%; review every module).
- **Error responses → RFC 9457**: Elysia errors return
  `application/problem+json`. Update api test assertions on error shapes;
  review pos-app `throwIfError` + Eden error handling
  (`lib/api/eden.ts`, `lib/auth/cloud.ts`).
- **Custom `requestLog` hook** replacing elysia-logger:
  - `request` hook: store start time
  - `afterResponse`: one single-line JSON via `console.log` —
    `{"lvl":"info","origin":"API","msg":"request","method":…,"path":…,"status":…,"ms":…}`
    — skipping OPTIONS like today
  - `error` hook: `"lvl":"error"` with `name` + `status`, no raw message
    leak (matches Elysia 2 production-error posture); `instanceof NotFound`
    distinction instead of removed `code === "NOT_FOUND"`
  - Rationale: pino output never actually reached `logs/api.log` (workerd
    doesn't forward its stream); `console.log` does, so this strictly
    improves the agent-reference log.

## Build / Dev Workflow

- New `apps/api/vite.config.ts`: `cloudflare()` + `aot('src/index.ts')`.
- `apps/api/scripts/dev`: same shape (turso dev → drizzle-kit push →
  drizzle studio), swap `npx wrangler dev` for `vite dev`, keep
  `tee logs/api.log`. Wrangler's `:info` request lines go away; replaced by
  richer JSON from `requestLog`. Dev server stays reachable on the LAN
  address pos-app uses.
- `wrangler.toml` `main` repointed at the vite build output for deploys.
- AOT dry-run caveat: module-level DB clients (Turso `@libsql/client`) must
  not open connections during build-time capture; guard with
  `Manifest.isCapturing()` if the dry-run hangs.

## Verification

- 66 api tests green (error-shape assertions updated for problem+json)
- pos-app suite (131 vitest) green with Eden beta
- Manual device pass: login + full sync flow against vite-dev API
- Cold-start comparison: `time curl` first request after dev restart,
  before vs after
- All beta deps pinned exact; bump to 2.0 stable as a follow-up when it
  ships
