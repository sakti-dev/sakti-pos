## ADDED Requirements

### Requirement: System browser authentication
The Google OAuth flow SHALL open the system browser (not an embedded webview) via `@tauri-apps/plugin-opener`'s `open()` function. The app SHALL NOT use `window.open()` or any in-app webview for Google authentication.

#### Scenario: User taps Google login button on Android
- **WHEN** user taps "Masuk dengan Google" on the login page
- **THEN** the system browser opens to the backend's `/api/auth/google` endpoint
- **AND** the Tauri webview remains in the background

#### Scenario: User clicks Google login button on desktop
- **WHEN** user clicks "Masuk dengan Google" on the login page
- **THEN** the default system browser opens to the backend's `/api/auth/google` endpoint
- **AND** the Tauri window remains open behind the browser

### Requirement: One-time exchange code
The backend SHALL generate a short-lived, single-use opaque exchange code when the Google OAuth callback completes. The code SHALL expire after 60 seconds. The code SHALL be stored in the `temp_oauth_codes` table in Turso. Each code SHALL be deleted after a successful exchange (single-use). The long-lived session token SHALL NOT appear in any URL or browser-accessible location.

#### Scenario: Successful Google authentication creates exchange code
- **WHEN** Google redirects back to `/api/auth/google/callback` with a valid authorization code
- **THEN** the backend validates the code via Arctic PKCE, finds or creates the user, creates a Narvik session
- **AND** stores a random opaque exchange code (16 bytes hex) in `temp_oauth_codes` with 60s TTL
- **AND** renders an HTML bridge page containing `sakti-pos-dev://auth?code=<exchange_code>`

#### Scenario: Exchange code expires
- **WHEN** 60 seconds pass after the exchange code was created
- **THEN** a `POST /api/auth/google/exchange` with that code SHALL return 401

#### Scenario: Exchange code is single-use
- **WHEN** a `POST /api/auth/google/exchange` succeeds for a given code
- **THEN** the code row is deleted from `temp_oauth_codes`
- **AND** a second request with the same code SHALL return 401

### Requirement: Exchange endpoint
The backend SHALL expose `POST /api/auth/google/exchange` that accepts `{ code: string }` and returns `{ sessionToken: string, user: { id, email, name } }`. The response SHALL be JSON. The endpoint SHALL be callable via the Eden typed client.

#### Scenario: Valid exchange code
- **WHEN** frontend sends `POST /api/auth/google/exchange` with a valid, unexpired code
- **THEN** the backend returns `{ sessionToken, user }` as JSON
- **AND** deletes the code from `temp_oauth_codes`

#### Scenario: Invalid or expired exchange code
- **WHEN** frontend sends `POST /api/auth/google/exchange` with an invalid or expired code
- **THEN** the backend returns 401 with `{ error: "Invalid or expired authorization code" }`

### Requirement: HTML bridge page
The backend callback SHALL render a zero-dependency HTML page (no external CSS/JS CDNs) that attempts to redirect the browser to the `sakti-pos-dev://auth?code=<exchange_code>` deep-link URL. The page SHALL include a fallback button for manual clicking. The page SHALL attempt `window.close()` after 5 seconds.

#### Scenario: Deep-link registered on device (mobile or installed desktop)
- **WHEN** the HTML bridge page loads and the `sakti-pos-dev` scheme is registered
- **THEN** `window.location.href` redirects to the app immediately
- **AND** the browser tab may close automatically

#### Scenario: Deep-link not registered (dev mode or portable binary)
- **WHEN** the HTML bridge page loads and the `sakti-pos-dev` scheme is not recognized by the OS
- **THEN** the automatic redirect fails silently
- **AND** the user sees a styled "Hubungkan ke Aplikasi Kasir" button to click manually

### Requirement: Deep-link URL routing in Rust
The Rust deep-link handler SHALL route incoming URLs based on path prefix. URLs matching `sakti-pos-dev://auth` SHALL emit a `google-oauth-callback` event to the main webview window and bring the window to focus. URLs matching `sakti-pos-dev://snapshot` SHALL continue to the existing snapshot handler. The handler SHALL be active in both debug and release builds (no `#[cfg(debug_assertions)]` guard).

#### Scenario: Auth deep-link received on running app (macOS/Android)
- **WHEN** the OS delivers a `sakti-pos-dev://auth?code=abc123` URL via `on_open_url`
- **THEN** the Rust handler emits `google-oauth-callback` with the full URL string to the main webview
- **AND** calls `set_focus()` on the main window

#### Scenario: Auth deep-link triggers new process (Windows/Linux without single-instance)
- **WHEN** the OS spawns a new app process with `sakti-pos-dev://auth?code=abc123` as a CLI argument
- **THEN** `tauri-plugin-single-instance` forwards the argument to the primary instance
- **AND** the primary instance emits the event as described above

### Requirement: Global deep-link listener in frontend
The frontend SHALL mount a global `AuthProvider` component that wraps the `Router` in `index.tsx`. This provider SHALL listen for the `google-oauth-callback` Tauri event at all times (not scoped to any specific page). When the event fires, the provider SHALL parse the exchange code from the URL, call `POST /api/auth/google/exchange` via Eden, save the session token via `AuthStorage.saveToken()`, and execute the existing `continueAfterAuth()` flow (fetch merchants → merchant picker or onboarding).

#### Scenario: User returns from Google OAuth on Android
- **WHEN** the Android deep-link delivers `google-oauth-callback` event with `sakti-pos-dev://auth?code=abc123`
- **THEN** the AuthProvider parses the code, calls the exchange endpoint via Eden
- **AND** saves the returned sessionToken to Keystore
- **AND** runs `continueAfterAuth()` which fetches merchants and routes accordingly

#### Scenario: User returns from Google OAuth on desktop
- **WHEN** the desktop deep-link (via single-instance) delivers `google-oauth-callback` event
- **THEN** the same exchange and auth flow executes as on mobile

#### Scenario: Listener survives page navigation
- **WHEN** the user navigates from the login page to another page while the browser is still open
- **THEN** the AuthProvider listener is still active (it wraps the Router, not a page)
- **AND** the callback is processed when the user returns to the app

### Requirement: Post-auth flow reuse
After a successful Google OAuth exchange, the frontend SHALL use the same `continueAfterAuth()` logic as email/password login. This means: fetch merchants via Eden → if no merchants, redirect to `/onboarding` → if merchants exist, show merchant picker → after merchant selection, show outlet picker → after outlet selection, navigate to dashboard.

#### Scenario: New user authenticates via Google
- **WHEN** Google OAuth completes for a user with no merchants
- **THEN** the app redirects to `/onboarding`

#### Scenario: Existing user authenticates via Google
- **WHEN** Google OAuth completes for a user who has merchants
- **THEN** the app shows the merchant picker, then outlet picker, then navigates to dashboard
