import type { JSX } from "solid-js";
import { SafeAreaShell } from "../safe-area-shell";
import { ScreenHeader } from "./screen-header";

interface SubPageShellProps {
  readonly backHref: string;
  readonly backLabel?: string;
  readonly children: JSX.Element;
  /** When set, the back button walks browser history instead of backHref. */
  readonly onBack?: () => void;
  readonly title: string;
  readonly [key: string]: unknown;
}

export const SubPageShell = (props: SubPageShellProps) => {
  const { backHref, backLabel, children, onBack, title, ...rest } = props;
  return (
    <SafeAreaShell {...rest} class="bg-muted">
      <ScreenHeader
        backHref={backHref}
        backLabel={backLabel}
        onBack={onBack}
        title={title}
      />
      {children}
    </SafeAreaShell>
  );
};
