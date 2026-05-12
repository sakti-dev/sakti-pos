import {
  TbOutlineCloud,
  TbOutlineCloudOff,
  TbOutlineCloudUpload,
  TbOutlineLoader2,
} from "solid-icons/tb";
import { Show } from "solid-js";
import { cn } from "~/lib/utils";
import { lastAssetQueueCount, syncStatus } from "~/store/sync";

export function SyncStatusIndicator() {
  const status = syncStatus();
  const hasQueuedUploads = status === "idle" && lastAssetQueueCount() > 0;

  return (
    <Show
      fallback={
        hasQueuedUploads ? (
          <TbOutlineCloudUpload class="size-5 text-primary" />
        ) : (
          <TbOutlineCloud class="size-5 text-muted-foreground" />
        )
      }
      when={status !== "idle"}
    >
      <Show
        fallback={
          <TbOutlineCloudOff
            class={cn(
              "size-5",
              status === "error" ? "text-destructive" : "text-muted-foreground"
            )}
          />
        }
        when={status === "syncing"}
      >
        <TbOutlineLoader2 class="size-5 animate-spin text-primary" />
      </Show>
    </Show>
  );
}
