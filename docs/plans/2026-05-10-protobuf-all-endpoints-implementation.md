# Protobuf All Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert every POS app-to-API endpoint from JSON/TypeBox validation to protobuf request/response contracts and remove TypeBox usage from API route modules.

**Architecture:** Keep Elysia as the HTTP router, keep the existing `tsProtoPlugin`, and move validation to explicit route/service helpers plus generated `ts-proto` message types. Use protobuf for all API calls made by the POS app; keep browser OAuth redirect endpoints as normal HTTP redirects because they are not protobuf-capable clients, but remove their TypeBox query schemas and validate query values manually.

**Tech Stack:** Bun, Elysia, ts-proto, protobufjs, Ky, Solid/Tauri POS app, Narvik auth/session, Drizzle ORM, Bun test, Vitest, Ultracite.

---

## Scope

### Convert To Protobuf

These app-to-API endpoints must use `Content-Type: application/x-protobuf` and `Accept: application/x-protobuf`:

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/session
POST /api/merchants/list
POST /api/merchants/create
POST /api/outlets/list
POST /api/outlets/create
POST /api/outlets/update
POST /api/staff/current
POST /api/staff/create
POST /api/staff/list
POST /api/staff/update-pin
POST /api/staff/delete
POST /api/registers/pair
POST /api/registers/create
POST /api/registers/list
POST /api/registers/delete
POST /api/sync/push
POST /api/sync/status
POST /api/sync/pull-events
POST /api/sync/pull
```

### Keep As Standard HTTP

These are browser/system OAuth endpoints, not POS protobuf API calls:

```txt
GET /api/auth/google
GET /api/auth/google/callback
GET /
```

They must not use TypeBox. Validate query values manually.

### Endpoint Compatibility Policy

This migration is allowed to replace JSON endpoint shapes for the POS app. If external clients exist, add temporary JSON compatibility routes in a separate future task. Do not keep TypeBox just for backwards compatibility.

---

## Current Route Inventory

### Already Protobuf

```txt
apps/api/src/sync/routes.ts
apps/pos-app/src/lib/api/sync.ts
apps/pos-app/src/lib/api/client.ts
packages/protobuf/proto/sync.proto
```

### Still TypeBox / JSON

```txt
apps/api/src/auth/routes.ts
apps/api/src/merchants/routes.ts
apps/api/src/outlets/routes.ts
apps/api/src/registers/public-routes.ts
apps/api/src/registers/protected-routes.ts
apps/api/src/staff/routes.ts
apps/pos-app/src/lib/auth/cloud.ts
apps/pos-app/src/lib/auth/provider.ts
```

### TypeBox Removal Target

After this plan, this command should return no route schema usage:

```bash
rg "Elysia, t|\\bt\\." apps/api/src
```

Expected: no matches in API route modules.

---

## Proto Design

Use domain-specific protobuf files plus a shared `common.proto`:

```txt
packages/protobuf/proto/common.proto
packages/protobuf/proto/auth.proto
packages/protobuf/proto/merchants.proto
packages/protobuf/proto/outlets.proto
packages/protobuf/proto/registers.proto
packages/protobuf/proto/staff.proto
packages/protobuf/proto/sync.proto

packages/protobuf/src/proto/common.ts
packages/protobuf/src/proto/auth.ts
packages/protobuf/src/proto/merchants.ts
packages/protobuf/src/proto/outlets.ts
packages/protobuf/src/proto/registers.ts
packages/protobuf/src/proto/staff.ts
packages/protobuf/src/proto/sync.ts
```

This matches the existing `sync.proto` boundary and prevents a single `cloud.proto` dumping ground.

Domain proto benefits:

- Smaller files with clear route ownership.
- Cleaner imports: `@repo/protobuf/auth`, `@repo/protobuf/staff`, etc.
- Lower merge-conflict risk as schema grows.
- Easier future versioning by domain.
- Better alignment with API module boundaries.

### Required `common.proto`

```proto
syntax = "proto3";

package sakti.common.v1;

message Empty {}

message ApiUser {
  string id = 1;
  string email = 2;
  string name = 3;
}

message Merchant {
  string id = 1;
  string name = 2;
  string created_at = 3;
  string updated_at = 4;
}

message Outlet {
  string id = 1;
  string merchant_id = 2;
  string name = 3;
  string address = 4;
  bool has_address = 5;
  bool is_active = 6;
  string created_at = 7;
  string updated_at = 8;
}

message Register {
  string id = 1;
  string outlet_id = 2;
  string name = 3;
  string short_id = 4;
  string pairing_code = 5;
  bool has_pairing_code = 6;
  string pairing_expires_at = 7;
  bool has_pairing_expires_at = 8;
  bool is_active = 9;
  string created_at = 10;
  string updated_at = 11;
}

message Staff {
  string id = 1;
  string merchant_id = 2;
  string outlet_id = 3;
  bool has_outlet_id = 4;
  string name = 5;
  string role = 6;
  bool is_active = 7;
  bool has_pin = 8;
  string created_at = 9;
  string updated_at = 10;
}
```

### Required `auth.proto`

```proto
syntax = "proto3";

package sakti.auth.v1;

import "common.proto";

message AuthRegisterRequest {
  string email = 1;
  string password = 2;
  string name = 3;
}

message AuthLoginRequest {
  string email = 1;
  string password = 2;
}

message AuthResponse {
  string session_token = 1;
  sakti.common.v1.ApiUser user = 2;
}

