## 1. Backend — Schema & Migration

- [ ] 1.1 Add `tempOAuthCodes` table to `packages/sync-contract/src/api-schema.ts` (server-only: `id` text PK, `userId` text notNull, `payload` text notNull, `createdAt` integer, `expiresAt` integer)
- [ ] 1.2 Generate and apply server-side Turso migration for `temp_oauth_codes` table
- [ ] 1.3 Verify no sync contract regeneration needed (table is API-only, not in `sync.config.ts`)

## 2. Backend — Google OAuth Callback & Exchange

- [ ] 2.1 Modify `GET /api/auth/google/callback` in `apps/api/src/auth/routes.ts`: after creating Narvik session, generate opaque exchange code (16 bytes hex via `crypto.randomBytes`), insert into `temp_oauth_codes` with 60s TTL, render zero-dependency HTML bridge page with `sakti-pos-dev://auth?code=<code>` redirect and fallback button
- [ ] 2.2 Add `POST /api/auth/google/exchange` endpoint: accept `{ code: string }`, lookup in `temp_oauth_codes` where not expired, delete row (single-use), parse payload JSON, return `{ sessionToken, user }` as JSON; return 401 if not found or expired
- [ ] 2.3 Add lazy cleanup: in the exchange handler, also `DELETE FROM temp_oauth_codes WHERE expiresAt < now` before the lookup
- [ ] 2.4 Add Eden type for the new exchange route so the frontend can call it typed

## 3. Rust — Deep-Link Infrastructure

- [ ] 3.1 Add `tauri-plugin-single-instance` to `apps/pos-app/src-tauri/Cargo.toml` dependencies
- [ ] 3.2 Register `tauri_plugin_single_instance::init()` in `src-tauri/src/lib.rs` with argv forwarding to the URL router (check for `sakti-pos-dev://` prefix, emit `google-oauth-callback` to main window, call `set_focus`)
- [ ] 3.3 In `src-tauri/src/app/startup.rs`, strip `#[cfg(debug_assertions)]` from the `on_open_url` registration so it runs in release builds
- [ ] 3.4 Add URL routing in `on_open_url`: `sakti-pos-dev://auth` → emit `google-oauth-callback` to main webview + `set_focus`; `sakti-pos-dev://snapshot` → existing `handle_dev_snapshot_export_urls`; other URLs → log warning
- [ ] 3.5 Handle cold-start deep-links: check `deep_link().get_current()` in setup block and route through the same URL router (covers Android cold-start where URL arrives before JS listener)

## 4. Frontend — Dependencies & Opener Fix

- [ ] 4.1 Add `@tauri-apps/plugin-deep-link` to `apps/pos-app/package.json`
- [ ] 4.2 In `apps/pos-app/src/pages/auth/use-cloud-auth-flow.ts`, replace `window.open(getGoogleOAuthUrl(), "_blank", "noopener")` with `open({ url: getGoogleOAuthUrl() })` from `@tauri-apps/plugin-opener`
- [ ] 4.3 Verify the Google login button on both register and login pages calls the updated `handleGoogle` (it should via the existing `onGoogle` prop wiring)

## 5. Frontend — Global AuthProvider

- [ ] 5.1 Create `apps/pos-app/src/providers/AuthProvider.tsx`: mount `listen<string>("google-oauth-callback")` in `onMount`, parse exchange code from URL, call exchange endpoint via Eden, save token via `AuthStorage.saveToken()`, then run post-auth flow
- [ ] 5.2 Wire the post-auth flow: after saving token, call `getMerchants()` via Eden — if no merchants, navigate to `/onboarding`; if merchants exist, navigate to `/auth/login` with merchant picker state (or directly to picker if possible)
- [ ] 5.3 Handle cold-start URLs: in `onMount`, also call `getCurrent()` from `@tauri-apps/plugin-deep-link` to check if a URL arrived before the JS listener was ready
- [ ] 5.4 Wrap the `<Router>` in `apps/pos-app/src/index.tsx` with `<AuthProvider>` so the listener is always mounted
- [ ] 5.5 Add error handling: if exchange fails (expired code, network error), show toast error and do NOT navigate — user stays on current page

## 6. Verification

- [ ] 6.1 Run `bun x ultracite check` — fix all lint/format issues
- [ ] 6.2 Run `bun test` — ensure no test regressions
- [ ] 6.3 Verify the Eden exchange route is typed correctly by checking `src/lib/api/eden.ts` compiles without errors
- [ ] 6.4 Verify the Rust project compiles with `cargo check` in `src-tauri/`
- [ ] 6.5 Manual test plan: register page → tap Google → system browser opens → Google consent → callback → HTML bridge page → deep-link fires → exchange succeeds → token saved → merchant check → correct navigation
