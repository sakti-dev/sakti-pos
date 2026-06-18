import { CloudIcon } from "~/assets";
import { cn } from "~/lib/utils";
import { currentUser, currentVenue, registerStatus } from "../lib/data";

const pillBase =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-caption-sm tracking-wide backdrop-blur-sm";

const pills = {
  open: "bg-accent-soft/90 text-primary",
  closed: "bg-white/10 text-white/70",
  neutral: "border border-white/15 bg-white/[0.08] text-white/80",
};

function Dot({ class: cls }: { class?: string }) {
  return (
    <span aria-hidden="true" class={cn("relative flex h-1.5 w-1.5", cls)}>
      <span class="absolute inline-flex h-full w-full rounded-full bg-current opacity-70 [animation:pulse-dot_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

export const StatusPlaque = () => {
  const open = registerStatus.open;
  return (
    <div class="flex items-center justify-between gap-3">
      {/* Venue — collapsed from the old VenueCard */}
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="grid size-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 font-bold text-caption text-white backdrop-blur-sm">
          {currentUser.initials}
        </span>
        <div class="min-w-0">
          <div class="truncate font-semibold text-body-sm text-white">
            {currentVenue.name}
          </div>
          <div class="truncate text-caption text-white/55">
            {currentUser.name} · {currentUser.role}
          </div>
        </div>
      </div>

      {/* Status pills — apothecary hours slate */}
      <div class="flex shrink-0 items-center gap-1.5">
        <span class={cn(pillBase, open ? pills.open : pills.closed)}>
          <Dot class={open ? "text-primary" : "text-white/70"} />
          {open ? "Buka" : "Tutup"}
        </span>
        <span class={cn(pillBase, pills.neutral)}>
          Laci {registerStatus.drawer}
        </span>
        <span class={cn(pillBase, pills.neutral)} title="Tersinkron">
          <CloudIcon class="size-3.5" />
        </span>
      </div>
    </div>
  );
};
