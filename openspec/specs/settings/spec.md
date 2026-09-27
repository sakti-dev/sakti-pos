# Settings

## Purpose

Sakti POS settings provide a centralized hub for device and business configuration. The settings hub is an authenticated route tree (`/settings/*`) that presents navigation cards for Account, Outlet, Printer, and Products & Categories. Settings also expose application-level controls: theme selection (light/dark/system), database size display, and a dev-only database snapshot export. The settings system owns outlet timezone configuration, which directly affects business-date calculations throughout the app.

## Requirements

### R1: Settings Hub Navigation

The system SHALL render a settings home page at `/settings` with navigation cards for Account, Outlet, Printer, and Products & Categories.

**WHEN** an authenticated user navigates to `/settings`
**THEN** the system displays four clickable cards: "Akun", "Outlet", "Printer", and "Produk & Kategori", each with a description subtitle.

**WHEN** the user taps a navigation card
**THEN** the system navigates to the corresponding route: `/settings/account`, `/settings/outlet`, `/settings/printer`, or `/settings/products-categories`.

### R2: Settings Route Protection

The system SHALL require authentication for all `/settings/*` routes.

**WHEN** an unauthenticated user attempts to access `/settings` or any sub-route
**THEN** the system redirects to the login flow.

### R3: Theme Selection

The system SHALL provide a theme toggle on the settings home page with three options: "Terang" (light), "Sistem" (system), and "Gelap" (dark).

- The current theme is persisted to `localStorage` under `sakti-pos:theme`.
- Default theme is `"system"`.
- When "system" is selected, the app follows `prefers-color-scheme` and reacts to OS-level changes.

**WHEN** the user selects a theme option
**THEN** the system persists the selection to localStorage, applies the `dark` class to `document.documentElement` accordingly, and the active button is visually highlighted.

**WHEN** the theme is set to "system" and the OS color scheme changes
**THEN** the system automatically updates the `dark` class on `document.documentElement`.

### R4: Application Info Display

The system SHALL display the app version and local database size on the settings home page.

**WHEN** the settings page loads
**THEN** the system shows the current version string ("0.1.0") and queries the local database size via the `get_db_info` Tauri command, displaying a formatted size or "Memuat..." while loading.

### R5: Dev-Only Database Snapshot Export

The system SHALL expose a database snapshot export button only in development builds.

- The button is wrapped in `Show when={import.meta.env.DEV}`.
- The export calls the `export_db_snapshot` Tauri command.
- A toast reports the snapshot path on success or an error message on failure.
- The button is disabled while an export is in progress.

**WHEN** a developer taps "Ekspor Snapshot DB" in a dev build
**THEN** the system invokes `export_db_snapshot`, shows a success toast with the file path, and logs the export event.

**WHEN** the export fails
**THEN** the system shows an error toast and logs the failure.

### R6: Account Settings

The system SHALL display the current user's profile and PIN change option at `/settings/account`.

- The profile card shows the user's name (first letter avatar), role, and cloud email (for owner role).
- A "Ubah PIN" button opens a drawer with new PIN and confirm PIN inputs.
- PIN validation requires minimum 6 characters and matching confirmation.

**WHEN** the account settings page loads
**THEN** the system displays the current user's name, role, and (if owner) the cloud email.

**WHEN** the user taps "Ubah PIN"
**THEN** a drawer opens with two password inputs: "PIN Baru" and "Konfirmasi PIN".

**WHEN** the user submits a valid new PIN (≥6 chars, matching confirmation)
**THEN** the system calls `changeCurrentUserPin`, shows a success toast, and closes the drawer.

**WHEN** the new PIN and confirmation do not match
**THEN** the system shows "PIN tidak cocok" error text.

### R7: Outlet Settings — Timezone Configuration

The system SHALL allow the user to configure the outlet's business timezone at `/settings/outlet`.

- Available timezones: Asia/Jakarta, Asia/Makassar, Asia/Jayapura, Asia/Singapore, Asia/Bangkok, UTC.
- The current timezone is loaded from the outlet record in the local database.
- Changing the timezone persists to the local DB, updates the reactive outlet store, and marks the row as unsynced.

**WHEN** the outlet settings page loads
**THEN** the system displays the current outlet timezone in a Select component and a description explaining its use for "Hari Ini, Kemarin, nomor transaksi, dan waktu struk."

