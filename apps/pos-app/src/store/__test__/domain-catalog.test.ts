import { beforeEach, describe, expect, test } from "vitest";
import {
  getDomainCatalogVersion,
  notifyAssetAttachmentReady,
  resetDomainCatalogVersionsForTest,
} from "~/store/domain-catalog";

describe("domain catalog invalidation", () => {
  beforeEach(() => {
    resetDomainCatalogVersionsForTest();
  });

  test("increments the product catalog version for product asset attachments", () => {
    expect(getDomainCatalogVersion("product")).toBe(0);

    notifyAssetAttachmentReady({
      assetId: "asset-1",
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });

    expect(getDomainCatalogVersion("product")).toBe(1);
  });
});
