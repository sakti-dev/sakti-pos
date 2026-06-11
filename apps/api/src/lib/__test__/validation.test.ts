import { describe, expect, test } from "bun:test";
import {
  BadRequestError,
  requireEmail,
  requireNonEmptyString,
  requirePairingCode,
  requirePin,
} from "../validation";

describe("route validation", () => {
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
