import { Avatar, AvatarFallback } from "~/components/ui/avatar";

export const VenueCard = () => {
  return (
    <div class="flex items-center gap-3.5 rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] p-[14px_18px] dark:border-[rgba(255,255,255,0.04)] dark:bg-[rgba(255,255,255,0.04)]">
      <Avatar class="h-11 w-11 shrink-0">
        <AvatarFallback class="rounded-full bg-accent font-bold text-[15px] text-primary dark:bg-[rgba(168,229,229,0.20)] dark:text-accent">
          YB
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-[13px] text-[rgba(255,255,255,0.85)] dark:text-[rgba(255,255,255,0.85)]">
            Yos Bb
          </span>
          <span class="rounded-pill bg-accent-3 px-2 py-[2px] font-medium text-[11px] text-primary dark:bg-[rgba(255,233,92,0.25)] dark:text-accent-3">
            Manager
          </span>
          <span class="font-semibold text-[15px] text-white">Tantri Cafe</span>
        </div>
        <div class="mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-[rgba(255,255,255,0.55)] tracking-[0.01em]">
          Jl. Banda No.30, Citarum, Kec. Bandung Wetan, Kota Bandung, Jawa Barat
          40115
        </div>
      </div>
    </div>
  );
};
