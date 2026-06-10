import { startAssetLifecycleListener } from "~/lib/assets/lifecycle";
import { createLogger } from "~/lib/logger";

const appListenerLogger = createLogger({
  domain: "UI",
  module: "ui",
  scope: "listeners",
});

export function startAppEventListeners(): void {
  startAssetLifecycleListener().catch((error: unknown) => {
    appListenerLogger.error("asset_lifecycle_listener_start_failed", error);
  });
}
