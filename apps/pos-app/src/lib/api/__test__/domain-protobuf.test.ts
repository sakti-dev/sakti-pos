import { AuthLoginRequest, AuthResponse } from "@repo/protobuf/auth";
import { ApiUser } from "@repo/protobuf/common";
import {
  MerchantCreateRequest,
  MerchantCreateResponse,
} from "@repo/protobuf/merchants";
import {
  OutletCreateRequest,
  OutletCreateResponse,
} from "@repo/protobuf/outlets";
import { describe, expect, test } from "vitest";

describe("domain protobuf messages", () => {
  test("round trips shared, auth, merchant, and outlet messages", () => {
    const user = ApiUser.decode(
      ApiUser.encode({
        email: "owner@example.com",
        id: "user-1",
        name: "Owner",
      }).finish()
    );

    const login = AuthLoginRequest.decode(
      AuthLoginRequest.encode({
        email: "owner@example.com",
        password: "secret",
      }).finish()
    );

    const auth = AuthResponse.decode(
      AuthResponse.encode({
        sessionToken: "token-1",
        user: {
          email: "owner@example.com",
          id: "user-1",
          name: "Owner",
        },
      }).finish()
    );

    const merchant = MerchantCreateRequest.decode(
      MerchantCreateRequest.encode({ name: "Warung" }).finish()
    );

    const merchantResponse = MerchantCreateResponse.decode(
      MerchantCreateResponse.encode({
        merchant: {
          createdAt: "2026-05-10T00:00:00.000Z",
          id: "merchant-1",
          name: "Warung",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      }).finish()
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
        register: undefined,
      }).finish()
    );

    const createOutlet = OutletCreateRequest.decode(
      OutletCreateRequest.encode({
        address: "",
        hasAddress: false,
        merchantId: "merchant-1",
        name: "Main",
      }).finish()
    );

    expect(user.id).toBe("user-1");
    expect(login.email).toBe("owner@example.com");
    expect(auth.user?.id).toBe("user-1");
    expect(merchant.name).toBe("Warung");
    expect(merchantResponse.merchant?.id).toBe("merchant-1");
    expect(createOutlet.merchantId).toBe("merchant-1");
    expect(outletResponse.outlet?.id).toBe("outlet-1");
  });
});