message SessionMerchant {
  string merchant_id = 1;
  string name = 2;
  string role = 3;
}

message AuthSessionResponse {
  sakti.common.v1.ApiUser user = 1;
  bool has_user = 2;
  repeated SessionMerchant merchants = 3;
}

message LogoutResponse {
  bool success = 1;
}
```

### Required `merchants.proto`

```proto
syntax = "proto3";

package sakti.merchants.v1;

import "auth.proto";
import "common.proto";

message MerchantListResponse {
  repeated sakti.auth.v1.SessionMerchant merchants = 1;
}

message MerchantCreateRequest {
  string name = 1;
}

message MerchantCreateResponse {
  sakti.common.v1.Merchant merchant = 1;
}
```

### Required `outlets.proto`

```proto
syntax = "proto3";

package sakti.outlets.v1;

import "common.proto";

message OutletListRequest {
  string merchant_id = 1;
}

message OutletListResponse {
  repeated sakti.common.v1.Outlet outlets = 1;
}

message OutletCreateRequest {
  string merchant_id = 1;
  string name = 2;
  string address = 3;
  bool has_address = 4;
}

message OutletCreateResponse {
  sakti.common.v1.Outlet outlet = 1;
  sakti.common.v1.Register register = 2;
  bool has_register = 3;
}

message OutletUpdateRequest {
  string id = 1;
  string name = 2;
  bool has_name = 3;
  string address = 4;
  bool has_address = 5;
  bool is_active = 6;
  bool has_is_active = 7;
}

message OutletUpdateResponse {
  sakti.common.v1.Outlet outlet = 1;
}
```

### Required `staff.proto`

```proto
syntax = "proto3";

package sakti.staff.v1;

import "common.proto";

message StaffCurrentRequest {
  string merchant_id = 1;
}

message StaffCreateRequest {
  string merchant_id = 1;
  string outlet_id = 2;
  bool has_outlet_id = 3;
  string name = 4;
  string pin = 5;
  string role = 6;
}

message StaffListRequest {
  string merchant_id = 1;
}

message StaffListResponse {
  repeated sakti.common.v1.Staff staff = 1;
}

message StaffUpdatePinRequest {
  string id = 1;
  string pin = 2;
}

message StaffDeleteRequest {
  string id = 1;
}

message StaffCurrentResponse {
  bool claimed = 1;
  string reason = 2;
  sakti.common.v1.Staff staff = 3;
  bool has_staff = 4;
}

message StaffCreateResponse {
  sakti.common.v1.Staff staff = 1;
}

message StaffUpdatePinResponse {
  sakti.common.v1.Staff staff = 1;
}
```

### Required `registers.proto`

```proto
syntax = "proto3";

package sakti.registers.v1;

import "common.proto";

message RegisterPairRequest {
  string pairing_code = 1;
}

message RegisterPairResponse {
  sakti.common.v1.Register register = 1;
  sakti.common.v1.Outlet outlet = 2;
  bool has_outlet = 3;
}

message RegisterCreateRequest {
  string outlet_id = 1;
  string name = 2;
}

message RegisterListRequest {
  string outlet_id = 1;
}

message RegisterListResponse {
  repeated sakti.common.v1.Register registers = 1;
}

message RegisterDeleteRequest {
  string id = 1;
}

message RegisterCreateResponse {
  sakti.common.v1.Register register = 1;
}
```

### Shared Response Helpers

Use local response messages in each domain where practical. For simple success deletes, reuse `common.DeleteResponse`:

```proto
// Add to common.proto
message DeleteResponse {
  bool success = 1;
}
```

Presence flags are intentional. `proto3` scalar defaults make `""`, `false`, and absence ambiguous; explicit `has_*` fields preserve existing JSON semantics for nullable/optional fields.

---

## Validation Strategy Without TypeBox

Add small explicit validators in API code:

```txt
apps/api/src/lib/validation.ts
```

Required helper API:

```ts
export class BadRequestError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }

  toResponse() {
    return Response.json({ error: this.message }, { status: 400 });
  }
}

export function requireNonEmptyString(
  value: string,
  field: string,
  options: { maxLength?: number; minLength?: number } = {}
): string {
  const minLength = options.minLength ?? 1;
  if (value.length < minLength) {
    throw new BadRequestError(`${field} is required`);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new BadRequestError(`${field} is too long`);
  }
  return value;
}

export function requireEmail(value: string): string {
  requireNonEmptyString(value, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new BadRequestError("email is invalid");
  }
  return value;
}

export function requirePin(value: string): string {
  if (!/^\d{4,6}$/.test(value)) {
    throw new BadRequestError("pin must be 4 to 6 digits");
  }
  return value;
}

