import { type JSX, Show } from "solid-js";
import { cn } from "~/lib/utils";

/**
 * Three-zone layout for "list + pinned actions" screens.
 *
 *   ┌──────────────────────────────────┐
 *   │ top        (shrink-0, pinned)    │  search / description
 *   ├──────────────────────────────────┤
 *   │ ┌──────────────────────────────┐ │
 *   │ │ scroll card                  │ │  ← children (table/list)
 *   │ │  shrink-wraps when short,    │ │     grow-0 + min-h-0
 *   │ │  caps + scrolls when tall    │ │
 *   │ └──────────────────────────────┘ │
 *   ├──────────────────────────────────┤
 *   │ spacer     (flex-1, absorbs slack)│  ← invisible; pins footer down
 *   ├──────────────────────────────────┤
 *   │ footer     (shrink-0, pinned)    │  reason input / Save / Cancel
 *   └──────────────────────────────────┘
 *
 * Why grow-0 + a spacer (instead of flex-1 on the card):
 * `flex-1`/`1fr` forces the card to fill all remaining height regardless of
 * content → an empty bordered box hangs below a short list. `grow-0` makes the
 * card hug its content (short lists shrink-wrap tight), and the spacer absorbs
 * the leftover space so the footer stays pinned to the bottom. When the list is
 * tall, the card's basis exceeds the viewport, `shrink` + `min-h-0` kick in,
 * the card caps and scrolls, and the spacer collapses to 0.
 *
 * The scroll card carries `overflow-y-auto` AND `border-radius` on the same
 * element deliberately: that combination clips any `position: sticky` child's
 * rounded corners, preventing body rows from peeking through the notches.
 */
export interface ScrollCardShellProps {
  /** Extra classes on the scroll card (border/radius/margin overrides). */
  readonly cardClass?: string;
  readonly children: JSX.Element;
  /** Extra classes on the root flex column. */
  readonly class?: string;
  readonly footer?: JSX.Element;
  readonly top?: JSX.Element;
}

export function ScrollCardShell(props: ScrollCardShellProps) {
  return (
    <div
      class={cn("flex min-h-0 flex-1 flex-col overflow-hidden", props.class)}
    >
      <Show when={props.top}>
        <div class="shrink-0">{props.top}</div>
      </Show>

      <div
        class={cn(
          "scrollbar-none mx-4 mb-3 min-h-0 grow-0 overflow-y-auto rounded-lg border border-border lg:mx-6",
          props.cardClass
        )}
      >
        {props.children}
      </div>

      {/* Growth spacer: absorbs leftover space when the card is short. Must
          stay between the card and the footer. Collapses to 0 when the card
          grows to fill the viewport. */}
      <div class="min-h-0 flex-1" />

      <Show when={props.footer}>
        <div class="shrink-0">{props.footer}</div>
      </Show>
    </div>
  );
}
