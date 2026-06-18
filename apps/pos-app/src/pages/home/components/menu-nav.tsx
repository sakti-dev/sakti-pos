import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { type MenuGroup, menuGroups } from "../lib/data";

/**
 * The comprehensive menu surface. Where the sidebar/notch nav surfaces only
 * the four most-frequent destinations (Home, Transaksi, Stok, Pengaturan),
 * this is the full menu set — grouped by domain as a navigation list, never
 * a flat launcher grid. Same items as the old 8-tile grid; the topology is
 * what changed.
 */
export const MenuNav = () => {
  return (
    <section>
      <h3 class="mb-3 font-bold font-display text-body-lg text-foreground tracking-[-0.01em]">
        Menu
      </h3>

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <For each={menuGroups}>
          {(group) => (
            <div>
              {/* Functional domain label — permitted by the Eyebrow-Is-A-Label
                  rule: one label per concept, not decorative scaffolding. */}
              <div class="mb-2 font-semibold text-caption-sm text-muted-foreground uppercase tracking-[0.08em]">
                {group.label}
              </div>

              <div class="overflow-hidden rounded-2xl border border-border bg-card">
                <For each={group.items}>
                  {(item, i) => (
                    <>
                      <Show when={i() > 0}>
                        <div aria-hidden="true" class="mx-4 h-px bg-border" />
                      </Show>
                      <MenuRow item={item} />
                    </>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </section>
  );
};

const MenuRow = (props: { item: MenuGroup["items"][number] }) => {
  const item = props.item;
  return (
    <A
      class="group flex items-center gap-3.5 px-4 py-3 no-underline transition-colors duration-150 hover:bg-muted/60 active:bg-muted"
      href={item.href}
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-muted/50 text-foreground transition-colors duration-200 group-hover:border-primary/25 group-hover:bg-primary/8 group-hover:text-primary">
        <item.Icon class="size-[18px]" />
      </span>

      <span class="min-w-0 flex-1 font-medium text-body-sm text-foreground">
        {item.label}
      </span>

      <svg
        aria-hidden="true"
        class="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
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
  );
};
