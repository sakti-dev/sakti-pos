import {
	TbOutlineCloud,
	TbOutlineCloudOff,
	TbOutlineLoader2,
} from "solid-icons/tb";
import { Show } from "solid-js";
import { syncStatus } from "~/lib/sync";
import { cn } from "~/lib/utils";

export function SyncStatusIndicator() {
	const status = syncStatus();

	return (
		<Show
			when={status !== "idle"}
			fallback={<TbOutlineCloud class="size-5 text-muted-foreground" />}
		>
			<Show
				when={status === "syncing"}
				fallback={
					<TbOutlineCloudOff
						class={cn(
							"size-5",
							status === "error" ? "text-destructive" : "text-muted-foreground",
						)}
					/>
				}
			>
				<TbOutlineLoader2 class="size-5 animate-spin text-primary" />
			</Show>
		</Show>
	);
}
