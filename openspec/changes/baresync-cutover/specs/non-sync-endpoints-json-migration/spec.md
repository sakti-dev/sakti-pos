## ADDED Requirements

### Requirement: Server routes use TypeBox validation
All non-sync API routes SHALL use Elysia's TypeBox (`t`) for request/response validation. Each endpoint SHALL define `body`, `params`, `query`, and `response` schemas using TypeBox. The `tsProtoPlugin` SHALL be removed.

#### Scenario: Auth register endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/auth/register` with `Content-Type: application/json`
- **THEN** Elysia validates the body against `t.Object({ email: t.String({ format: 'email' }), password: t.String({ minLength: 8 }), name: t.String({ minLength: 1, maxLength: 100 }) })`
- **AND** returns a JSON response matching the response schema
- **AND** validation errors return 422 with structured error message

#### Scenario: Auth login endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/auth/login`
- **THEN** the body is validated against `t.Object({ email: t.String({ format: 'email' }), password: t.String() })`
- **AND** returns `{ sessionToken: t.String(), user: t.Object({ id: t.String(), email: t.String(), name: t.String() }) }`

#### Scenario: Auth session endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/auth/session`
- **THEN** returns `{ hasUser: t.Boolean(), merchants: t.Array(...), user: t.Optional(...) }`

#### Scenario: Auth logout endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/auth/logout`
- **THEN** returns `{ success: t.Boolean() }`

#### Scenario: Merchant create endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/merchants/create`
- **THEN** the body is validated against `t.Object({ name: t.String({ minLength: 1, maxLength: 100 }) })`
- **AND** returns the created merchant

#### Scenario: Merchant list endpoint validates with TypeBox
- **WHEN** a client sends `POST /api/merchants/list`
- **THEN** returns `{ merchants: t.Array(...) }`

#### Scenario: Outlet endpoints validate with TypeBox
- **WHEN** any outlet endpoint is called (`create`, `list`, `update`)
- **THEN** request body is validated against the corresponding TypeBox schema
- **AND** response matches the response schema (nullable fields use `t.Nullable(...)` instead of `hasXxx` booleans)

#### Scenario: Staff endpoints validate with TypeBox
- **WHEN** any staff endpoint is called (`current`, `create`, `list`, `update-pin`, `delete`)
- **THEN** request body is validated against the corresponding TypeBox schema
- **AND** response matches the response schema (nullable fields use `t.Nullable(...)`)

#### Scenario: Register endpoints validate with TypeBox
- **WHEN** any register endpoint is called (`pair`, `create`, `list`, `delete`)
- **THEN** request body is validated against the corresponding TypeBox schema
- **AND** response matches the response schema (nullable fields use `t.Nullable(...)`)

#### Scenario: Asset endpoints validate with TypeBox
- **WHEN** any asset endpoint is called (`presign-upload`, `complete-upload`, `presign-download`)
- **THEN** request body is validated against the corresponding TypeBox schema
- **AND** response matches the response schema

### Requirement: TypeBox schemas are defined as single source of truth
Each domain module SHALL define its TypeBox schemas in a `*.model.ts` file (e.g., `auth.model.ts`). These schemas define both the runtime validation AND the TypeScript types via `typeof Schema.static`.

#### Scenario: Auth model defines all auth schemas
- **WHEN** `apps/api/src/auth/auth.model.ts` is created
- **THEN** it exports `AuthRegisterRequest`, `AuthLoginRequest`, `AuthResponse`, `AuthSessionResponse`, `LogoutResponse` as TypeBox schemas
- **AND** types are inferred via `typeof Schema.static`

#### Scenario: Each domain has a model file
- **WHEN** the codebase is complete
- **THEN** `auth.model.ts`, `merchants.model.ts`, `outlets.model.ts`, `staff.model.ts`, `registers.model.ts`, `assets.model.ts` exist
- **AND** each exports TypeBox schemas for all request/response types in that domain

### Requirement: App type is exported for Eden Treaty
The composed Elysia app type SHALL be exported from `apps/api` so the POS app can import it for Eden Treaty.

#### Scenario: App type is exported
- **WHEN** `apps/api/src/app.ts` defines the Elysia instance
- **THEN** `export type App = typeof app` is available
- **AND** the POS app can import it via `import type { App } from '@repo/api'`

#### Scenario: POS app can import server type
- **WHEN** the POS app imports `import type { App } from '@repo/api'`
- **THEN** TypeScript resolves the type at compile time (no runtime dependency)

### Requirement: POS app uses Eden Treaty for API calls
All POS app API clients SHALL use Eden Treaty (`@elysia/eden`) instead of manual `ky` + `protoFetch` calls. The `protoFetch` helper, `ProtoMessage`, and `ProtoApiError` SHALL be removed.

