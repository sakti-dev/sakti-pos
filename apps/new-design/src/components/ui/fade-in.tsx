import { type JSX, splitProps } from "solid-js";

type FadeInProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
  /** Seconds to wait before starting */
  delay?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Initial vertical offset in px (animates to 0) */
  y?: number;
  /** Initial horizontal offset in px (animates to 0) */
  x?: number;
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
    "style",
    "class",
    "children",
  ]);

  return (
    <div
      {...rest}
      class={local.class}
      style={{
        "--enter-y": `${local.y ?? 12}px`,
        "--enter-x": `${local.x ?? 0}px`,
        "animation": `${local.duration ?? 0.45}s ${EASE} ${local.delay ?? 0}s both ssgoi-enter`,
        ...local.style,
      }}
      onAnimationEnd={(e) => {
        e.currentTarget.style.animation = "none";
        rest.onAnimationEnd?.(e);
      }}
    >
      {local.children}
    </div>
  );
}
