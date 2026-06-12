import type { RouteSectionProps } from "@solidjs/router";
import { Ssgoi } from "@ssgoi/solid";
import { flowConfig } from "~/lib/ssgoi-config";

/**
 * Layout route for the transaction flow (transaction-new → payment → receipt).
 * Persists across the flow — only content animates via drill transitions.
 */
export function FlowLayout(props: RouteSectionProps) {
  return (
    <Ssgoi config={flowConfig}>
      <div class="relative z-0 overflow-x-clip">{props.children}</div>
    </Ssgoi>
  );
}