#### Scenario: Eden Treaty client is created
- **WHEN** the POS app initializes
- **THEN** an Eden Treaty client is created with `treaty<App>(API_URL)` configured with auth headers
- **AND** all API calls are fully typed (request body, response, path params)

#### Scenario: Auth API uses Eden Treaty
- **WHEN** `authApi.login({ email, password })` is called
- **THEN** it sends `POST /api/auth/login` with JSON body
- **AND** returns `{ sessionToken: string, user: { id, email, name } }` (fully typed)
- **AND** no protobuf encode/decode happens

#### Scenario: Merchants API uses Eden Treaty
- **WHEN** `merchantsApi.list()` is called
- **THEN** it sends `POST /api/merchants/list`
- **AND** returns `{ merchants: Merchant[] }` (fully typed)

#### Scenario: Staff API uses Eden Treaty
- **WHEN** `staffApi.list({ merchantId })` is called
- **THEN** it sends `POST /api/staff/list` with JSON body
- **AND** returns `{ staff: Staff[] }` (fully typed)

#### Scenario: Outlets API uses Eden Treaty
- **WHEN** `outletsApi.list({ merchantId })` is called
- **THEN** it sends `POST /api/outlets/list` with JSON body
- **AND** returns `{ outlets: Outlet[] }` (fully typed)

#### Scenario: Registers API uses Eden Treaty
- **WHEN** `registersApi.list({ outletId })` is called
- **THEN** it sends `POST /api/registers/list` with JSON body
- **AND** returns `{ registers: Register[] }` (fully typed)

#### Scenario: Assets API uses Eden Treaty
- **WHEN** `assetsApi.presignUpload(...)` is called
- **THEN** it sends `POST /api/assets/presign-upload` with JSON body
- **AND** returns the presign response (fully typed)

### Requirement: Response types use nullable instead of hasXxx
Response TypeBox schemas SHALL use `t.Nullable(...)` instead of `hasXxx` boolean wrapper fields. The `optionalString` helper SHALL be removed.

#### Scenario: Outlet response has nullable fields
- **WHEN** an outlet is returned from `GET /api/outlets/list`
- **THEN** `address` is `t.Nullable(t.String())` (not `t.String()` + `hasAddress: t.Boolean()`)
- **AND** `receiptName` is `t.Nullable(t.String())`
- **AND** `receiptAddress` is `t.Nullable(t.String())`

#### Scenario: Staff response has nullable fields
- **WHEN** a staff member is returned from `GET /api/staff/list`
- **THEN** `outletId` is `t.Nullable(t.String())`
- **AND** `pin` is NOT included in responses (security)

#### Scenario: Register response has nullable fields
- **WHEN** a register is returned from `GET /api/registers/list`
- **THEN** `pairingCode` is `t.Nullable(t.String())`
- **AND** `pairingExpiresAt` is `t.Nullable(t.String())`

### Requirement: Protobuf infrastructure is fully removed
The `packages/protobuf/` directory, `tsProtoPlugin`, `protoFetch`, and all protobuf dependencies SHALL be deleted.

#### Scenario: No protobuf imports remain
- **WHEN** `grep -r "@repo/protobuf" apps/` is run
- **THEN** no results are returned

#### Scenario: No protoFetch references remain
- **WHEN** `grep -r "protoFetch" apps/` is run
- **THEN** no results are returned

#### Scenario: No tsProtoPlugin references remain
- **WHEN** `grep -r "tsProtoPlugin" apps/` is run
- **THEN** no results are returned

#### Scenario: packages/protobuf is deleted
- **WHEN** the `packages/protobuf/` directory is checked
- **THEN** it does not exist

### Requirement: API tests use JSON encoding
All API route tests SHALL be updated to send JSON requests and expect JSON responses instead of protobuf.

#### Scenario: Auth route tests use JSON
- **WHEN** auth route tests run
- **THEN** they send `Content-Type: application/json` requests
- **AND** assert on JSON response bodies

#### Scenario: All route tests pass
- **WHEN** `bun test apps/api/src/` is run
- **THEN** all tests pass

## REMOVED Requirements

### Requirement: Endpoints use protobuf encoding (REMOVED)
The `application/x-protobuf` content type and `tsProtoPlugin` macro SHALL no longer be used for any endpoint.

## MODIFIED Requirements

### Requirement: Sync endpoints use JSON (MODIFIED)
The sync endpoints (`/api/sync/push`, `/api/sync/pull`, `/api/sync/status`) already use JSON via baresync factories. This is unchanged — they were converted in the `server-sync-factory` spec.
