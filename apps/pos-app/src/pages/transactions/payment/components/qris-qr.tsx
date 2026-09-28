import QRCode from "qrcode";
import { createEffect, createSignal, Show } from "solid-js";

/**
 * Render a QRIS payload string as a QR code. Falls back to the raw payload
 * text when rendering fails (never a blank panel).
 */
export function QRisQR(props: {
  readonly payload: string | null;
  readonly width?: number;
}) {
  const [failed, setFailed] = createSignal(false);
  let canvasRef: HTMLCanvasElement | undefined;

  createEffect(() => {
    const payload = props.payload;
    const canvas = canvasRef;
    if (!(payload && canvas)) {
      return;
    }
    QRCode.toCanvas(canvas, payload, { margin: 1, width: props.width ?? 200 })
      .then(() => {
        setFailed(false);
      })
      .catch(() => {
        setFailed(true);
      });
  });

  return (
    <div class="relative" style={{ width: `${props.width ?? 200}px` }}>
      <canvas
        class={failed() || !props.payload ? "hidden" : ""}
        ref={(el) => {
          canvasRef = el;
        }}
      />
      <Show when={failed()}>
        <div class="max-w-[200px] break-all text-center font-mono text-[10px] text-muted-foreground leading-tight">
          {props.payload}
        </div>
      </Show>
      <Show when={!props.payload}>
        <div class="grid h-[200px] w-[200px] place-items-center text-caption text-faint-foreground">
          Total belum tersedia
        </div>
      </Show>
    </div>
  );
}
