import type { SsgoiConfig, SsgoiPathTransition } from "@ssgoi/solid";
import { MultiAnimation, WebAnimation } from "@ssgoi/solid";
import { drill, fade } from "@ssgoi/solid/view-transitions";

/* ── minimal spring integrator ────────────────────────────────── */

interface SpringState {
  position: number;
  velocity: number;
}

/** Simple damped spring — same math SSGOI uses internally. */
function createSpringIntegrator(stiffness = 170, damping = 22) {
  return {
    step(state: SpringState, target: number, dt: number): SpringState {
      const displacement = state.position - target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * state.velocity;
      const acceleration = springForce + dampingForce;
      const newVelocity = state.velocity + acceleration * dt;
      const newPosition = state.position + newVelocity * dt;
      return { position: newPosition, velocity: newVelocity };
    },
    isSettled(state: SpringState, target: number): boolean {
      return (
        Math.abs(state.position - target) < 0.01 &&
        Math.abs(state.velocity) < 0.01
      );
    },
  };
}

/* ── adaptive slide (shell pages) ─────────────────────────────── */

const SPRING = createSpringIntegrator(170, 22);

/** Below this breakpoint the sidebar hides → use horizontal slide. */
const MOBILE_BREAKPOINT = 900;

/**
 * Slide that adapts to viewport:
 *   desktop (≥900px): vertical — matches sidebar nav top-to-bottom order
 *   mobile  (<900px):  horizontal — matches bottom nav left-to-right order
 */
function adaptiveSlide(direction: "forward" | "backward") {
  const isForward = direction === "forward";

  return {
    prepare: ({
      from,
      to,
    }: {
      from: Promise<HTMLElement>;
      to: Promise<HTMLElement>;
    }) => {
      from.then((el) => {
        el.style.willChange = "transform";
        el.style.backfaceVisibility = "hidden";
        (el.style as CSSStyleDeclaration & { contain: string }).contain =
          "layout paint";
        el.style.pointerEvents = "none";
      });
      to.then((el) => {
        const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
        const start = isForward ? 100 : -100;
        el.style.transform = isMobile
          ? `translate3d(${start}%, 0, 0)`
          : `translate3d(0, ${start}%, 0)`;
        el.style.willChange = "transform";
        el.style.backfaceVisibility = "hidden";
        (el.style as CSSStyleDeclaration & { contain: string }).contain =
          "layout paint";
      });
      return {};
    },
    animation: ({ from, to }: { from: HTMLElement; to: HTMLElement }) => {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;

      const outAnim = new WebAnimation({
        element: from,
        integrator: SPRING,
        style: (t: number) => {
          const exit = isForward ? -100 * t : 100 * t;
          return isMobile
            ? { transform: `translate3d(${exit}%, 0, 0)` }
            : { transform: `translate3d(0, ${exit}%, 0)` };
        },
        onComplete: () => {
          from.style.willChange = "auto";
          from.style.backfaceVisibility = "";
          (from.style as CSSStyleDeclaration & { contain: string }).contain =
            "";
          from.style.transform = "";
          from.style.pointerEvents = "";
        },
      });

      const inAnim = new WebAnimation({
        element: to,
        integrator: SPRING,
        style: (_t: number, u: number) => {
          const enter = isForward ? u * 100 : u * -100;
          return isMobile
            ? { transform: `translate3d(${enter}%, 0, 0)` }
            : { transform: `translate3d(0, ${enter}%, 0)` };
        },
        onComplete: () => {
          to.style.willChange = "auto";
          to.style.backfaceVisibility = "";
          (to.style as CSSStyleDeclaration & { contain: string }).contain = "";
          to.style.transform = "";
        },
      });

      return new MultiAnimation([outAnim, inAnim], { mode: "parallel" });
    },
  };
}

/* ── ordered path transitions ──────────────────────────────────── */

const SHELL_PATHS = ["/", "/transactions", "/pengaturan"] as const;

function createSlideTransitions(): SsgoiPathTransition[] {
  const transitions: SsgoiPathTransition[] = [];

  for (let i = 0; i < SHELL_PATHS.length; i++) {
    for (let j = i + 1; j < SHELL_PATHS.length; j++) {
      const from = SHELL_PATHS[i];
      const to = SHELL_PATHS[j];
      if (!(from && to)) {
        continue;
      }
      transitions.push(
        { from, to, transition: adaptiveSlide("forward") },
        { from: to, to: from, transition: adaptiveSlide("backward") }
      );
    }
  }

  return transitions;
}

/* ── shell config ──────────────────────────────────────────────── */

/**
 * Shell page transition config — used inside AppShell's <main>.
 * Adapts to viewport:
 *   desktop (≥900px): vertical slide — matches sidebar nav top-to-bottom
 *   mobile  (<900px): horizontal slide — matches bottom nav left-to-right
 */
export const shellConfig: SsgoiConfig = {
  transitions: createSlideTransitions(),
};

/* ── flow config (transaction-new → payment → receipt) ────────── */

/**
 * Transaction flow transition config.
 *
 * drill(parallax): iOS-style hierarchical navigation.
 *   /transaction-new → /payment → /receipt = drill in (page slides right, bg eases left)
 *   /receipt → /payment → /transaction-new = drill out (reverse)
 */
export const flowConfig: SsgoiConfig = {
  transitions: [
    drill({ enter: "/payment", exit: "/transaction-new", type: "parallax" }),
    drill({ enter: "/receipt", exit: "/payment", type: "parallax" }),
  ],
};

/* ── auth config (login ↔ register ↔ pin) ─────────────────────── */

/**
 * Auth page transition config — calm cross-fade between auth pages.
 */
export const authConfig: SsgoiConfig = {
  transitions: [fade({ paths: ["/login", "/register", "/pin"] })],
};
