## Why

The Google OAuth button on register and login pages opens `window.open()` to the backend's `/api/auth/google` endpoint, which redirects to Google's consent screen in the browser. After authentication, the backend callback creates a session token but only delivers it via `Set-Cookie` on a rendered HTML page. The Tauri webview never receives this token — it lives in the external browser's cookie jar, not the app's Keystore storage. The flow is a dead end on both desktop and Android.

## What Changes

- Replace `window.open()` with `open()` from `@tauri-apps/plugin-opener` to force authentication through the system browser (required — Google blocks auth from embedded webviews with `disallowed_useragent`).
- Modify the backend Google OAuth callback to generate a short-lived, single-use opaque exchange code (60s TTL) stored in Turso, then render a zero-dependency HTML bridge page that redirects to `sakti-pos-dev://auth?code=<exchange_code>`.
- Add a new `POST /api/auth/google/exchange` endpoint that swaps the short-lived code for the session token and user data via secure JSON response.
- Add a `tempOAuthCodes` table to the API schema (server-only, not synced) for storing exchange codes in Turso.
- Add `tauri-plugin-single-instance` to the Rust backend to prevent Windows/Linux from spawning a second app process when the deep-link protocol activates.
- Strip the `#[cfg(debug_assertions)]` guard from the deep-link handler in `startup.rs` and add URL routing so `sakti-pos-dev://auth` URLs emit a `google-oauth-callback` event to the frontend while existing snapshot URLs continue to work.
- Create a global `AuthProvider` component wrapping the app Router that listens for the `google-oauth-callback` Tauri event, exchanges the code via Eden, saves the token to Keystore, and runs the existing `continueAfterAuth()` flow.
- Add `@tauri-apps/plugin-deep-link` JS binding to the frontend package.

## Capabilities

### New Capabilities

- `google-oauth`: Cross-platform Google OAuth authentication using system browser + deep-link callback with one-time exchange code flow.

### Modified Capabilities

_(none — no existing spec requirements change. The auth spec's OAuth requirements are new behavior, not modifications to existing requirements.)_

## Impact

- **Backend** (`apps/api/src/auth/`): Modified callback route, new exchange endpoint, new DB table + migration in `packages/sync-contract/src/api-schema.ts`.
- **Rust** (`apps/pos-app/src-tauri/`): New plugin dependency (`tauri-plugin-single-instance`), modified `startup.rs` (debug guard removal + URL router), modified `lib.rs` (plugin registration).
- **Frontend** (`apps/pos-app/src/`): New `providers/AuthProvider.tsx`, modified `index.tsx` (Router wrapper), modified `use-cloud-auth-flow.ts` (`window.open` → `open()`), new dependency (`@tauri-apps/plugin-deep-link`).
- **Dependencies**: `tauri-plugin-single-instance` (Rust), `@tauri-apps/plugin-deep-link` (JS). No new npm production deps.
