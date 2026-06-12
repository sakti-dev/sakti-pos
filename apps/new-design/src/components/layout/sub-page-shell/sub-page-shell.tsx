import type { JSX } from "solid-js";
import { ScreenHeader } from "./screen-header";

interface SubPageShellProps {
  readonly backHref: string;
  readonly backLabel?: string;
  readonly children: JSX.Element;
  readonly title: string;
}

export const SubPageShell = (props: SubPageShellProps) => (
  <div class="flex h-screen flex-col bg-surface-gray font-sans text-text antialiased dark:bg-[#111] dark:text-[#f0f0f0]">
    <ScreenHeader
      backHref={props.backHref}
      backLabel={props.backLabel}
      title={props.title}
    />
    {props.children}
  </div>
);
