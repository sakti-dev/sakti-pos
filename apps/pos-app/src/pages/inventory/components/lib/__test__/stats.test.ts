import { describe, expect, it } from "vitest";
import { stockStatus } from "../stats";

describe("inventory stats", () => {
  it("stockStatus classifies out / low / available", () => {
    expect(stockStatus(0, 5)).toMatchObject({ status: "out" });
    expect(stockStatus(3, 5)).toMatchObject({ status: "low" });
    expect(stockStatus(5, 5)).toMatchObject({ status: "low" });
    expect(stockStatus(6, 5)).toMatchObject({ status: "available" });
  });

  it("stockStatus honours a per-item threshold", () => {
    expect(stockStatus(20, 20)).toMatchObject({ status: "low" });
    expect(stockStatus(21, 20)).toMatchObject({ status: "available" });
  });

  it("negative stock reads as out", () => {
    expect(stockStatus(-2, 5)).toMatchObject({
      status: "out",
      badge: "danger",
    });
  });
});
