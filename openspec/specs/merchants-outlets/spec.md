# Merchants & Outlets

## Purpose

The merchants-outlets domain defines the organizational hierarchy for Sakti POS: a **merchant** represents a business entity, an **outlet** represents a physical store location within that business, and a **register** represents a POS device paired to an outlet. This hierarchy enables multi-store operations, per-outlet configuration (timezone, receipt headers), and device pairing for offline-first POS terminals.

## Data Model

### Tables

- **merchants**: `id`, `name`, `createdAt`, `updatedAt`
- **user_merchants**: `id`, `userId`, `merchantId`, `role` (owner|manager), `joinedAt`
- **outlets**: `id`, `merchantId`, `name`, `address`, `timezone`, `isActive`, `receiptName`, `receiptAddress`, `createdAt`, `updatedAt`
- **registers**: `id`, `outletId`, `name`, `shortId`, `pairingCode`, `pairingExpiresAt`, `isActive`, `lastSeenAt`, `createdAt`, `updatedAt`

### Hierarchy

```
Merchant (1) ──→ (N) Outlet (1) ──→ (N) Register
    │
    └──→ (N) UserMerchant (user membership)
```

## Requirements

### R1: Merchant Creation

The system SHALL allow authenticated users to create merchants.

**WHEN** an authenticated user submits `POST /api/merchants/create` with a valid name (1-100 chars)
**THEN** the system SHALL create the merchant record and add the user as an owner in `user_merchants`
**AND** return the created merchant with `id`, `name`, `createdAt`, `updatedAt`

**WHEN** an unauthenticated user attempts to create a merchant
**THEN** the system SHALL return 401 Unauthorized

### R2: Merchant Listing

The system SHALL list merchants accessible to the authenticated user.

**WHEN** an authenticated user calls `POST /api/merchants/list`
**THEN** the system SHALL return all merchants where the user has a membership in `user_merchants`
**AND** each entry SHALL include `merchantId`, `name`, and `role`

### R3: Outlet Creation

The system SHALL allow creation of outlets scoped to a merchant.

**WHEN** an authenticated user with merchant access submits `POST /api/outlets/create` with `merchantId` and `name` (1-100 chars)
**THEN** the system SHALL verify the user has membership in the merchant's `user_merchants`
**AND** create the outlet with `timezone` defaulting to `Asia/Jakarta` if not provided
**AND** set `receiptName` to the merchant's name and `receiptAddress` to the provided address
**AND** automatically create a default register named "Register 1" with a random `shortId`
**AND** return the outlet and register with `hasRegister: true`

**WHEN** an unauthenticated user attempts to create an outlet
**THEN** the system SHALL return 401 Unauthorized

**WHEN** an authenticated user attempts to create an outlet for a merchant they don't have access to
**THEN** the system SHALL return 403 Forbidden

### R4: Outlet Listing

The system SHALL list outlets for a given merchant.

**WHEN** an authenticated user with merchant access calls `POST /api/outlets/list` with `merchantId`
**THEN** the system SHALL verify merchant access
**AND** return all outlets belonging to that merchant
**AND** each outlet SHALL include `id`, `merchantId`, `name`, `address`, `timezone`, `isActive`, `receiptName`, `receiptAddress`

### R5: Outlet Update

The system SHALL allow updating outlet properties.

**WHEN** an authenticated user with outlet ownership submits `POST /api/outlets/update` with an outlet `id`
**THEN** the system SHALL verify the user has access to the outlet's merchant
**AND** update only the provided fields (partial update semantics)
**AND** return the updated outlet

**WHEN** the outlet does not exist
**THEN** the system SHALL return 404 "Outlet not found"

### R6: Outlet Timezone Configuration

The system SHALL support per-outlet timezone configuration.

**WHEN** an outlet is created with a timezone
**THEN** the outlet SHALL store the timezone (default: `Asia/Jakarta`)

**WHEN** a user updates the outlet timezone via `updateOutletTimezone` on the POS app
**THEN** the system SHALL update the timezone in the local SQLite database
**AND** enqueue a sync change for server replication
**AND** update the reactive store and localStorage for the current session

**WHEN** the outlet timezone is set
**THEN** all date/time formatting in receipts, dashboard, and order history SHALL use this timezone via `formatInBusinessTimezone`

**WHEN** no timezone is configured
**THEN** the system SHALL default to `Asia/Jakarta`

### R7: Receipt Header Customization

The system SHALL support per-outlet receipt header customization.

**WHEN** an outlet has `receiptName` set
**THEN** the receipt SHALL display `receiptName` as the business name

**WHEN** an outlet has `receiptName` not set (null)
**THEN** the receipt SHALL fall back to the merchant's `name`

**WHEN** an outlet has `receiptAddress` set
**THEN** the receipt SHALL display `receiptAddress`

**WHEN** an outlet has `receiptAddress` not set (null)
**THEN** the receipt SHALL fall back to the outlet's `address`

**WHEN** `getOutletReceiptDefaults` is called
**THEN** the system SHALL return `effectiveName`, `effectiveAddress`, `merchantName`, `outletName`, and `outletAddress`

**WHEN** a user saves receipt header via `saveOutletReceiptHeader`
**THEN** the system SHALL update `receiptName` and `receiptAddress` on the outlet
**AND** enqueue a sync change

### R8: Register Creation

The system SHALL allow creation of registers scoped to an outlet.

**WHEN** an authenticated user with outlet ownership calls `POST /api/registers/create` with `outletId` and `name` (1-100 chars)
**THEN** the system SHALL verify outlet ownership via the user's merchant membership
**AND** create the register with a random `shortId` and a generated `pairingCode`
**AND** set `pairingExpiresAt` to 24 hours from creation
**AND** return the created register

