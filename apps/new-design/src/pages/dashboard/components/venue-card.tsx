import { Avatar, AvatarFallback } from "~/components/ui/avatar";

export const VenueCard = () => {
  return (
    <div class="relative flex items-center gap-3.5 overflow-hidden rounded-lg border border-white/15 bg-banner-to/60 p-[14px_18px]">
      {/* Noise texture */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 bg-cover opacity-[0.03] mix-blend-overlay"
        style={{ "background-image": "url(/noise.webp)" }}
      />
      <Avatar class="h-11 w-11 shrink-0">
        <AvatarFallback class="rounded-full bg-accent-soft font-bold text-[15px] text-primary">
          YB
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-[13px] text-white/90">Yos Bb</span>
          <span class="rounded-full bg-accent-soft px-2 py-[2px] font-medium text-[11px] text-primary">
            Manager
          </span>
          <span class="font-semibold text-[15px] text-white">Tantri Cafe</span>
        </div>
        <div class="mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-white/65 tracking-[0.01em]">
          Jl. Banda No.30, Citarum, Kec. Bandung Wetan, Kota Bandung, Jawa Barat
          40115
        </div>
      </div>
    </div>
  );
};
