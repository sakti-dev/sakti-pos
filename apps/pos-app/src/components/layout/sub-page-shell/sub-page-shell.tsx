import type { JSX } from "solid-js";
import { SafeAreaShell } from "../safe-area-shell";
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
    <SafeAreaShell {...rest} class="bg-muted">
      <ScreenHeader backHref={backHref} backLabel={backLabel} title={title} />
      {children}
    </SafeAreaShell>
  );
};