export function requirePairingCode(value: string): string {
  if (!/^[A-Z0-9]{8}$/.test(value)) {
    throw new BadRequestError("pairingCode must be 8 uppercase letters or digits");
  }
  return value;
}
```

Do not build a generic schema library. Keep validators small and local to the current app constraints.

---

## Task 1: Expand Protobuf Package With Domain Contracts

**Files:**
- Modify: `packages/protobuf/package.json`
- Create: `packages/protobuf/proto/common.proto`
- Create: `packages/protobuf/proto/auth.proto`
- Create: `packages/protobuf/proto/merchants.proto`
- Create: `packages/protobuf/proto/outlets.proto`
- Create: `packages/protobuf/proto/registers.proto`
- Create: `packages/protobuf/proto/staff.proto`
- Generate: `packages/protobuf/src/proto/common.ts`
- Generate: `packages/protobuf/src/proto/auth.ts`
- Generate: `packages/protobuf/src/proto/merchants.ts`
- Generate: `packages/protobuf/src/proto/outlets.ts`
- Generate: `packages/protobuf/src/proto/registers.ts`
- Generate: `packages/protobuf/src/proto/staff.ts`
- Test: domain generated exports

**Step 1: Write the failing import test**

Create `apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ApiUser } from "@repo/protobuf/common";
import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import { MerchantCreateRequest } from "@repo/protobuf/merchants";
import {
  OutletCreateRequest,
  OutletCreateResponse,
} from "@repo/protobuf/outlets";

describe("domain protobuf messages", () => {
  test("round trips shared, auth, merchant, and outlet messages", () => {
    const user = ApiUser.decode(
      ApiUser.encode({ email: "owner@example.com", id: "user-1", name: "Owner" }).finish()
    );

    const login = AuthLoginRequest.decode(
      AuthLoginRequest.encode({ email: "owner@example.com", password: "secret" }).finish()
    );

    const auth = AuthResponse.decode(
      AuthResponse.encode({
        sessionToken: "token-1",
        user: { email: "owner@example.com", id: "user-1", name: "Owner" },
      }).finish()
    );

    const merchant = MerchantCreateRequest.decode(
      MerchantCreateRequest.encode({ name: "Warung" }).finish()
    );

    const outletResponse = OutletCreateResponse.decode(
      OutletCreateResponse.encode({
        hasRegister: false,
        outlet: {
          address: "",
          createdAt: "2026-05-10T00:00:00.000Z",
          hasAddress: false,
          id: "outlet-1",
          isActive: true,
          merchantId: "merchant-1",
          name: "Main",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      }).finish()
    );

    const createOutlet = OutletCreateRequest.decode(
      OutletCreateRequest.encode({ hasAddress: false, merchantId: "merchant-1", name: "Main" }).finish()
    );

    expect(user.id).toBe("user-1");
    expect(login.email).toBe("owner@example.com");
    expect(auth.user?.id).toBe("user-1");
    expect(merchant.name).toBe("Warung");
    expect(createOutlet.merchantId).toBe("merchant-1");
    expect(outletResponse.outlet?.id).toBe("outlet-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts
```

Expected: FAIL because the domain protobuf exports do not exist.

**Step 3: Add domain proto files**

Create the following files using the schemas from the Proto Design section:

```txt
packages/protobuf/proto/common.proto
packages/protobuf/proto/auth.proto
packages/protobuf/proto/merchants.proto
packages/protobuf/proto/outlets.proto
packages/protobuf/proto/registers.proto
packages/protobuf/proto/staff.proto
```

**Step 4: Update protobuf package scripts and exports**

Modify `packages/protobuf/package.json`:

```json
{
  "exports": {
    "./common": "./src/proto/common.ts",
    "./auth": "./src/proto/auth.ts",
    "./merchants": "./src/proto/merchants.ts",
    "./outlets": "./src/proto/outlets.ts",
    "./registers": "./src/proto/registers.ts",
    "./staff": "./src/proto/staff.ts",
    "./sync": "./src/proto/sync.ts"
  },
  "scripts": {
    "generate": "grpc_tools_node_protoc --proto_path=proto --plugin=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=src --ts_proto_opt=esModuleInterop=true,forceLong=number,outputServices=false,useExactTypes=false proto/common.proto proto/auth.proto proto/merchants.proto proto/outlets.proto proto/registers.proto proto/staff.proto proto/sync.proto"
  }
}
```

**Step 5: Generate TypeScript**

Run:

```bash
bun --cwd packages/protobuf run generate
```

Expected: creates generated TypeScript files under `packages/protobuf/src/proto`.

**Step 6: Run test to verify it passes**

Run:

```bash
bun test apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/protobuf apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts
git commit -m "feat: add domain protobuf contracts"
```

---

## Task 2: Add Protobuf Domain Client Modules

**Files:**
- Modify: `apps/pos-app/src/lib/api/client.ts`
- Create: `apps/pos-app/src/lib/api/auth.ts`
- Create: `apps/pos-app/src/lib/api/merchants.ts`
- Create: `apps/pos-app/src/lib/api/outlets.ts`
- Create: `apps/pos-app/src/lib/api/registers.ts`
- Create: `apps/pos-app/src/lib/api/staff.ts`
- Create: `apps/pos-app/src/lib/api/cloud.ts` as a temporary compatibility facade
- Test: `apps/pos-app/src/lib/api/__test__/cloud.test.ts`

**Step 1: Write failing client tests**

Create `apps/pos-app/src/lib/api/__test__/cloud.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import { MerchantCreateRequest, MerchantCreateResponse } from "@repo/protobuf/merchants";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

vi.mock("~/lib/auth/storage", () => ({
  AuthStorage: {
    getToken: vi.fn().mockResolvedValue("token-1"),
  },
}));

const { authApi } = await import("../auth");
const { merchantsApi } = await import("../merchants");

describe("domain protobuf API clients", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  test("login sends protobuf and decodes protobuf response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        AuthResponse.encode({
          sessionToken: "session-1",
          user: { email: "owner@example.com", id: "user-1", name: "Owner" },
        }).finish(),
        { headers: { "Content-Type": "application/x-protobuf" }, status: 200 }
      )
    );

    const result = await authApi.login({
      email: "owner@example.com",
      password: "secret",
    });

    const request = fetchMock.mock.calls[0][0] as Request;
    const encoded = new Uint8Array(await request.arrayBuffer());
    const decoded = AuthLoginRequest.decode(encoded);

    expect(request.headers.get("Content-Type")).toBe("application/x-protobuf");
    expect(decoded.email).toBe("owner@example.com");
    expect(result.sessionToken).toBe("session-1");
  });

  test("createMerchant uses protobuf endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        MerchantCreateResponse.encode({
          merchant: {
            createdAt: "2026-05-10T00:00:00.000Z",
            id: "merchant-1",
            name: "Warung",
            updatedAt: "2026-05-10T00:00:00.000Z",
          },
        }).finish(),
        { headers: { "Content-Type": "application/x-protobuf" }, status: 200 }
      )
    );

    await merchantsApi.create({ name: "Warung" });

    const request = fetchMock.mock.calls[0][0] as Request;
    const decoded = MerchantCreateRequest.decode(
      new Uint8Array(await request.arrayBuffer())
    );

    expect(request.url).toContain("/api/merchants/create");
    expect(decoded.name).toBe("Warung");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test apps/pos-app/src/lib/api/__test__/cloud.test.ts
