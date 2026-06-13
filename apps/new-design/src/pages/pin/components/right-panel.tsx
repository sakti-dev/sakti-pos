import { useNavigate } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { CheckCircleIcon, DeleteIcon, UsersIcon } from "~/assets";
import { cn } from "~/lib/utils";

const DIGIT_RE = /^\d$/;

/* ── Types ────────────────────────────────────────────────────── */

export interface PinUser {
  readonly id: number;
  readonly initials: string;
  readonly name: string;
  readonly pin: string;
  readonly role: string;
  readonly venue: string;
}

/* ── Constants ────────────────────────────────────────────────── */

const MAX_PIN = 6;
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;

const SAMPLE_USERS: readonly PinUser[] = [
  {
    id: 1,
    name: "Yos Bb",
    role: "Manager",
    pin: "123456",
    initials: "YB",
    venue: "Tantri Cafe",
  },
  {
    id: 2,
    name: "Rina Sari",
    role: "Kasir",
    pin: "654321",
    initials: "RS",
    venue: "Tantri Cafe",
  },
  {
    id: 3,
    name: "Ahmad Fauzi",
    role: "Kasir",
    pin: "111111",
    initials: "AF",
    venue: "Tantri Cafe",
  },
] as const;

/* ── Component ────────────────────────────────────────────────── */

