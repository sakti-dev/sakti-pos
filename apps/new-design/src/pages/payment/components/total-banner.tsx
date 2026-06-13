import { formatRupiah } from "~/lib/utils";

interface TotalBannerProps {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export const TotalBanner = (props: TotalBannerProps) => (
  <div class="hidden shrink-0 rounded-[18px] bg-primary px-6 py-5 max-[900px]:block dark:border">
    <div class="font-extrabold text-[28px] text-primary-foreground tabular-nums tracking-[-0.02em]">
      {formatRupiah(props.total)}
    </div>
    <div class="mt-1 flex gap-3 text-[12px] text-white/60">
      <span>
        Subtotal: <b>{formatRupiah(props.subtotal)}</b>
      </span>
      <span>
        Pajak 11%: <b>{formatRupiah(props.tax)}</b>
      </span>
    </div>
  </div>
);
