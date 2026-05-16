import { createAssetAdapter } from "../create-adapter";
import { notifyAssetAttachmentReady } from "~/store/domain-catalog";

export const productImageAdapter = createAssetAdapter({
  entityType: "product",
  field: "image_asset_id",
  pendingPreviewParamName: "productId",
  onAttachmentReady: (input) => {
    notifyAssetAttachmentReady(input);
  },
});
