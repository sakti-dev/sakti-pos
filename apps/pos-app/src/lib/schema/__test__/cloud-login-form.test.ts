import { safeParse } from "valibot";
import { describe, expect, test } from "vitest";

import { CloudLoginSchema, CloudRegisterSchema } from "../cloud-login-form";

describe("cloud auth schemas", () => {
  test("accepts login payload", () => {
    const result = safeParse(CloudLoginSchema, {
      email: "user@example.com",
      password: "password1234",
    });

    expect(result.success).toBe(true);
  });

  test("rejects short login password", () => {
    const result = safeParse(CloudLoginSchema, {
      email: "user@example.com",
      password: "short",
    });

    expect(result.success).toBe(false);
  });

  test("accepts register payload", () => {
    const result = safeParse(CloudRegisterSchema, {
      name: "Nama",
      email: "user@example.com",
      password: "password1234",
    });

    expect(result.success).toBe(true);
  });
});
