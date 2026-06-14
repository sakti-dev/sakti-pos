import { For } from "solid-js";
import { Button } from "~/components/ui/button";
import { CardDesc, CardTitle, SectionCard } from "./primitives";

const STAFF = [
  { initials: "YB", name: "Yos Bb", role: "Manager", active: true },
  { initials: "RS", name: "Rina Sari", role: "Kasir Senior", active: true },
  { initials: "AF", name: "Ahmad Fauzi", role: "Kasir", active: true },
  { initials: "DL", name: "Dian Lestari", role: "Barista", active: false },
] as const;

export function SectionTim() {
  return (
    <SectionCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Kasir & Tim</CardTitle>
          <CardDesc>Kelola anggota tim dan hak akses kasir Anda.</CardDesc>
        </div>
        <Button type="button">
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tambah Anggota
        </Button>
      </div>
      <div class="flex flex-col gap-2">
        <For each={STAFF}>
          {(s) => (
            <div class="flex items-center gap-3.5 rounded-[10px] border border-border bg-muted px-4 py-3.5">
              <div class="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent-soft font-bold font-display text-body-sm text-primary">
                {s.initials}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-body-sm text-foreground">
                  {s.name}
                </div>
                <div class="mt-px text-caption text-muted-foreground">
                  {s.role}
                </div>
              </div>
              <span
                class={`rounded-full px-2.5 py-[3px] font-semibold text-caption-sm uppercase tracking-[0.04em] ${
                  s.active
                    ? "bg-accent/10 text-primary dark:text-accent"
                    : "bg-danger/10 text-danger dark:bg-danger dark:text-danger-foreground"
                }`}
              >
                {s.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          )}
        </For>
      </div>
    </SectionCard>
  );
}
