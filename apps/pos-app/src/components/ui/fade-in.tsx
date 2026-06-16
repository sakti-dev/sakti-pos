import { type JSX, Show, splitProps } from "solid-js";

type FadeInProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
  /** Seconds to wait before starting */
  delay?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Initial vertical offset in px (animates to 0) */
  y?: number;
  /** Initial horizontal offset in px (animates to 0) */
  x?: number;
  /** Initial scale (animates to 1). e.g. 0.97 for a subtle grow */
  scale?: number;
  /** Enable the entrance animation (default: true). Set to false to render
   * children without animation — useful where an SSGOI page transition
   * already carries the motion (e.g. portrait x-slide). */
  enable?: boolean;
  style?: JSX.CSSProperties;
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Entrance fade animation using CSS keyframes.
 *
 * On `animationend` the `animation` property is stripped so the element
 * settles at its natural CSS state (opacity: 1, no transform). This is
 * essential for SSGOI: when the page is cloned via `cloneNode(true)` for
 * the OUT transition, there is no animation to replay and no WAAPI state
 * to lose — unlike `motion-solidjs`, whose WAAPI animations vanish on
 * clone and leave elements stuck at their invisible `initial` state.
 */
export function FadeIn(props: FadeInProps) {
  const [local, rest] = splitProps(props, [
    "delay",
    "duration",
    "y",
    "x",
    "scale",
    "enable",
    "style",
    "class",
    "onAnimationEnd",
    "children",
  ]);

  const enabled = () => local.enable ?? true;

  return (
    <Show
      fallback={
        <div {...rest} class={local.class} style={local.style}>
          {local.children}
        </div>
      }
      when={enabled()}
    >
      <div
        {...rest}
        class={local.class}
        onAnimationEnd={(e) => {
          e.currentTarget.style.animation = "none";
          if (typeof local.onAnimationEnd === "function") {
            (local.onAnimationEnd as (e: AnimationEvent) => void)(e);
          }
        }}
        style={{
          "--enter-y": `${local.y ?? 12}px`,
          "--enter-x": `${local.x ?? 0}px`,
          "--enter-scale": `${local.scale ?? 1}`,
          animation: `${local.duration ?? 0.45}s ${EASE} ${local.delay ?? 0}s both ssgoi-enter`,
          ...local.style,
        }}
      >
        {local.children}
      </div>
    </Show>
  );
}
