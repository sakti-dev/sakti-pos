import { A } from "@solidjs/router";

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
          <svg
            aria-hidden="true"
            class="size-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </A>
        <A
          class="flex items-center justify-between rounded-xl border bg-card p-4 active:bg-accent"
          href="/menu/products"
        >
          <div>
            <p class="font-medium">Produk</p>
            <p class="text-muted-foreground text-sm">Kelola produk menu</p>
          </div>
          <svg
            aria-hidden="true"
            class="size-5 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </A>
      </div>
    </AppShell>
  );
}
