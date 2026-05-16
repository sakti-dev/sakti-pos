import { productImageAdapter } from "~/lib/assets/adapters/product-images";
import { createLogger } from "~/lib/logger";

const appListenerLogger = createLogger({
  domain: "UI",
  module: "ui",
  scope: "listeners",
});

export function startAppEventListeners(): void {
  productImageAdapter.startEventListeners().catch((error: unknown) => {
    appListenerLogger.error("asset_event_listeners_start_failed", error);
  });
}
