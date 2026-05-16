import { describe, expect, test } from "vitest";

import {
  ASSET_ATTACHMENT_TARGETS,
  createAssetProcessingTarget,
} from "~/lib/asset-targets";

describe("asset target helpers", () => {
  test("creates a product image target from the documented target key", () => {
    expect(createAssetProcessingTarget("productImage", "product-1")).toEqual({
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    });
  });

  test("keeps supported target metadata in one exported registry", () => {
    expect(ASSET_ATTACHMENT_TARGETS.productImage).toEqual({
      entityType: "product",
      field: "image_asset_id",
    });
  });
});