**WHEN** the user selects a new timezone and taps "Simpan Zona Waktu"
**THEN** the system calls `updateOutletTimezone` in the local DB, updates the `currentOutletTimezone` reactive signal, persists to localStorage, and shows a success toast.

**WHEN** the save fails
**THEN** the system shows an error toast and the timezone selector reverts to the previous value.

### R8: Printer Settings

The system SHALL provide a printer configuration page at `/settings/printer` that renders the `PrinterSettings` component.

**WHEN** the user navigates to `/settings/printer`
**THEN** the system displays the printer settings component (printer discovery, permission request, test print, receipt header configuration).

### R9: Products & Categories Management

The system SHALL provide CRUD pages for product categories and products at `/settings/products-categories`.

- The tabbed view shows category list and product list.
- Add/edit forms use drawer overlays.
- Navigation includes `/settings/products-categories/categories/add`, `/:id/edit`, `/settings/products-categories/products/add`, `/:id/edit`.

**WHEN** the user navigates to `/settings/products-categories`
**THEN** the system displays the Products & Categories page with category and product lists.

### R10: Device Disconnect

The system SHALL allow the user to disconnect the device from the cloud outlet via a confirmation drawer on the settings home page.

- The disconnect button is only visible when a cloud session exists (`cloudSession()?.user`).
- Disconnect calls `cloudLogout`, clears the outlet context from localStorage, and resets reactive signals.
- A confirmation drawer ("Lepaskan Perangkat") requires explicit confirmation.

**WHEN** the user taps "Lepaskan Perangkat" and confirms
**THEN** the system calls cloud logout, clears outlet context (outletId, timezone, merchantId, registerId), shows a success toast, and refetches the cloud session query.

**WHEN** the cloud session is not present
**THEN** the disconnect button is not rendered.

# Settings

### R11: Payment Methods Configuration

The Settings hub SHALL provide a functional "Metode Pembayaran" section backed by `payment_settings`: a Tunai row displayed always-on without a toggle, and QRIS Statis / QRIS Dinamis toggles that read and write the synced row. The mock data array (`lib/data/payment-methods.ts`) and the dead Simpan/Batal buttons SHALL be removed — changes persist immediately on toggle.

- A QRIS toggle SHALL NOT be enabled while `qrisStaticPayload` is null — tapping it SHALL open the QRIS walkthrough instead of flipping the toggle.
- With a payload present, toggles flip instantly and persist.
- A "Ganti QRIS" (replace) action SHALL be visible when a payload exists; it re-opens the walkthrough at the Scan step without altering existing flags until the new payload is confirmed.

#### Scenario: Toggle with payload saved
- **WHEN** the merchant taps QRIS Dinamis and a payload exists
- **THEN** the flag flips in `payment_settings` immediately and the change is enqueued for sync

#### Scenario: Toggle without payload
- **WHEN** the merchant taps QRIS Statis and no payload exists
- **THEN** the toggle SHALL remain off and the walkthrough SHALL open

### R12: QRIS First-Enable Walkthrough

Tapping a QRIS toggle with no saved payload SHALL launch a three-step full-screen walkthrough (reusing the onboarding `wizard-shell` step pattern), powerable for either QRIS mode's first enable:

- **Step 1 (Explain):** what QRIS Statis is, that one scan powers both modes, and that QRIS Dinamis embeds each sale's total automatically.
- **Step 2 (Scan):** camera or gallery capture via the native pick pipeline → jsqr decode → `validateStaticQRIS`. Failures (not a QR / invalid CRC / already dynamic) SHALL show plain-language Indonesian errors and remain on this step.
- **Step 3 (Confirm):** display the parsed Merchant Name, City, and Merchant ID from the payload. "Ya, Simpan" SHALL persist the payload and enable the originally-tapped mode. "Bukan, Ulangi" SHALL return to Step 2.

Cancelling at any step SHALL save nothing and leave toggles unchanged.

#### Scenario: Happy path — scan and confirm
- **WHEN** the merchant scans their valid static QRIS and taps Ya, Simpan
- **THEN** `qrisStaticPayload` is stored, the originally-tapped flag is enabled, and the walkthrough closes

#### Scenario: Scan a dynamic QRIS
- **WHEN** the decoded payload has tag 01 = `12`
- **THEN** Step 2 SHALL show an "already dynamic" explanation and keep the merchant on the scan step

#### Scenario: Cancel mid-walkthrough
- **WHEN** the merchant backs out at the Confirm step
- **THEN** no payload is stored and both flags remain unchanged
