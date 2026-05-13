import { createLogger } from "~/lib/logger";
import { startAssetEventListeners } from "~/lib/product-images/asset-events";

const appListenerLogger = createLogger({
  domain: "UI",
  module: "ui",
  scope: "listeners",
});

export function startAppEventListeners(): void {
  startAssetEventListeners().catch((error: unknown) => {
    appListenerLogger.error("asset_event_listeners_start_failed", error);
  });
}
