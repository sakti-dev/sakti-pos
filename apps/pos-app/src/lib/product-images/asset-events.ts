import { listen } from "@tauri-apps/api/event";
import { createLogger } from "~/lib/logger";
import { notifyAssetCacheReady } from "~/store/asset-cache";
import { notifyAssetAttachmentReady } from "~/store/domain-catalog";

interface AssetCacheReadyPayload {
  asset_id: string;
}

interface AssetAttachmentReadyPayload {
  asset_id: string;
  entity_id: string;
  entity_type: "product";
  field: "image_asset_id";
}

let unsubscribeAssetEvents: (() => void)[] = [];
const assetEventLogger = createLogger({
  domain: "ASSET",
  module: "asset-events",
});

export async function startAssetEventListeners(): Promise<void> {
  if (unsubscribeAssetEvents.length > 0) {
    assetEventLogger.info("listeners_already_started");
    return;
  }

  assetEventLogger.info("listeners_starting");
  const unsubscribeAssetCacheReady = await listen<AssetCacheReadyPayload>(
    "asset-cache-ready",
    (event) => {
      assetEventLogger.info("asset_cache_ready_received", {
        assetId: event.payload.asset_id,
      });
      notifyAssetCacheReady(event.payload.asset_id);
    }
  );

  const unsubscribeAssetAttachmentReady =
    await listen<AssetAttachmentReadyPayload>(
      "asset-attachment-ready",
      (event) => {
        assetEventLogger.info("asset_attachment_ready_received", {
          assetId: event.payload.asset_id,
          entityId: event.payload.entity_id,
          entityType: event.payload.entity_type,
          field: event.payload.field,
        });
        notifyAssetCacheReady(event.payload.asset_id);
        notifyAssetAttachmentReady({
          assetId: event.payload.asset_id,
          entityId: event.payload.entity_id,
          entityType: event.payload.entity_type,
          field: event.payload.field,
        });
      }
    );

  unsubscribeAssetEvents = [
    unsubscribeAssetCacheReady,
    unsubscribeAssetAttachmentReady,
  ];
  assetEventLogger.info("listeners_started");
}

export function stopAssetEventListeners(): void {
  for (const unsubscribe of unsubscribeAssetEvents) {
    unsubscribe();
  }
  unsubscribeAssetEvents = [];
}
