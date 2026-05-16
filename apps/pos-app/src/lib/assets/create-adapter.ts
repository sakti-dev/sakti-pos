import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createLogger } from "~/lib/logger";
import { notifyAssetCacheReady, readCachedAssetData } from "./cache";
import type {
  AssetAttachmentField,
  AssetEntityType,
  PendingAssetPreview,
} from "./types";

export interface AssetAdapterConfig {
  entityType: AssetEntityType;
  field: AssetAttachmentField;
  onAttachmentReady?: (input: {
    assetId: string;
    entityId: string;
    entityType: AssetEntityType;
    field: AssetAttachmentField;
  }) => void;
  pendingPreviewParamName: string;
}

export interface AssetAdapter {
  getPendingPreviewUrl: (
    entityId: string | null | undefined
  ) => Promise<string | null>;
  resolveCachedImageUrl: (
    assetId: string | null | undefined
  ) => Promise<string | null>;
  startEventListeners: () => Promise<void>;
  stopEventListeners: () => void;
}

export function createAssetAdapter(config: AssetAdapterConfig): AssetAdapter {
  const adapterLogger = createLogger({
    domain: "ASSET",
    module: `adapter-${config.entityType}`,
  });

  let unsubscribeFns: (() => void)[] = [];

  const resolveCachedImageUrl = async (
    assetId: string | null | undefined
  ): Promise<string | null> => {
    if (!assetId) {
      return null;
    }

    const asset = await readCachedAssetData(assetId);
    if (!asset) {
      return null;
    }

    return `data:${asset.contentType};base64,${asset.dataBase64}`;
  };

  const getPendingPreviewUrl = async (
    entityId: string | null | undefined
  ): Promise<string | null> => {
    if (!entityId) {
      return null;
    }

    const preview = await invoke<PendingAssetPreview | null>(
      "get_pending_asset_preview",
      { [config.pendingPreviewParamName]: entityId }
    );

    if (!preview?.previewBase64) {
      return null;
    }

    return `data:${preview.previewMimeType};base64,${preview.previewBase64}`;
  };

  const startEventListeners = async (): Promise<void> => {
    if (unsubscribeFns.length > 0) {
      adapterLogger.info("listeners_already_started");
      return;
    }

    adapterLogger.info("listeners_starting");

    const unsubscribeCacheReady = await listen<{ asset_id: string }>(
      "asset-cache-ready",
      (event) => {
        adapterLogger.info("asset_cache_ready_received", {
          assetId: event.payload.asset_id,
        });
        notifyAssetCacheReady(event.payload.asset_id);
      }
    );

    const unsubscribeAttachmentReady = await listen<{
      asset_id: string;
      entity_id: string;
      entity_type: string;
      field: string;
    }>("asset-attachment-ready", (event) => {
      adapterLogger.info("asset_attachment_ready_received", {
        assetId: event.payload.asset_id,
        entityId: event.payload.entity_id,
        entityType: event.payload.entity_type,
        field: event.payload.field,
      });
      notifyAssetCacheReady(event.payload.asset_id);
      config.onAttachmentReady?.({
        assetId: event.payload.asset_id,
        entityId: event.payload.entity_id,
        entityType: config.entityType,
        field: config.field,
      });
    });

    unsubscribeFns = [unsubscribeCacheReady, unsubscribeAttachmentReady];
    adapterLogger.info("listeners_started");
  };

  const stopEventListeners = (): void => {
    for (const unsubscribe of unsubscribeFns) {
      unsubscribe();
    }
    unsubscribeFns = [];
  };

  return {
    resolveCachedImageUrl,
    getPendingPreviewUrl,
    startEventListeners,
    stopEventListeners,
  };
}
