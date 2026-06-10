import { describe, expect, test } from "vitest";

// sync.ts no longer invokes Tauri commands directly — it re-exports from upload
// and provides a stub for hydrateMissingAssets.

const { hydrateMissingAssets, uploadPendingAssets } = await import(
  "~/lib/assets/sync"
);

describe("asset sync", () => {
  test("hydrateMissingAssets is a stub returning 0", async () => {
    const result = await hydrateMissingAssets();
    expect(result).toBe(0);
  });

  test("uploadPendingAssets is re-exported from upload module", () => {
    expect(typeof uploadPendingAssets).toBe("function");
  });
});
