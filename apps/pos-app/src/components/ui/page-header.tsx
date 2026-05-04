import { useNavigate } from "@solidjs/router";
import { TbOutlineChevronLeft } from "solid-icons/tb";
import type { JSX } from "solid-js";
import { Show } from "solid-js";

import { cn } from "~/lib/utils";

interface PageHeaderProps {
	backHref?: string;
	children: JSX.Element;
	class?: string;
}

export function PageHeader(props: PageHeaderProps) {
	const navigate = useNavigate();

	return (
		<div
			class={cn(
				"sticky top-0 z-40 flex items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur-sm",
				props.class,
			)}
		>
			<Show when={props.backHref}>
				{(href) => (
					<button
						class="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={() => navigate(href(), { replace: true })}
						type="button"
					>
						<TbOutlineChevronLeft class="size-5" />
					</button>
				)}
			</Show>
			<h1 class="font-semibold text-lg">{props.children}</h1>
		</div>
	);
}
