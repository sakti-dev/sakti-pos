import type { JSX } from "solid-js";
import { cn } from "~/lib/utils";

interface SafeAreaShellProps {
  readonly children: JSX.Element;
  readonly class?: string;
  readonly [key: string]: unknown;
}

/**
 * Full-screen shell for pages without the app chrome (TopBar/Sidebar/NotchNav).
 * Provides a safe-area-top spacer with a border line at the boundary,
 * and a flex-1 content container.
 */
export const SafeAreaShell = (props: SafeAreaShellProps) => (
  <div
    {...props}
    class={cn(
      "flex h-[100dvh] flex-col font-sans text-foreground antialiased",
      props.class
    )}
  >
    <div class="shrink-0" style={{ height: "env(safe-area-inset-top, 0px)" }} />
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden border-border border-t">
      {props.children}
    </div>
  </div>
);
