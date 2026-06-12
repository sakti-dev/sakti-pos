import type { RouteSectionProps } from "@solidjs/router";

export function AuthLayout(props: RouteSectionProps) {
  return <div class="relative z-0 overflow-x-clip">{props.children}</div>;
}