```

Expected: FAIL because `../auth` and `../merchants` do not exist.

**Step 3: Implement domain client modules**

Create `apps/pos-app/src/lib/api/auth.ts`:

```ts
import { Empty } from "@repo/protobuf/common";
import {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthResponse,
  AuthSessionResponse,
  LogoutResponse,
} from "@repo/protobuf/auth";
import { protoFetch } from "./client";

export const authApi = {
  register: (payload: AuthRegisterRequest) =>
    protoFetch("api/auth/register", { req: AuthRegisterRequest, res: AuthResponse }, payload),
  login: (payload: AuthLoginRequest) =>
    protoFetch("api/auth/login", { req: AuthLoginRequest, res: AuthResponse }, payload),
  logout: () =>
    protoFetch("api/auth/logout", { req: Empty, res: LogoutResponse }, {}),
  session: () =>
    protoFetch("api/auth/session", { req: Empty, res: AuthSessionResponse }, {}),
};
```

Create `apps/pos-app/src/lib/api/merchants.ts`:

```ts
import { Empty } from "@repo/protobuf/common";
import {
  MerchantCreateRequest,
  MerchantCreateResponse,
  MerchantListResponse,
} from "@repo/protobuf/merchants";
import { protoFetch } from "./client";

export const merchantsApi = {
  list: () =>
    protoFetch("api/merchants/list", { req: Empty, res: MerchantListResponse }, {}),
  create: (payload: MerchantCreateRequest) =>
    protoFetch("api/merchants/create", { req: MerchantCreateRequest, res: MerchantCreateResponse }, payload),
};
```

Create equivalent focused clients:

```txt
apps/pos-app/src/lib/api/outlets.ts exports outletsApi
apps/pos-app/src/lib/api/registers.ts exports registersApi
apps/pos-app/src/lib/api/staff.ts exports staffApi
```

Each module imports only its matching `@repo/protobuf/<domain>` messages plus `@repo/protobuf/common` helpers.

Use these method names consistently:

```txt
authApi.register/login/logout/session
merchantsApi.list/create
outletsApi.list/create/update
staffApi.current/create/list/updatePin/delete
registersApi.pair/create/list/delete
```

Create `apps/pos-app/src/lib/api/cloud.ts` only as a compatibility facade while `apps/pos-app/src/lib/auth/cloud.ts` is migrated:

```ts
import { authApi } from "./auth";
import { merchantsApi } from "./merchants";
import { outletsApi } from "./outlets";
import { registersApi } from "./registers";
import { staffApi } from "./staff";

export const cloudApi = {
  auth: authApi,
  merchants: merchantsApi,
  outlets: outletsApi,
  registers: registersApi,
  staff: staffApi,
};
```

Implement the remaining domain modules with this shape:

```ts
import {
  OutletCreateRequest,
  OutletCreateResponse,
  OutletListRequest,
  OutletListResponse,
  OutletUpdateRequest,
  OutletUpdateResponse,
} from "@repo/protobuf/outlets";
import {
  RegisterCreateRequest,
  RegisterCreateResponse,
  RegisterDeleteRequest,
  RegisterListRequest,
  RegisterListResponse,
  RegisterPairRequest,
  RegisterPairResponse,
} from "@repo/protobuf/registers";
import {
  StaffCreateRequest,
  StaffCreateResponse,
  StaffCurrentRequest,
  StaffCurrentResponse,
  StaffDeleteRequest,
  StaffListRequest,
  StaffListResponse,
  StaffUpdatePinRequest,
  StaffUpdatePinResponse,
} from "@repo/protobuf/staff";
// Use protoFetch in each domain module with only that domain's endpoints.
```

**Step 4: Run test to verify it passes**

Run:

```bash
bun test apps/pos-app/src/lib/api/__test__/cloud.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/api
git commit -m "feat: add protobuf domain api clients"
```

---

## Task 3: Add API Protobuf Serialization Helpers

**Files:**
- Create: `apps/api/src/protobuf/domain.ts`
- Create: `apps/api/src/lib/validation.ts`
- Test: `apps/api/src/protobuf/__test__/domain.test.ts`
- Test: `apps/api/src/lib/__test__/validation.test.ts`

**Step 1: Write failing serialization tests**

Create `apps/api/src/protobuf/__test__/domain.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  encodeOutlet,
  encodeRegister,
  encodeStaff,
  optionalString,
} from "../protobuf";

