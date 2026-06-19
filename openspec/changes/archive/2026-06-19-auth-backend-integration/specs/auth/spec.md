## MODIFIED Requirements

### Requirement: Onboarding Flow (R14)
The system SHALL guide new users through merchant creation, outlet creation, preferences, and owner PIN setup.

- Steps: `merchant` → `outlet` → `preferences` → `setup-pin`.
- If `merchantId` is in the query, the system skips to `outlet`, `preferences`, or `setup-pin` as appropriate.
- Merchant creation calls `POST /api/merchants/create` which also creates a `user_merchants` owner row.
- Outlet creation calls `POST /api/outlets/create` which also creates a register.
- Preferences step (tax toggle, tax percentage, initial cash, business type) collects user choices and stores them in local state. These are NOT persisted to the API until a future schema change.
- If an owner staff already exists for the merchant after outlet creation, the system skips PIN setup and navigates to `/login`.
- PIN setup requires two entries (confirm match), creates a staff row via `POST /api/staff/create` with role `owner`, claims the staff via `getCurrentCloudStaff`, runs sync, then logs in.

#### Scenario: New user completes full onboarding
- **WHEN** a user registers, has no merchants, and completes all 4 onboarding steps
- **THEN** the system creates a merchant, creates an outlet with register, stores preferences locally, prompts for PIN setup (two-entry confirmation), creates an owner staff row, claims it via cloud-to-staff mapping, syncs, and logs the user in.

#### Scenario: User with existing merchant skips to outlet
- **WHEN** a user arrives at `/onboarding?merchantId=<id>` with no outlet
- **THEN** the system skips to the outlet step (Step 2).

#### Scenario: User with existing merchant and outlet skips to preferences
- **WHEN** a user arrives at `/onboarding?merchantId=<id>&outletId=<id>`
- **THEN** the system skips to the preferences step (Step 3).

#### Scenario: Existing owner staff skips PIN setup
- **WHEN** outlet creation completes and an owner staff already exists for the merchant
- **THEN** the system navigates to `/login` without showing the PIN setup step.

#### Scenario: PIN mismatch during setup
- **WHEN** a user enters two PINs that do not match
- **THEN** the system shows "PIN tidak cocok" and resets the PIN entry.

#### Scenario: Preferences are stored locally
- **WHEN** a user completes Step 3 (preferences)
- **THEN** the tax toggle, tax percentage, initial cash, and business type are saved in local state and NOT sent to the API.
