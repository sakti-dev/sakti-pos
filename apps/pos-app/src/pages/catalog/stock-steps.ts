export type StockMode = "unlimited" | "limited";

export type StockStep =
  | { kind: "seed"; qty: number }
  | { kind: "threshold"; value: number }
  | { kind: "stopTracking" };

export interface StockStepInput {
  readonly initialQty: number;
  readonly mode: StockMode;
  readonly threshold: number;
  readonly wasTracked: boolean;
}

/** Mode × tracked-state → ordered stock db calls a product-form save performs. */
export function resolveStockSteps(input: StockStepInput): readonly StockStep[] {
  if (input.mode === "unlimited") {
    return input.wasTracked ? [{ kind: "stopTracking" }] : [];
  }
  const steps: StockStep[] = [];
  if (!input.wasTracked) {
    steps.push({ kind: "seed", qty: Math.max(0, input.initialQty) });
  }
  steps.push({ kind: "threshold", value: Math.max(0, input.threshold) });
  return steps;
}
