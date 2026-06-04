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
