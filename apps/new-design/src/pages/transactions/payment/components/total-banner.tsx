import { formatRupiah } from "~/lib/utils";

interface TotalBannerProps {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export const TotalBanner = (props: TotalBannerProps) => (
  <div class="block shrink-0 rounded-lg bg-primary px-6 py-5 lg:hidden">
    <div class="font-extrabold text-heading text-primary-foreground tabular-nums tracking-[-0.02em]">
      {formatRupiah(props.total)}
    </div>
    <div class="mt-1 flex gap-3 text-caption text-primary-foreground/75">
      <span>
        Subtotal: <b>{formatRupiah(props.subtotal)}</b>
      </span>
      <span>
        Pajak 11%: <b>{formatRupiah(props.tax)}</b>
      </span>
    </div>
  </div>
);
