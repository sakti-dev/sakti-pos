import { A } from "@solidjs/router";
import { TbOutlineChevronRight } from "solid-icons/tb";

import { AppShell } from "~/components/layout";

export default function MenuHome() {
	return (
		<AppShell title="Kelola Menu">
			<div class="flex flex-col gap-3 p-4">
				<A
					class="flex items-center justify-between rounded-xl border bg-card p-4 active:bg-accent"
					href="/menu/categories"
				>
					<div>
						<p class="font-medium">Kategori</p>
						<p class="text-muted-foreground text-sm">Kelola kategori menu</p>
					</div>
					<TbOutlineChevronRight class="size-5 text-muted-foreground" />
				</A>
				<A
					class="flex items-center justify-between rounded-xl border bg-card p-4 active:bg-accent"
					href="/menu/products"
				>
					<div>
						<p class="font-medium">Produk</p>
						<p class="text-muted-foreground text-sm">Kelola produk menu</p>
					</div>
					<TbOutlineChevronRight class="size-5 text-muted-foreground" />
				</A>
			</div>
		</AppShell>
	);
}
