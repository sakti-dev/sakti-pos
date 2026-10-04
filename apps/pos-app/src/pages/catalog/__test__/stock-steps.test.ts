import { describe, expect, test } from "vitest";
import { resolveStockSteps } from "../stock-steps";

describe("resolveStockSteps", () => {
  test("unlimited + untracked → no steps (today's default)", () => {
    expect(
      resolveStockSteps({
        mode: "unlimited",
        wasTracked: false,
        initialQty: 0,
        threshold: 0,
      })
    ).toEqual([]);
  });

  test("unlimited + tracked → stopTracking", () => {
    expect(
      resolveStockSteps({
        mode: "unlimited",
        wasTracked: true,
        initialQty: 0,
        threshold: 0,
      })
    ).toEqual([{ kind: "stopTracking" }]);
  });

  test("limited + untracked → seed then threshold", () => {
    expect(
      resolveStockSteps({
        mode: "limited",
        wasTracked: false,
        initialQty: 24,
        threshold: 5,
      })
    ).toEqual([
      { kind: "seed", qty: 24 },
      { kind: "threshold", value: 5 },
    ]);
  });

  test("limited + tracked → threshold only, never overwrite balance", () => {
    expect(
      resolveStockSteps({
        mode: "limited",
        wasTracked: true,
        initialQty: 24,
        threshold: 5,
      })
    ).toEqual([{ kind: "threshold", value: 5 }]);
  });

  test("negative inputs clamp to 0", () => {
    expect(
      resolveStockSteps({
        mode: "limited",
        wasTracked: false,
        initialQty: -3,
        threshold: -1,
      })
    ).toEqual([
      { kind: "seed", qty: 0 },
      { kind: "threshold", value: 0 },
    ]);
  });
});
