import { fmt } from "./order-summary";

interface TotalBannerProps {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

export const TotalBanner = (props: TotalBannerProps) => (
  <div class="hidden shrink-0 rounded-lg bg-primary px-6 py-5 max-[900px]:block dark:border dark:border-[rgba(168,229,229,0.15)] dark:bg-[#1f3d08] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
    <div class="font-extrabold text-[28px] text-white tabular-nums tracking-[-0.02em] dark:text-[#e8f5e0]">
      {fmt(props.total)}
    </div>
    <div class="mt-1 flex gap-3 text-[12px] text-[rgba(255,255,255,0.60)] dark:text-[rgba(255,255,255,0.65)]">
      <span>
        Subtotal: <b>{fmt(props.subtotal)}</b>
      </span>
      <span>
        Pajak 11%: <b>{fmt(props.tax)}</b>
      </span>
    </div>
  </div>
);
