import { useNavigate } from "@solidjs/router";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import { toast } from "solid-sonner";
import { verifyPin } from "~/lib/auth/provider";
import type { AuthUser } from "~/store/auth";
import { LOCK_DURATION_MS, MAX_ATTEMPTS, MAX_PIN, type PinUser } from "./types";

const routeForRole = (role: string) => (role === "cashier" ? "/pos" : "/");

export interface UsePinAuthOptions {
  readonly onSuccess: (authUser: AuthUser) => void;
  readonly user: Accessor<PinUser>;
}

export function usePinAuth(options: UsePinAuthOptions) {
  const navigate = useNavigate();

  const [pin, setPin] = createSignal("");
  const [error, setError] = createSignal("");
  const [attempts, setAttempts] = createSignal(0);
  const [locked, setLocked] = createSignal(false);
  const [verifying, setVerifying] = createSignal(false);

  let lockTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(lockTimer));

  function reset() {
    setPin("");
    setError("");
    setAttempts(0);
    setLocked(false);
  }

  async function submit() {
    if (locked() || pin().length !== MAX_PIN || verifying()) {
      return;
    }
    setVerifying(true);
    try {
      const authUser = await verifyPin(options.user().id, pin());
      options.onSuccess(authUser);
      toast.success(`Selamat datang, ${authUser.name.split(" ")[0]}!`);
      setTimeout(
        () => navigate(routeForRole(authUser.role), { replace: true }),
        1200
      );
    } catch (err) {
      const nextAttempts = attempts() + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLocked(true);
        setError("Terlalu banyak percobaan. Coba lagi nanti.");
        toast.error("Akun terkunci sementara");
        lockTimer = setTimeout(reset, LOCK_DURATION_MS);
      } else {
        const msg = err instanceof Error ? err.message : "PIN salah";
        setError(`${msg} (${MAX_ATTEMPTS - nextAttempts} percobaan tersisa)`);
        setTimeout(() => setPin(""), 500);
        setTimeout(() => setError(""), 3000);
      }
    } finally {
      setVerifying(false);
    }
  }

  function addDigit(d: string) {
    if (locked() || verifying() || pin().length >= MAX_PIN) {
      return;
    }
    const next = pin() + d;
    setPin(next);
    if (next.length === MAX_PIN) {
      setTimeout(submit, 200);
    }
  }

  function removeDigit() {
    if (locked() || verifying() || pin().length === 0) {
      return;
    }
    setPin(pin().slice(0, -1));
  }

  return {
    pin,
    error,
    locked,
    addDigit,
    removeDigit,
    submit,
    reset,
    verifying,
  };
}
