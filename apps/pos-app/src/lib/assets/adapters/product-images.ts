import { notifyAssetAttachmentReady } from "~/store/domain-catalog";
import { createAssetAdapter } from "../create-adapter";

export const productImageAdapter = createAssetAdapter({
  entityType: "product",
  field: "image_asset_id",
  pendingPreviewParamName: "productId",
  onAttachmentReady: (input) => {
    notifyAssetAttachmentReady(input);
  },
});
