import type { JSX } from "solid-js";
import { cn } from "~/lib/utils";

interface SafeAreaShellProps {
  readonly children: JSX.Element;
  readonly class?: string;
  readonly [key: string]: unknown;
}

/**
 * Full-screen shell for pages without the app chrome (TopBar/Sidebar/NotchNav).
 * Status bar inset is handled natively by MainActivity (content view padding),
 * so no DOM spacer is needed — just a flex container with border-t.
 */
export const SafeAreaShell = (props: SafeAreaShellProps) => (
  <div
    {...props}
    class={cn(
      "flex h-[100dvh] w-full flex-col overflow-hidden font-sans text-foreground antialiased",
      props.class
    )}
  >
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden border-border border-t">
      {props.children}
    </div>
  </div>
);
