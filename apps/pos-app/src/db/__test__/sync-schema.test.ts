import {
  assets,
  localAssetCache,
  pendingAssetProcessingJobs,
  pendingProductPhotoJobs,
  syncCursors,
  syncOutbox,
} from "@repo/database";
import { describe, expect, test } from "vitest";

describe("local smart sync schema", () => {
  test("defines asset registry and compact outbox/cursor tables", () => {
    expect(assets).toBeDefined();
    expect(localAssetCache).toBeDefined();
    expect(pendingAssetProcessingJobs).toBeDefined();
    expect(pendingProductPhotoJobs).toBeDefined();
    expect(syncOutbox).toBeDefined();
    expect(syncCursors).toBeDefined();
  });
});