### R9: Register Listing

The system SHALL list registers for a given outlet.

**WHEN** an authenticated user with outlet ownership calls `POST /api/registers/list` with `outletId`
**THEN** the system SHALL return all registers belonging to that outlet

### R10: Register Soft-Delete

The system SHALL support soft-deleting registers.

**WHEN** an authenticated user with outlet ownership calls `POST /api/registers/delete` with a register `id`
**THEN** the system SHALL verify outlet ownership
**AND** set the register's `isActive` to `false`
**AND** return `{ success: true }`

**WHEN** the register does not exist
**THEN** the system SHALL return 404 "Register not found"

### R11: Register Pairing (Device Pairing)

The system SHALL support pairing POS devices to registers via pairing codes.

**WHEN** a device submits `POST /api/registers/pair` with a valid `pairingCode`
**THEN** the system SHALL look up the register by `pairingCode`
**AND** verify the pairing code has not expired (`pairingExpiresAt` > now)
**AND** clear the `pairingCode` and `pairingExpiresAt` (one-time use)
**AND** update `lastSeenAt` to now
**AND** return the outlet and register

**WHEN** the pairing code is invalid (not found)
**THEN** the system SHALL return 400 "Invalid pairing code"

**WHEN** the pairing code has expired
**THEN** the system SHALL return 400 "Pairing code expired"

**WHEN** the pairing code was already used (cleared)
**THEN** the system SHALL return 400 "Pairing code expired"

### R12: Outlet Context Store (POS App)

The system SHALL maintain outlet context on the POS device.

**WHEN** `setOutletContext` is called with `outletId`, `merchantId`, optional `registerId`, and optional `timezone`
**THEN** the system SHALL store all values in reactive signals and localStorage
**AND** the keys SHALL be `sakti-pos:current-outlet-id`, `sakti-pos:current-merchant-id`, `sakti-pos:current-register-id`, `sakti-pos:current-outlet-timezone`

**WHEN** `loadOutletContext` is called
**THEN** the system SHALL restore values from localStorage into reactive signals

**WHEN** `clearOutletContext` is called
**THEN** the system SHALL clear all signals and remove all keys from localStorage
**AND** reset timezone to `Asia/Jakarta`

**WHEN** `isDevicePaired` is called
**THEN** the system SHALL return `true` if `currentOutletId` is not null, `false` otherwise

### R13: Cloud Auth Flow (Merchant & Outlet Selection)

The system SHALL support merchant and outlet selection during cloud authentication.

**WHEN** a user authenticates via cloud login or registration
**THEN** the system SHALL fetch the user's merchants via `getMerchants()`
**AND** if merchants exist, show the merchant picker

**WHEN** a merchant is selected
**THEN** the system SHALL fetch outlets for that merchant via `getOutlets(merchantId)`
**AND** if outlets exist, show the outlet picker

**WHEN** an outlet is selected
**THEN** the system SHALL call `setOutletContext` with the outlet's `id`, `merchantId`, and `timezone`
**AND** run sync via `syncNow()`
**AND** resolve the current cloud staff for the merchant

**WHEN** the user has no merchants
**THEN** the system SHALL navigate to onboarding (`/onboarding`)

**WHEN** the selected merchant has no outlets
**THEN** the system SHALL navigate to onboarding with `merchantId` query param

### R14: Onboarding Flow (Merchant & Outlet Creation)

The system SHALL support creating a merchant and first outlet during onboarding.

**WHEN** a user enters a merchant name and submits
**THEN** the system SHALL call `createMerchant(name)`
**AND** advance to the outlet creation step

**WHEN** a user enters an outlet name (and optional address) and submits
**THEN** the system SHALL call `createOutlet(merchantId, name, address)`
**AND** call `setOutletContext` with the created outlet
**AND** check for existing owner staff; if none, advance to PIN setup

**WHEN** PIN setup completes
**THEN** the system SHALL create owner staff via `createStaffApi`, sync, and log in

### R15: Outlet Selector (POS UI)

The system SHALL display an outlet selector when multiple outlets exist.

**WHEN** the POS app loads with more than one outlet in the list
**THEN** the system SHALL render the `OutletSelector` component
**AND** display the current outlet name
**AND** allow switching to another outlet

**WHEN** only one outlet exists
**THEN** the system SHALL not render the selector

### R16: Sync Scope

The system SHALL sync outlet and register data between API and POS app.

**WHEN** the POS app syncs
**THEN** the system SHALL pull merchants, outlets, and registers tables from the server
**AND** the local schema SHALL mirror the API schema (with `localSyncColumns` for baresync)

**WHEN** the POS app updates an outlet (timezone, receipt header)
**THEN** the system SHALL enqueue the change in the sync outbox
**AND** the change SHALL be replicated to the server on next sync

**WHEN** a new register is created on the API
**THEN** it SHALL sync to the POS app for the corresponding outlet

### R17: Access Control

The system SHALL enforce merchant-scoped access control.

**WHEN** any outlet or register operation requires merchant access
**THEN** the system SHALL verify the authenticated user has a row in `user_merchants` for the target merchant

**WHEN** the user does not have a membership row
**THEN** the system SHALL return 403 Forbidden

## Out of Scope

- Merchant deletion (not implemented)
- Outlet hard-delete (soft-delete via `isActive` only)
- Register reassignment between outlets
- Merchant transfer between users
- Bulk outlet/register operations
- Outlet-specific pricing (handled by `outlet_products` in products domain)
