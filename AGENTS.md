# Agent Instructions

Detailed project instructions live in `.agents/instructions/`. This file is the compact root summary.

## Code Standards

- Use Ultracite/Biome for formatting and linting:
  - `bun x ultracite check`
  - `bun x ultracite fix`
  - `bun x ultracite doctor`
- Write accessible, performant, type-safe, maintainable code. Prefer clear, explicit logic over clever shortcuts.
- TypeScript: prefer `unknown` over `any`, type narrowing over assertions, `const` by default, top-level regex literals, specific imports, and `for...of` over `.forEach()`.
- Async: use `async`/`await`, handle errors intentionally, and do not use async Promise executors.
- UI: use semantic HTML, stable keys, correct hook usage, and Solid conventions (`class`, `for`).
- Keep functions focused, extract complex conditions, prefer early returns, and avoid unrelated refactors.

## Logging And Debugging

- Do not leave raw `console.log`, `debugger`, or `alert` in production code.
- Do not delete operational logs just to satisfy web-style production habits. Sakti POS is an offline-first Android hardware app; `info`, `warn`, and `error` logs are support evidence.
- TypeScript logs must use `apps/pos-app/src/lib/logger.ts`.
- Rust logs should use the `log` crate routed through `tauri-plugin-log`; use the project Rust helper/macro when available.
- Use stable `[ORIGIN] [DOMAIN:ACTION]` prefixes and include matching `adb logcat` commands when adding investigation logs.
- Before suggesting log filters or investigation commands, read `docs/knowledge/APP-LOGGING-DOCS.md` so the prefixes match the documented app logs for the issue being investigated.
- Prefer PID-scoped logcat for app debugging. The useful boundary is the app process, not Android tags; JS logs often appear under a blank tag and Rust logs may appear under module tags, so grep the structured message prefix.
- For Android log investigations, use `logs/capture-adb-logcat.sh` by default. It clears `adb logcat` first and writes the filtered capture to `logs/app.log`.
- When a fix or feature implementation is finished, it is MANDATORY to update `LOG_FILTER` in `logs/capture-adb-logcat.sh` for that exact path before handing the change to the user for testing.
- The goal is always to make the next user log capture useful for the code that was just changed, so the user can send back `logs/app.log` and the next agent can continue from real evidence.
- Treat `LOG_EXCLUDE` as baseline noise unless the user explicitly asks to extend it.
- Use two standard patterns:
  - Normal app investigation: `PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image'`
  - Crash or native investigation: add `AndroidRuntime|libc|fatal|exception|crash` to the same PID-scoped command.
- When implementing a feature or fix that adds a new log prefix, update `docs/knowledge/APP-LOGGING-DOCS.md` in the same change so future investigations can find it.
- Current prefix taxonomy: `docs/knowledge/APP-LOGGING-DOCS.md`.
- Throw descriptive `Error` objects, do not catch only to rethrow, and prefer early returns over nested error handling.

## ADR Rules

- Architecture decisions live in `docs/adr/` as a flat chronological list. Do not create domain folders for ADRs.
- When instructed to write an ADR, check `docs/adr/` for the next available number and create `000N-short-kebab-title.md`.
- Every ADR must include Markdown frontmatter with `id`, `title`, `date`, `status`, and `domains`.
- Use the standard sections: `Context`, `Decision`, and `Consequences`.
- Use `status: accepted` for active decisions unless the user says otherwise. Do not delete old ADRs; mark them `deprecated` or `superseded`.
- Keep operational references such as log prefix inventories in `docs/knowledge/`, and link them from ADRs when relevant.

## Sync Schema And Protobuf

- Before adding or updating Drizzle schema fields that may sync between API and POS app, read `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`.
- Do not hand-edit sync protobuf runtime artifacts for durable changes. Update the Drizzle schema, sync manifest, or generator writers, then run `bun run generate:sync-proto:write`.
- Money fields must use explicit `MinorUnits` Drizzle property names and `_minor_units` SQLite columns. Do not keep aliases for hidden-unit names once the schema is cut over.
- Runtime generated sync artifacts are `packages/protobuf/proto/sync.proto`, `apps/api/src/sync/protobuf.generated.ts`, `apps/api/src/sync/push-adapters.generated.ts`, and `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`.
- `bun run generate:sync-proto:compare` writes disposable inspection output to `.logs/sync-proto-compare/`; do not commit compare artifacts or add generated fixture directories.
- For synced column/table changes, run `bun run sync-proto:check` and the focused API/Rust sync tests listed in `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`.

## Cloudflare Workers

- For Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, Workers AI, or Agents SDK work, fetch current Cloudflare docs first. Local knowledge may be stale.
- Use product-specific docs and `/platform/limits/` pages for limits and quotas.
- Common commands:
  - `npx wrangler dev`
  - `npx wrangler deploy`
  - `npx wrangler types`
- Run `wrangler types` after changing bindings in `wrangler.jsonc`.
- For CPU/memory errors such as 1102, verify current limits from Cloudflare docs.

## Verification Definition Of Done

When completing a feature, bug fix, or refactor, include a concise Verification Guide with:

- Manual UI steps: exact screens and actions to exercise the change.
- Log checks: exact `adb logcat` or `grep` commands for relevant `[DOMAIN:ACTION]` prefixes from `docs/DOCUMENTED-LOG-PREFIX.md`.
- State/database checks: SQLite, Turso, or MCP commands when state changes.
- Automated tests: specific scoped `bun test`, `cargo test`, or other commands for touched behavior.
- Edge cases: one or two realistic production failure modes and how to simulate them locally.

Useful command examples:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image'
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC|DB|UI|PRINTER|AUTH|POS|SETTINGS):|AndroidRuntime|libc|fatal|exception|crash|pending_asset_preview|enqueue_asset_processing|product_image_link|resolve_cached_image'
adb logcat -c && adb logcat -v color "*:E"
bun test apps/api/src/registers/__test__/routes.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

## Review Focus

Biome/Ultracite handle formatting. Human review should focus on business correctness, naming, architecture, edge cases, UX/accessibility/performance, and useful documentation.
