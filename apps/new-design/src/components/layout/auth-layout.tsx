import type { RouteSectionProps } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { authConfig } from "~/lib/ssgoi-config";

/**
 * Layout route for auth pages (login ↔ register ↔ pin).
 * Persists across auth navigation — only content animates via fade.
 */
export function AuthLayout(props: RouteSectionProps) {
  return (
    <Ssgoi config={authConfig}>
      <div class="relative z-0 overflow-x-clip">{props.children}</div>
    </Ssgoi>
  );
}
