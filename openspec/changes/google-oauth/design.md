## Context

The auth-backend-integration change wired register, login, onboarding, and PIN flows to real API calls. The Google OAuth button exists but is non-functional: `window.open()` opens the backend's Google endpoint in a new tab, the backend creates a session but only delivers it via `Set-Cookie`, and the Tauri webview never receives the token.

The target deployment is Cloudflare Workers (stateless — no in-process state survives between requests), backed by Turso/libsql for persistent storage. The app runs on both Android (via Tauri mobile) and desktop (Windows, macOS, Linux).

Existing infrastructure:
- **Deep-link**: `tauri-plugin-deep-link 2.0` registered in Rust, scheme `sakti-pos-dev` in `tauri.conf.json`, but the `on_open_url` handler is gated behind `#[cfg(debug_assertions)]` and only routes snapshot URLs.
- **Backend**: Elysia with Arctic for Google OAuth PKCE flow. Callback at `GET /api/auth/google/callback` renders an HTML success page. Narvik sessions stored in `userSessions` table in Turso.
- **Frontend**: Eden typed API client with Bearer auth from `AuthStorage` (Tauri Keystore). `useCloudAuthFlow()` hook handles post-auth flow (merchant picker → outlet picker → navigate). `@tauri-apps/plugin-opener` already installed.

## Goals / Non-Goals

**Goals:**
- Make Google OAuth work end-to-end on both Android and desktop
- Never expose long-lived session tokens in URLs, browser history, or device logs
- Use a single deep-link scheme and code path for both platforms
- Reuse the existing `continueAfterAuth()` post-auth flow (no separate Google auth pipeline)
- Keep the HTML bridge page dependency-free (works on slow Indonesian warung connections)

**Non-Goals:**
- Adding other OAuth providers (GitHub, Apple, etc.)
- Modifying the email/password login flow
- Changing the existing deep-link snapshot handler
- Registering a production scheme (e.g., `sakti-pos` vs `sakti-pos-dev`) — that's a separate release/build config concern
- UI/visual changes to the Google login button

## Decisions

### D1. One-time exchange code (not token in URL)

**Decision:** The backend generates a short-lived opaque code, stores it in Turso, and puts only the code in the deep-link URL. The frontend exchanges it for the real session token via a JSON API call.

**Alternatives considered:**
- Token directly in URL: Simpler but leaks long-lived credentials into browser history, Android intent logs, and Windows jump lists. Rejected for a financial POS app.
- In-memory Map on the server: Simpler but fails on Cloudflare Workers (stateless, no shared memory between requests). Rejected.

**Rationale:** Adds one API round-trip but keeps credentials out of URLs. Turso storage is already available and the table is trivial (4 columns, single DELETE on read).

### D2. Unified deep-link for both platforms (no desktop loopback server)

**Decision:** Both Android and desktop use the same `sakti-pos-dev://auth?code=<exchange_code>` deep-link URL. Desktop relies on `tauri-plugin-deep-link` for protocol registration at install time, with the HTML bridge page as fallback for dev mode.

**Alternatives considered:**
- Local HTTP loopback server on desktop: Standard OAuth pattern but requires running an HTTP listener in Tauri (no built-in support), port conflicts, and separate code path per platform. Rejected.
- postMessage from popup: Blocked by `noopener` and popup blockers. Rejected.

**Rationale:** Single code path is simpler. The HTML bridge page handles the case where the protocol isn't registered (dev mode, portable binaries). The `[Hubungkan ke Aplikasi Kasir]` button is the manual fallback.

### D3. `tauri-plugin-single-instance` for Windows/Linux

**Decision:** Add `tauri-plugin-single-instance` to prevent the OS from spawning a second app process when the deep-link protocol activates. The plugin forwards CLI arguments to the primary instance via IPC.

**Rationale:** On Windows and Linux, clicking a `sakti-pos-dev://` link while the app is running spawns a new process. Without single-instance, the user sees a blank second window. The plugin's `init` closure receives the forwarded argv and routes it to the same URL handler as `on_open_url`.

### D4. `temp_oauth_codes` as server-only table in api-schema.ts

**Decision:** Add the table to `packages/sync-contract/src/api-schema.ts` alongside `userSessions`. It is server-only — no sync contract, no local counterpart, no client TABLE registry entry, no `bun run generate:sync` needed.

**Rationale:** Per Baresync's schema reference, server-only tables go in `api-schema.ts` with no contract. The table only exists on the API's Turso instance. The Tauri client never reads or writes it.

### D5. Global AuthProvider wrapping Router

**Decision:** Create `src/providers/AuthProvider.tsx` that wraps the `<Router>` in `index.tsx`. The deep-link listener lives here, not in any page component.

**Rationale:** Page-level listeners get destroyed on navigation. If the user navigates away from the auth page while the browser is still open (common on mobile), the callback is lost. The provider is always mounted.

### D6. Surgical Rust changes (not file replacement)

**Decision:** Modify the existing `startup.rs` `on_open_url` handler to add URL routing (auth vs snapshot). Remove the `#[cfg(debug_assertions)]` guard. Add `tauri-plugin-single-instance` registration in `lib.rs`. Do not replace or rewrite the existing startup/db initialization logic.

**Rationale:** The existing `startup.rs` has ~90 lines of DB pool initialization, error logging, and snapshot handling. Replacing it risks breaking existing infrastructure. The change is additive: add routing logic to the existing handler.

## Risks / Trade-offs

**[Desktop protocol not registered in dev mode]** → The HTML bridge page's fallback button handles this. Developers can copy the deep-link URL and test manually. Acceptable trade-off for simplified architecture.

**[Exchange code cleanup]** → Expired codes accumulate if the exchange endpoint is never called (user closes browser). Mitigation: lazy cleanup — each exchange call also deletes expired codes. Optionally add a periodic sweep in the session cleanup job.

**[Single-instance plugin adds a dependency]** → `tauri-plugin-single-instance` is an official Tauri plugin, maintained in the plugins-workspace. Low risk. However, it means the app can only run once per machine (intentional for a POS terminal).

**[Deep-link event timing]** → On Android, the deep-link event may fire before the AuthProvider is mounted if the app was cold-started. Mitigation: the deep-link plugin's `get_current()` API can be checked in `onMount` to handle URLs that arrived before the JS listener was ready.

## Open Questions

- Should the `sakti-pos-dev` scheme change to `sakti-pos` for production builds, or is `sakti-pos-dev` the permanent scheme? (Affects `tauri.conf.json`, backend HTML bridge page, and Rust URL matching.)