export function PinRightPanel() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = createSignal<PinUser>(SAMPLE_USERS[0]);
  const [pin, setPin] = createSignal("");
  const [error, setError] = createSignal("");
  const [attempts, setAttempts] = createSignal(0);
  const [locked, setLocked] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);
  const [showUserList, setShowUserList] = createSignal(false);

  let lockTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => clearTimeout(lockTimer));

  function resetPin() {
    setPin("");
    setError("");
    setLocked(false);
  }

  function selectUser(user: PinUser) {
    setCurrentUser(user);
    resetPin();
    setAttempts(0);
    setShowUserList(false);
    toast.success(`Akun dipilih: ${user.name}`);
  }

  function addDigit(d: string) {
    if (locked() || pin().length >= MAX_PIN) {
      return;
    }
    const next = pin() + d;
    setPin(next);
    if (next.length === MAX_PIN) {
      setTimeout(submitPin, 200);
    }
  }

  function removeDigit() {
    if (locked() || pin().length === 0) {
      return;
    }
    setPin(pin().slice(0, -1));
  }

  function submitPin() {
    if (locked() || pin().length !== MAX_PIN) {
      return;
    }
    if (pin() === currentUser().pin) {
      setShowSuccess(true);
      toast.success(`Selamat datang, ${currentUser().name.split(" ")[0]}!`);
      setTimeout(() => navigate("/"), 1200);
    } else {
      const nextAttempts = attempts() + 1;
      setAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLocked(true);
        setError("Terlalu banyak percobaan. Coba lagi nanti.");
        toast.error("Akun terkunci sementara");
        lockTimer = setTimeout(() => {
          setAttempts(0);
          resetPin();
        }, LOCK_DURATION_MS);
      } else {
        setError(
          `PIN salah (${MAX_ATTEMPTS - nextAttempts} percobaan tersisa)`
        );
        setPin("");
        setTimeout(() => setError(""), 700);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showUserList()) {
      if (e.key === "Escape") {
        setShowUserList(false);
      }
      return;
    }
    if (DIGIT_RE.test(e.key)) {
      addDigit(e.key);
    } else if (e.key === "Backspace") {
      removeDigit();
    } else if (e.key === "Enter" && pin().length === MAX_PIN) {
      submitPin();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    onCleanup(() => window.removeEventListener("keydown", handleKeydown));
  });

  const u = currentUser();

  return (
    <>
      {/* Right panel */}
      <div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background p-8 max-[900px]:min-h-screen max-[900px]:p-6">
        {/* Background decorative */}
        <div class="pointer-events-none absolute top-[15%] right-[-5%] h-[250px] w-[250px] rounded-full bg-[radial-gradient(circle,rgba(211,250,153,0.06)_0%,transparent_70%)]" />
        <div class="pointer-events-none absolute bottom-[10%] left-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(28,58,19,0.04)_0%,transparent_70%)]" />

        <div class="relative z-[1] flex w-full max-w-[400px] flex-col items-center gap-6 max-[480px]:gap-5">
          {/* Mobile logo (hidden on desktop) */}
          <div class="hidden h-14 w-14 place-items-center overflow-hidden rounded-lg border border-white/10 bg-card p-2.5 shadow-card max-[900px]:grid max-[900px]:place-items-center">
            <img
              alt=""
              class="h-full w-full object-contain"
              height={36}
              src="/logo.png"
              width={36}
            />
          </div>

          {/* Greeting */}
          <div class="font-medium text-[14px] text-faint-foreground tracking-[0.02em]">
            Selamat datang kembali
          </div>

          {/* User info */}
          <div class="flex flex-col items-center gap-3">
            <div class="relative grid h-[88px] w-[88px] animate-avatar-pulse place-items-center rounded-full border-[3px] border-accent/20 bg-accent-soft font-display font-extrabold text-[32px] text-primary max-[480px]:h-[76px] max-[480px]:w-[76px] max-[480px]:text-[28px] dark:text-accent">
              {u.initials}
              <span class="absolute right-1 bottom-1 h-4 w-4 rounded-full border-[3px] border-card bg-accent" />
            </div>
            <div class="font-bold font-display text-[24px] text-foreground tracking-[-0.02em] max-[480px]:text-[22px]">
              {u.name}
            </div>
            <div class="-mt-1.5 font-medium text-[13px] text-faint-foreground tracking-[0.02em]">
              {u.role} · {u.venue}
            </div>
          </div>

          {/* Title */}
          <div class="text-center font-medium text-[15px] text-muted-foreground leading-relaxed tracking-[0.01em]">
            Masukkan PIN untuk melanjutkan
          </div>

          {/* PIN dots */}
          <fieldset
            aria-label="PIN input"
            class="flex justify-center gap-[18px] border-none px-0 py-2 max-[480px]:gap-[14px]"
          >
            <For each={Array.from({ length: MAX_PIN })}>
              {(_, i) => {
                const dotClass = () => {
                  if (error()) {
                    return "h-4 w-4 animate-shake rounded-full border-2 border-[var(--color-destructive)] bg-[var(--color-destructive)] ring-4 ring-destructive/10";
                  }
                  if (i() < pin().length) {
                    return "h-4 w-4 scale-125 rounded-full border-2 border-primary bg-primary ring-4 ring-primary/10 dark:border-accent dark:bg-accent";
                  }
                  return "h-4 w-4 rounded-full border-2 border-border bg-transparent transition-[background,border-color,transform,box-shadow] duration-200 max-[480px]:h-[14px] max-[480px]:w-[14px]";
                };
                return (
                  <div
                    class={dotClass()}
                    style={{
                      "transition-timing-function":
                        "cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                  />
                );
              }}
            </For>
          </fieldset>

          {/* Error message */}
          <div
            class={cn(
              "min-h-[18px] text-center font-medium text-[13px] text-[var(--color-destructive)] tracking-[0.01em] transition-[opacity,transform] duration-200",
              !error() && "-translate-y-1 opacity-0",
              !!error() && "translate-y-0 opacity-100"
            )}
            role="alert"
          >
            {error() || "PIN salah, coba lagi"}
          </div>

          {/* Numpad */}
          <fieldset
            aria-label="Numpad"
            class="grid w-full max-w-[280px] grid-cols-3 gap-2.5 border-none p-0 max-[480px]:max-w-[260px] max-[480px]:gap-2"
          >
            <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "back"]}>
              {(key) => {
                if (key === null) {
                  return <div class="h-[60px] max-[480px]:h-14" />;
                }
                if (key === "back") {
                  return (
                    <button
                      aria-label="Hapus"
                      class="flex h-[60px] items-center justify-center rounded-[14px] border border-border bg-card text-muted-foreground shadow-none transition-[background,transform] duration-150 hover:border-destructive/20 hover:bg-destructive/5 hover:text-[var(--color-destructive)] active:scale-[0.94] active:bg-destructive/10 max-[480px]:h-14"
                      onClick={removeDigit}
                      type="button"
                    >
                      <DeleteIcon class="h-[22px] w-[22px]" />
                    </button>
                  );
                }
                return (
                  <button
                    aria-label={String(key)}
                    class="grid h-[60px] place-items-center rounded-[14px] border-none bg-card font-display font-semibold text-[22px] text-foreground shadow-card transition-[background,transform,box-shadow] duration-150 hover:bg-accent-soft hover:shadow-card-hover active:scale-[0.94] active:bg-accent/10 max-[480px]:h-14 max-[480px]:text-[20px]"
                    onClick={[addDigit, String(key)]}
                    type="button"
                  >
                    {key}
                  </button>
                );
              }}
            </For>
          </fieldset>

          {/* Switch account */}
          <div class="mt-1 flex items-center gap-2">
            <button
              aria-label="Ganti akun"
              class="flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-5 py-2.5 font-medium text-[13px] text-faint-foreground tracking-[0.01em] transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary/5 hover:text-foreground"
              onClick={() => setShowUserList(true)}
              type="button"
            >
              <UsersIcon class="h-[15px] w-[15px]" />
              Ganti Akun
            </button>
          </div>
        </div>
      </div>

      {/* User list overlay */}
      <Show when={showUserList()}>
        <div class="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-background p-6">
          <div class="flex w-full max-w-[500px] flex-col gap-6">
            <div class="flex flex-col items-center gap-2">
              <div class="font-bold font-display text-[24px] text-foreground tracking-[-0.02em]">
                Pilih Akun
              </div>
              <div class="font-medium text-[14px] text-faint-foreground">
                Siapa yang akan menggunakan perangkat ini?
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 max-[480px]:grid-cols-2">
              <For each={SAMPLE_USERS}>
                {(user, i) => (
                  <button
                    aria-label={`${user.name}, ${user.role}`}
                    class="flex animate-stagger-in flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-3 py-6 shadow-card transition-[border-color,background,transform,box-shadow] duration-200 hover:border-accent hover:bg-accent-soft hover:shadow-card-hover active:scale-[0.97]"
                    onClick={[selectUser, user]}
                    style={{ "animation-delay": `${i() * 0.08}s` }}
                    type="button"
                  >
                    <div class="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-accent/20 bg-accent-soft font-display font-extrabold text-[18px] text-primary dark:text-accent">
                      {user.initials}
                    </div>
                    <div class="text-center font-display font-semibold text-[14px] text-foreground">
                      {user.name}
                    </div>
                    <div class="font-medium text-[12px] text-faint-foreground tracking-[0.01em]">
                      {user.role}
                    </div>
                  </button>
                )}
              </For>
            </div>

            <div class="text-center">
              <button
                aria-label="Batal"
                class="flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-5 py-2.5 font-medium text-[13px] text-faint-foreground tracking-[0.01em] transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary/5 hover:text-foreground"
                onClick={() => setShowUserList(false)}
                type="button"
              >
                <UsersIcon class="h-[15px] w-[15px]" />
                Batal
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Success overlay */}
      <Show when={showSuccess()}>
      <div class="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-[linear-gradient(135deg,#0b5239,#063a28)]">
          <div class="flex animate-success-pop flex-col items-center gap-4">
            <div class="grid h-20 w-20 place-items-center rounded-full bg-accent/15 text-accent shadow-card">
              <CheckCircleIcon class="h-9 w-9" />
            </div>
            <div class="font-bold font-display text-[24px] text-white tracking-[-0.02em]">
              Berhasil masuk
            </div>
            <div class="font-medium text-[14px] text-white/55">
              Mengalihkan ke dashboard...
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
