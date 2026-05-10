import { describe, expect, test } from "bun:test";
import {
  encodeApiUser,
  encodeMerchant,
  encodeOutlet,
  encodeRegister,
  encodeStaff,
  optionalString,
} from "../domain";

describe("domain protobuf helpers", () => {
  test("encodes optional strings with presence flags", () => {
    expect(optionalString(null)).toEqual({ hasValue: false, value: "" });
    expect(optionalString("Main")).toEqual({ hasValue: true, value: "Main" });
  });

  test("encodes api user", () => {
    const user = encodeApiUser({
      email: "owner@example.com",
      id: "user-1",
      name: "Owner",
    });

    expect(user.id).toBe("user-1");
    expect(user.email).toBe("owner@example.com");
  });

  test("encodes merchant", () => {
    const merchant = encodeMerchant({
      createdAt: "2026-05-10T00:00:00.000Z",
      id: "merchant-1",
      name: "Warung",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    expect(merchant.id).toBe("merchant-1");
    expect(merchant.name).toBe("Warung");
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
