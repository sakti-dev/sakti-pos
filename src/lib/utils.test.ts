import { describe, expect, test } from "bun:test";
import { formatIDR } from "./utils";

describe("formatIDR", () => {
  test("formats zero", () => {
    expect(formatIDR(0)).toBe("Rp\u00a00");
  });

  test("formats positive amount", () => {
    expect(formatIDR(15_000)).toBe("Rp\u00a015.000");
  });

  test("formats large amount", () => {
    expect(formatIDR(1_500_000)).toBe("Rp\u00a01.500.000");
  });
});
