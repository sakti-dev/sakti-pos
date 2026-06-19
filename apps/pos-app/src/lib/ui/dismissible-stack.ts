import { createSignal, onCleanup } from "solid-js";

/**
 * Module-scope dismissible layer stack.
 *
 * Each open AdaptiveDialog pushes its id when mounting and pops on cleanup.
 * Only the topmost layer is considered "visible"; lower layers get
 * `opacity-0 pointer-events-none` applied via CSS.
 *
 * This mirrors corvu's internal Dismissible layer tracking without
 * depending on `solid-dismissible` directly (it's not hoisted).
 */

const [stack, setStack] = createSignal<string[]>([]);

export function useDismissibleVisibility(id: string) {
  const isTopmost = () => {
    const s = stack();
    return s.length === 0 || s.at(-1) === id;
  };

  const show = () => {
    setStack((s) => [...s.filter((x) => x !== id), id]);
  };

  const hide = () => {
    setStack((s) => s.filter((x) => x !== id));
  };

  onCleanup(hide);

  return { isTopmost, hide, show };
}
