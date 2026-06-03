import {
  localAssetCache,
  pendingAssetProcessingJobs,
  pendingProductPhotoJobs,
  syncCursors,
  syncOutbox,
} from "@sync-contract/local-schema";
import { assets } from "@sync-contract/local-synced-schema";
import { getTableColumns } from "drizzle-orm";
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

  test("does not retain event id cursors after row-state sync migration", () => {
    const columns = getTableColumns(syncCursors);

    expect(columns).not.toHaveProperty("lastServerEventId");
    expect(columns).toHaveProperty("lastCursor");
  });
});
