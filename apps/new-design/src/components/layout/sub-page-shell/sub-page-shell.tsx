import type { JSX } from "solid-js";
import { ScreenHeader } from "./screen-header";

interface SubPageShellProps {
  readonly backHref: string;
  readonly backLabel?: string;
  readonly children: JSX.Element;
  readonly title: string;
  readonly [key: string]: unknown;
}

export const SubPageShell = (props: SubPageShellProps) => {
  const { backHref, backLabel, children, title, ...rest } = props;
  return (
    <div
      {...rest}
      class="flex h-screen flex-col bg-muted font-sans text-foreground antialiased"
    >
      <ScreenHeader backHref={backHref} backLabel={backLabel} title={title} />
      {children}
    </div>
  );
};
