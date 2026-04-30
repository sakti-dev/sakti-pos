import { createSignal, Show } from "solid-js";
import { clsx } from "clsx";
import PinPad from "./PinPad";
import { changePin } from "~/lib/auth-provider";

interface ChangePinDialogProps {
  userId: number;
  onClose: () => void;
  onComplete: () => void;
}

export default function ChangePinDialog(props: ChangePinDialogProps) {
  const [step, setStep] = createSignal<"new" | "confirm">("new");
  const [newPin, setNewPin] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleNewPin = (pin: string) => {
    setNewPin(pin);
    setStep("confirm");
  };

  const handleConfirmPin = async (pin: string) => {
    if (pin !== newPin()) {
      setError("PIN tidak cocok");
      setNewPin("");
      setStep("new");
      return;
    }

    setLoading(true);
    try {
      await changePin(props.userId, pin);
      props.onComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div
        class="bg-card rounded-2xl p-6 w-full max-w-sm flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="text-lg font-semibold">
          {step() === "new" ? "PIN Baru" : "Konfirmasi PIN"}
        </h2>

        <Show when={step() === "confirm"}>
          <p class="text-xs text-muted-foreground">
            Masukkan PIN sekali lagi untuk konfirmasi
          </p>
        </Show>

        <Show when={error()}>
          <div class="text-sm text-destructive">{error()}</div>
        </Show>

        <PinPad
          onSubmit={step() === "new" ? handleNewPin : handleConfirmPin}
          disabled={loading()}
          maxLength={6}
        />

        <button
          type="button"
          onClick={props.onClose}
          class={clsx(
            "text-sm text-muted-foreground hover:text-foreground",
            loading() && "opacity-50",
          )}
          disabled={loading()}
        >
          Batal
        </button>
      </div>
    </div>
  );
}
