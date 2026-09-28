import { formatRupiah } from "~/lib/utils";

interface TotalBannerProps {
  readonly subtotal: number;
  readonly tax: number;
  readonly taxPercent: number;
  readonly total: number;
}

export const TotalBanner = (props: TotalBannerProps) => (
  <div class="block shrink-0 rounded-lg bg-primary px-6 py-5 lg:flex lg:items-baseline lg:justify-between lg:gap-4 lg:py-3.5">
    <div class="font-extrabold text-heading text-primary-foreground tabular-nums tracking-tight lg:font-bold lg:text-body">
      {formatRupiah(props.total)}
    </div>
    <div class="mt-1 flex gap-3 text-caption text-primary-foreground/75 lg:mt-0">
      <span>
        Subtotal: <b>{formatRupiah(props.subtotal)}</b>
      </span>
      {props.tax > 0 && (
        <span>
          Pajak {props.taxPercent}%: <b>{formatRupiah(props.tax)}</b>
        </span>
      )}
    </div>
  </div>
);
