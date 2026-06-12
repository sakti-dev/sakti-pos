import type { JSX } from "solid-js";

interface PosLayoutProps {
  readonly cart: JSX.Element;
  readonly catalog: JSX.Element;
}

export const PosLayout = (props: PosLayoutProps) => {
  return (
    <div class="flex flex-1 overflow-hidden bg-surface-gray dark:bg-[#111]">
      <div class="flex flex-1 gap-0 overflow-hidden">
        {/* Catalog area */}
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5 max-[900px]:gap-3 max-[900px]:p-3.5 max-[900px]:pb-20">
          {props.catalog}
        </div>

        {/* Cart sidebar — desktop only */}
        <div class="flex w-[360px] min-w-[360px] flex-col overflow-hidden border-border border-l bg-surface max-[900px]:hidden max-[1100px]:w-[320px] max-[1100px]:min-w-[320px] dark:border-[rgba(255,255,255,0.06)] dark:bg-[#1a1a1a]">
          {props.cart}
        </div>
      </div>
    </div>
  );
};