describe("domain protobuf helpers", () => {
  test("encodes optional strings with presence flags", () => {
    expect(optionalString(null)).toEqual({ hasValue: false, value: "" });
    expect(optionalString("Main")).toEqual({ hasValue: true, value: "Main" });
  });

  test("encodes outlet nullable address", () => {
    const outlet = encodeOutlet({
      address: null,
      createdAt: "2026-05-10T00:00:00.000Z",
      id: "outlet-1",
      isActive: true,
      merchantId: "merchant-1",
      name: "Main",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    expect(outlet.address).toBe("");
    expect(outlet.hasAddress).toBe(false);
  });

  test("encodes register nullable pairing fields", () => {
    const register = encodeRegister({
      createdAt: "2026-05-10T00:00:00.000Z",
      id: "register-1",
      isActive: true,
      name: "Register 1",
      outletId: "outlet-1",
      pairingCode: null,
      pairingExpiresAt: null,
      shortId: "ABC123",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    expect(register.hasPairingCode).toBe(false);
    expect(register.hasPairingExpiresAt).toBe(false);
  });

  test("encodes staff nullable outlet and pin presence", () => {
    const staff = encodeStaff({
      createdAt: "2026-05-10T00:00:00.000Z",
      id: "staff-1",
      isActive: true,
      merchantId: "merchant-1",
      name: "Owner",
      outletId: null,
      pin: "hash",
      role: "owner",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    expect(staff.hasOutletId).toBe(false);
    expect(staff.hasPin).toBe(true);
  });
});
```

Create `apps/api/src/lib/__test__/validation.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  BadRequestError,
  requireEmail,
  requireNonEmptyString,
  requirePairingCode,
  requirePin,
} from "../validation";

describe("protobuf route validation", () => {
  test("rejects empty required strings", () => {
    expect(() => requireNonEmptyString("", "name")).toThrow(BadRequestError);
  });

  test("rejects invalid email", () => {
    expect(() => requireEmail("bad")).toThrow("email is invalid");
  });

  test("rejects invalid pin", () => {
    expect(() => requirePin("abc")).toThrow("pin must be 4 to 6 digits");
  });

  test("rejects invalid pairing code", () => {
    expect(() => requirePairingCode("abc")).toThrow(
      "pairingCode must be 8 uppercase letters or digits"
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/protobuf/__test__/domain.test.ts apps/api/src/lib/__test__/validation.test.ts
```

Expected: FAIL because helper modules do not exist.

**Step 3: Implement helpers**

Create `apps/api/src/lib/validation.ts` using the Validation Strategy section.

Create `apps/api/src/protobuf/domain.ts`:

```ts
import type { Outlet, Register, Staff } from "@repo/protobuf/common";

export function optionalString(value: string | null | undefined) {
  return {
    hasValue: value != null,
    value: value ?? "",
  };
}

export function encodeOutlet(row: {
  address: string | null;
  createdAt?: string;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  updatedAt?: string;
}): Outlet {
  const address = optionalString(row.address);
  return {
    address: address.value,
    createdAt: row.createdAt ?? "",
    hasAddress: address.hasValue,
    id: row.id,
    isActive: row.isActive,
    merchantId: row.merchantId,
    name: row.name,
    updatedAt: row.updatedAt ?? "",
  };
}

export function encodeRegister(row: {
  createdAt?: string;
  id: string;
  isActive: boolean;
  name: string;
  outletId: string;
  pairingCode: string | null;
  pairingExpiresAt: string | null;
  shortId: string;
  updatedAt?: string;
}): Register {
  const pairingCode = optionalString(row.pairingCode);
  const pairingExpiresAt = optionalString(row.pairingExpiresAt);
  return {
    createdAt: row.createdAt ?? "",
    hasPairingCode: pairingCode.hasValue,
    hasPairingExpiresAt: pairingExpiresAt.hasValue,
    id: row.id,
    isActive: row.isActive,
    name: row.name,
    outletId: row.outletId,
    pairingCode: pairingCode.value,
    pairingExpiresAt: pairingExpiresAt.value,
    shortId: row.shortId,
    updatedAt: row.updatedAt ?? "",
  };
}

export function encodeStaff(row: {
  createdAt?: string;
  id: string;
  isActive: boolean;
  merchantId: string;
  name: string;
  outletId: string | null;
  pin?: string | null;
  role: "cashier" | "manager" | "owner";
  updatedAt?: string;
}): Staff {
  const outletId = optionalString(row.outletId);
  return {
    createdAt: row.createdAt ?? "",
    hasOutletId: outletId.hasValue,
    hasPin: !!row.pin,
    id: row.id,
    isActive: row.isActive,
    merchantId: row.merchantId,
    name: row.name,
    outletId: outletId.value,
    role: row.role,
    updatedAt: row.updatedAt ?? "",
  };
}
```

**Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/protobuf/__test__/domain.test.ts apps/api/src/lib/__test__/validation.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/protobuf apps/api/src/lib/validation.ts apps/api/src/lib/__test__/validation.test.ts
git commit -m "feat: add protobuf domain serializers"
```

---

## Task 4: Convert Auth Routes To Protobuf

**Files:**
- Modify: `apps/api/src/auth/routes.ts`
- Modify: `apps/api/src/auth/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`
- Modify: `apps/pos-app/src/lib/auth/__test__/cloud.test.ts`

**Step 1: Write failing protobuf auth route tests**

In `apps/api/src/auth/__test__/routes.test.ts`, add protobuf request helpers and new tests for:

```txt
POST /api/auth/register returns AuthResponse protobuf and Set-Cookie
POST /api/auth/login returns AuthResponse protobuf and Set-Cookie
POST /api/auth/session returns AuthSessionResponse protobuf
POST /api/auth/logout returns LogoutResponse protobuf and blank cookie
```

Use generated messages:

```ts
import {
  AuthLoginRequest,
  AuthRegisterRequest,
  AuthResponse,
  AuthSessionResponse,
  LogoutResponse,
} from "@repo/protobuf/auth";
import { Empty } from "@repo/protobuf/common";
```

Example test:

```ts
test("POST /api/auth/login accepts protobuf and returns AuthResponse", async () => {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          {
            email: "owner@example.com",
            id: "user-1",
            name: "Owner",
            passwordHash: await hashPasswordForTest("password123"),
          },
        ]),
      }),
    }),
  });
  mockCreateSession.mockResolvedValue({ token: "session-token" });

  const response = await makeProtoRequest(
    "/api/auth/login",
    AuthLoginRequest.encode({
      email: "owner@example.com",
      password: "password123",
    }).finish()
  );

  const decoded = AuthResponse.decode(new Uint8Array(await response.arrayBuffer()));
  expect(response.status).toBe(200);
  expect(decoded.sessionToken).toBe("session-token");
  expect(decoded.user?.id).toBe("user-1");
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/auth/__test__/routes.test.ts
```

Expected: New protobuf tests fail because routes still use JSON/TypeBox.

**Step 3: Convert auth routes**

Modify `apps/api/src/auth/routes.ts`:

- Change `import { Elysia, t } from "elysia";` to `import { Elysia } from "elysia";`
- Add `.use(tsProtoPlugin)` to `authRoutes`.
- Convert JSON body routes to protobuf macro:

```ts
.post(
  "/login",
  async ({ body, set }) => {
    const request = body as AuthLoginRequest;
    requireEmail(request.email);
    requireNonEmptyString(request.password, "password");
    // existing login logic
    return {
      sessionToken: token,
      user: { id: user.id, email: user.email, name: user.name },
    };
  },
  {
    proto: {
      req: AuthLoginRequest,
      res: AuthResponse,
    },
  }
)
```

- Change `/session` from `GET` to `POST` with `{ req: Empty, res: AuthSessionResponse }`.
- Change `/logout` to protobuf `{ req: Empty, res: LogoutResponse }`.
- Keep `/google` and `/google/callback` as `GET`, but remove TypeBox query schema from callback and manually read `new URL(request.url).searchParams`.

**Step 4: Update POS auth cloud wrapper**

Modify `apps/pos-app/src/lib/auth/cloud.ts`:

- Replace JSON `api.post(...).json()` calls with domain clients from `~/lib/api/auth`.
- Preserve existing exported functions and return types so UI components do not change.
- Keep `getGoogleOAuthUrl()` returning the browser URL.
- Keep `ApiError` behavior by wrapping `protoFetch` errors through `withError`.

Example:

```ts
export async function login(
  email: string,
  password: string
): Promise<{ user: ApiUser }> {
  await logRequest("POST", "api/auth/login");
  const result = await withError(
    authApi.login({ email, password }),
    "POST",
    "api/auth/login"
  );
  await AuthStorage.saveToken(result.sessionToken);
  return { user: result.user as ApiUser };
}
```

**Step 5: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/auth/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/auth apps/pos-app/src/lib/auth
git commit -m "feat: migrate auth endpoints to protobuf"
```

---

## Task 5: Convert Merchant And Outlet Routes To Protobuf

**Files:**
- Modify: `apps/api/src/merchants/routes.ts`
- Modify: `apps/api/src/outlets/routes.ts`
- Modify: `apps/api/src/merchants/__test__/routes.test.ts`
- Modify: `apps/api/src/outlets/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`

**Step 1: Write failing protobuf route tests**

Add tests proving:

```txt
POST /api/merchants/list returns MerchantListResponse
POST /api/merchants/create accepts MerchantCreateRequest and returns MerchantCreateResponse
POST /api/outlets/list accepts OutletListRequest and returns OutletListResponse
POST /api/outlets/create accepts OutletCreateRequest and returns OutletCreateResponse
POST /api/outlets/update accepts OutletUpdateRequest and returns OutletUpdateResponse
```

Use `makeProtoRequest` helpers like sync route tests.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts apps/api/src/outlets/__test__/routes.test.ts
```

Expected: New protobuf tests fail.

**Step 3: Convert merchant routes**

Modify `apps/api/src/merchants/routes.ts`:

- Remove `t` import.
- Add `.use(tsProtoPlugin)` before `.use(authenticated)`.
- Replace:

```txt
POST /api/merchants
GET /api/merchants
```

with:

```txt
POST /api/merchants/create
POST /api/merchants/list
```

Both use `proto`.

**Step 4: Convert outlet routes**

Modify `apps/api/src/outlets/routes.ts`:

- Remove `t` import.
- Add `.use(tsProtoPlugin)` before `.use(authenticated)`.
- Replace:

```txt
POST /api/merchants/:merchantId/outlets
GET /api/merchants/:merchantId/outlets
PATCH /api/outlets/:id
```

with:

```txt
POST /api/outlets/create
POST /api/outlets/list
POST /api/outlets/update
```

Use request body IDs instead of path params.

**Step 5: Update POS cloud functions**

In `apps/pos-app/src/lib/auth/cloud.ts`, replace:

```ts
getMerchants()
createMerchant(name)
getOutlets(merchantId)
createOutlet(merchantId, name, address)
```

with `merchantsApi` and `outletsApi` protobuf calls, preserving return types.

**Step 6: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/merchants/__test__/routes.test.ts apps/api/src/outlets/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/merchants apps/api/src/outlets apps/pos-app/src/lib/auth/cloud.ts
git commit -m "feat: migrate merchant and outlet endpoints to protobuf"
```

---

## Task 6: Convert Staff Routes And PIN Change To Protobuf

**Files:**
- Modify: `apps/api/src/staff/routes.ts`
- Modify: `apps/api/src/staff/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`
- Modify: `apps/pos-app/src/lib/auth/provider.ts`
- Modify: `apps/pos-app/src/lib/auth/__test__/cloud.test.ts`
- Modify: `apps/pos-app/src/lib/auth/__test__/provider.test.ts`

**Step 1: Write failing protobuf route tests**

Add tests for:

```txt
POST /api/staff/current
POST /api/staff/create
POST /api/staff/list
POST /api/staff/update-pin
POST /api/staff/delete
```

Include one validation test:

```txt
invalid pin returns 400 JSON error and does not update staff
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/staff/__test__/routes.test.ts
```

Expected: New protobuf tests fail.

**Step 3: Convert staff routes**

Modify `apps/api/src/staff/routes.ts`:

- Remove `t` import.
- Add `.use(tsProtoPlugin)` before `.use(authenticated)`.
- Replace path/JSON routes with body-based protobuf routes:

```txt
POST /api/staff/current
POST /api/staff/create
POST /api/staff/list
POST /api/staff/update-pin
POST /api/staff/delete
```

Use `requirePin(request.pin)` and `requireNonEmptyString(request.name, "name", { maxLength: 100 })`.

**Step 4: Update POS auth functions**

Modify `apps/pos-app/src/lib/auth/cloud.ts`:

```txt
createStaff()
getCurrentCloudStaff()
```

Modify `apps/pos-app/src/lib/auth/provider.ts`:

- Replace raw `fetch(.../api/staff/:id/pin)` with `staffApi.updatePin({ id: staffId, pin: newPin })`.
- Keep local SQLite update behavior unchanged.

**Step 5: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/staff/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts apps/pos-app/src/lib/auth/__test__/provider.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/staff apps/pos-app/src/lib/auth
git commit -m "feat: migrate staff endpoints to protobuf"
```

---

## Task 7: Convert Register Routes To Protobuf

**Files:**
- Modify: `apps/api/src/registers/public-routes.ts`
- Modify: `apps/api/src/registers/protected-routes.ts`
- Modify: `apps/api/src/registers/__test__/routes.test.ts`
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`

**Step 1: Write failing protobuf route tests**

Add tests for:

```txt
POST /api/registers/pair
POST /api/registers/create
POST /api/registers/list
POST /api/registers/delete
```

Pairing remains public. Create/list/delete remain protected.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/registers/__test__/routes.test.ts
```

Expected: New protobuf tests fail.

**Step 3: Convert public pair route**

Modify `apps/api/src/registers/public-routes.ts`:

- Remove `t` import.
- Add `.use(tsProtoPlugin)`.
- Keep path `POST /api/registers/pair`.
- Use `{ req: RegisterPairRequest, res: RegisterPairResponse }`.
- Use `requirePairingCode(request.pairingCode)`.

**Step 4: Convert protected register routes**

Modify `apps/api/src/registers/protected-routes.ts`:

- Remove `t` import.
- Add `.use(tsProtoPlugin)` before `.use(authenticated)`.
- Replace:

```txt
POST /api/outlets/:outletId/registers
GET /api/outlets/:outletId/registers
DELETE /api/registers/:id
```

with:

```txt
POST /api/registers/create
POST /api/registers/list
POST /api/registers/delete
```

**Step 5: Update POS pair function**

Modify `apps/pos-app/src/lib/auth/cloud.ts`:

```ts
export function pairRegister(pairingCode: string): Promise<PairResult> {
  return registersApi.pair({ pairingCode }).then(decodePairResult);
}
```

**Step 6: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/registers/__test__/routes.test.ts apps/pos-app/src/lib/auth/__test__/cloud.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/registers apps/pos-app/src/lib/auth/cloud.ts
git commit -m "feat: migrate register endpoints to protobuf"
```

---

## Task 8: Remove TypeBox From OAuth Callback

**Files:**
- Modify: `apps/api/src/auth/routes.ts`
- Modify: `apps/api/src/auth/__test__/routes.test.ts`

**Step 1: Write callback query tests**

Add tests for:

```txt
GET /api/auth/google/callback returns 400 when code missing
GET /api/auth/google/callback returns 400 when state missing
GET /api/auth/google/callback returns 400 when state cookie mismatch
```

These are standard HTTP tests, not protobuf.

**Step 2: Run tests**

Run:

```bash
bun test apps/api/src/auth/__test__/routes.test.ts
```

Expected: Existing behavior should pass or fail depending on current coverage. Use as characterization.

**Step 3: Remove TypeBox query schema**

In `apps/api/src/auth/routes.ts`:

- Remove `t` import entirely if auth routes no longer use it.
- Replace callback route schema:

```ts
.get("/google/callback", async ({ request, set }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    set.status = 400;
    return { error: "Invalid OAuth callback" };
  }

  // existing callback logic
});
```

**Step 4: Run tests**

Run:

```bash
bun test apps/api/src/auth/__test__/routes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "refactor: remove typebox from oauth routes"
```

---

## Task 9: Remove JSON Cloud HTTP Client Usage

**Files:**
- Modify: `apps/pos-app/src/lib/auth/cloud.ts`
- Modify: `apps/pos-app/src/lib/http.ts`
- Modify: `apps/pos-app/src/lib/__test__/http.test.ts`
- Search all POS app source

**Step 1: Write search check**

Run:

```bash
rg "\\.json<|json: \\{|fetch\\(.*api/|api\\.(get|post|patch|delete)" apps/pos-app/src
```

Expected before implementation: Finds JSON cloud API usage.

**Step 2: Remove or narrow `~/lib/http`**

If `~/lib/http` is only used for JSON API calls after migration:

- Keep only `API_URL` and shared error helpers if still useful.
- Remove exported `api` Ky JSON client.
- Update tests accordingly.

If non-cloud code still uses `api`, leave it but document why.

**Step 3: Verify POS app calls use domain protobuf clients or native invoke**

Run:

```bash
rg "api/auth|api/merchants|api/outlets|api/staff|api/registers" apps/pos-app/src
```

Expected:

- Browser OAuth URL references may remain.
- Tests may assert URLs.
- No JSON `api.post(..., { json })` for converted endpoints.

**Step 4: Run POS tests**

Run:

```bash
bun test apps/pos-app/src/lib/auth apps/pos-app/src/lib/api apps/pos-app/src/store/__test__/sync.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src
git commit -m "refactor: remove json cloud api client usage"
```

---

## Task 10: Delete TypeBox Usage From API Routes

**Files:**
- Modify: all route files under `apps/api/src`
- Test: route tests under `apps/api/src/**/__test__`

**Step 1: Run TypeBox search**

Run:

```bash
rg "Elysia, t|\\bt\\." apps/api/src
```

Expected before cleanup: any remaining matches indicate incomplete migration.

**Step 2: Remove leftovers**

For each remaining match:

- Replace TypeBox body/query validation with protobuf request message plus explicit validation helper.
- For browser-only routes, use `URLSearchParams` and explicit guards.

**Step 3: Run TypeBox search again**

Run:

```bash
rg "Elysia, t|\\bt\\." apps/api/src
```

Expected: no matches.

**Step 4: Run API tests**

Run:

```bash
bun test apps/api/src
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src
git commit -m "refactor: remove typebox from api routes"
```

---

## Task 11: Full Verification

**Files:**
- No planned code edits unless verification fails.

**Step 1: Run full tests**

Run:

```bash
bun test apps/api/src
bun test apps/pos-app/src
```

Expected: PASS.

**Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Run Ultracite**

Run:

```bash
bun x ultracite fix
bun x ultracite check
```

Expected: PASS.

**Step 4: Run final endpoint searches**

Run:

```bash
rg "Elysia, t|\\bt\\." apps/api/src
rg "json: \\{|\\.json<" apps/pos-app/src/lib/auth apps/pos-app/src/lib/api
```

Expected:

- First command: no matches.
- Second command: no JSON cloud API usage. `response.json()` may remain only for parsing HTTP error bodies if intentionally kept.

**Step 5: Commit verification fixes**

```bash
git add .
git commit -m "chore: verify protobuf endpoint migration"
```

---

## Migration Notes

### HTTP Status Errors Stay JSON

The protobuf plugin should continue skipping response encoding for `status >= 400`. This keeps `401`, `403`, `404`, and validation errors readable by infrastructure tools and Ky error handlers.

### Do Not Use Protobuf For OAuth Redirects

`GET /api/auth/google` and `GET /api/auth/google/callback` are browser flows. They can never reliably require protobuf request bodies. The correct goal for those routes is “no TypeBox,” not “protobuf.”

### Prefer Body IDs Over Path Params

Protobuf request messages should carry IDs in the body. Avoid path params for new protobuf RPC-style endpoints:

```txt
Good: POST /api/staff/update-pin { id, pin }
Avoid: PATCH /api/staff/:id/pin { pin }
```

This keeps the client generic and avoids mixing REST path typing with protobuf body typing.

### Keep Existing Domain Services

Do not rewrite business logic during transport migration. Route handlers should adapt protobuf messages to existing DB/service calls.

---

## Success Criteria

- All POS app-to-API cloud endpoints use protobuf transport.
- Sync protobuf endpoints continue working unchanged.
- API route modules no longer import `t` from Elysia.
- `rg "Elysia, t|\\bt\\." apps/api/src` returns no matches.
- POS cloud auth/client code no longer sends JSON bodies to API cloud endpoints.
- OAuth browser redirect routes still work without TypeBox.
- API tests, POS tests, typecheck, and Ultracite all pass.
