import { describe, expect, test } from "bun:test";
// biome-ignore lint/performance/noNamespaceImport: this test intentionally inspects the exported schema namespace.
import * as apiSchema from "@sync-contract/api-schema";
import { getTableColumns } from "drizzle-orm";

describe("api smart sync schema", () => {
  test("does not export syncEvents", () => {
    expect(apiSchema).not.toHaveProperty("syncEvents");
  });

  test("does not retain latest event id on sync batch requests", () => {
    const columns = getTableColumns(apiSchema.syncBatchRequests);

    expect(columns).not.toHaveProperty("latestEventId");
  });
});
