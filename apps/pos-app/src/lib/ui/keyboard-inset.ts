import { createSignal, onCleanup, onMount } from "solid-js";

/**
 * Keyboard inset on Android WebViews: with edge-to-edge the layout
 * viewport does not resize for the keyboard (adjustResize is inert) —
 * only window.visualViewport shrinks. Fixed bottom-anchored sheets must
 * consume this to ride above the keyboard instead of behind it.
 *
 * Returns (insetPx, visibleHeightPx); inset is 0 when no keyboard.
 */
export function createKeyboardInset(): {
  inset: () => number;
  layoutHeight: () => number;
  visibleHeight: () => number;
} {
  const [inset, setInset] = createSignal(0);
  const [layoutHeight, setLayoutHeight] = createSignal(
    typeof window === "undefined" ? 0 : window.innerHeight
  );
  const [visibleHeight, setVisibleHeight] = createSignal(
    typeof window === "undefined" ? 0 : window.innerHeight
  );

  onMount(() => {
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    const update = () => {
      const next = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop)
      );
      setInset(next);
      setLayoutHeight(window.innerHeight);
      setVisibleHeight(Math.round(vv.height));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    onCleanup(() => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    });
  });

  return { inset, layoutHeight, visibleHeight };
}
