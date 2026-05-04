import { cn } from "~/lib/utils";

export function Skeleton(props: { class?: string }) {
	return <div class={cn("animate-pulse rounded-md bg-muted", props.class)} />;
}
