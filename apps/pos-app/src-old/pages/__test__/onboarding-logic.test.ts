import { describe, expect, test } from "vitest";
import { resolveInitialStep } from "../onboarding";

describe("resolveInitialStep", () => {
  test("returns 'merchant' when no merchantId provided", () => {
    expect(resolveInitialStep(null, null)).toBe("merchant");
  });

  test("returns 'outlet' when merchantId is provided", () => {
    expect(resolveInitialStep("m1", null)).toBe("outlet");
  });

  test("returns 'setup-pin' when merchantId and outletId are provided", () => {
    expect(resolveInitialStep("m1", "o1")).toBe("setup-pin");
  });
});
