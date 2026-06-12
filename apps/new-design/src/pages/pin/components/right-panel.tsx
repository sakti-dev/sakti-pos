import { useNavigate } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { CheckCircleIcon, DeleteIcon, UsersIcon } from "~/assets";

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
      <div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-cream p-8 max-[900px]:min-h-screen max-[900px]:p-6 dark:bg-[#0a0a0a]">
        {/* Background decorative */}
        <div class="pointer-events-none absolute top-[15%] right-[-5%] h-[250px] w-[250px] rounded-full bg-[radial-gradient(circle,rgba(60,208,112,0.06)_0%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(60,208,112,0.03)_0%,transparent_70%)]" />
        <div class="pointer-events-none absolute bottom-[10%] left-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(9,73,51,0.04)_0%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(60,208,112,0.02)_0%,transparent_70%)]" />

        <div class="relative z-[1] flex w-full max-w-[400px] flex-col items-center gap-6 max-[480px]:gap-5">
          {/* Mobile logo (hidden on desktop) */}
          <div class="hidden h-14 w-14 place-items-center overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface p-2.5 shadow-[0_2px_12px_rgba(9,73,51,0.08)] max-[900px]:grid max-[900px]:place-items-center dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
            <img
              alt=""
              class="h-full w-full object-contain"
              height={36}
              src="/logo.png"
              width={36}
            />
          </div>

          {/* Greeting */}
          <div class="font-medium text-[14px] text-text-muted tracking-[0.02em]">
            Selamat datang kembali
          </div>

          {/* User info */}
          <div class="flex flex-col items-center gap-3">
            <div class="relative grid h-[88px] w-[88px] animate-avatar-pulse place-items-center rounded-full border-[3px] border-[rgba(60,208,112,0.20)] bg-accent-2 font-display font-extrabold text-[32px] text-primary max-[480px]:h-[76px] max-[480px]:w-[76px] max-[480pts]:text-[28px] dark:border-[rgba(60,208,112,0.15)] dark:bg-[rgba(60,208,112,0.08)] dark:text-accent">
              {u.initials}
              <span class="absolute right-1 bottom-1 h-4 w-4 rounded-full border-[3px] border-surface bg-accent dark:border-[#1a1a1a]" />
            </div>
            <div class="font-bold font-display text-[24px] text-text tracking-[-0.02em] max-[480px]:text-[22px] dark:text-[#ededed]">
              {u.name}
            </div>
            <div class="-mt-1.5 font-medium text-[13px] text-text-muted tracking-[0.02em]">
              {u.role} · {u.venue}
            </div>
          </div>

          {/* Title */}
          <div class="text-center font-medium text-[15px] text-text-secondary leading-relaxed tracking-[0.01em]">
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
                    return "h-4 w-4 animate-shake rounded-full border-2 border-[var(--color-error)] bg-[var(--color-error)] shadow-[0_0_0_4px_rgba(239,68,68,0.10)] dark:border-[#f87171] dark:bg-[#f87171]";
                  }
                  if (i() < pin().length) {
                    return "h-4 w-4 scale-125 rounded-full border-2 border-primary bg-primary shadow-[0_0_0_4px_rgba(9,73,51,0.10)] dark:border-accent dark:bg-accent dark:shadow-[0_0_0_4px_rgba(60,208,112,0.12)]";
                  }
                  return "h-4 w-4 rounded-full border-2 border-border bg-transparent transition-[background,border-color,transform,box-shadow] duration-200 max-[480px]:h-[14px] max-[480px]:w-[14px] dark:border-[#3a3a3a]";
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
            class="min-h-[18px] text-center font-medium text-[13px] text-[var(--color-error)] tracking-[0.01em] transition-[opacity,transform] duration-200"
            classList={{
              "opacity-0 -translate-y-1": !error(),
              "opacity-100 translate-y-0": !!error(),
            }}
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
                      class="flex h-[60px] items-center justify-center rounded-[14px] border border-border bg-surface text-text-secondary shadow-none transition-[background,transform] duration-150 hover:border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.06)] hover:text-[var(--color-error)] active:scale-[0.94] active:bg-[rgba(239,68,68,0.10)] max-[480px]:h-14 dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:text-[#93939f] dark:active:bg-[rgba(248,113,113,0.10)] dark:hover:border-[rgba(248,113,113,0.15)] dark:hover:bg-[rgba(248,113,113,0.08)] dark:hover:text-[#f87171]"
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
                    class="grid h-[60px] place-items-center rounded-[14px] border-none bg-surface font-display font-semibold text-[22px] text-text shadow-[0_1px_3px_rgba(9,73,51,0.06)] transition-[background,transform,box-shadow] duration-150 hover:bg-accent-2 hover:shadow-[0_2px_8px_rgba(60,208,112,0.08)] active:scale-[0.94] active:bg-[rgba(60,208,112,0.12)] max-[480px]:h-14 max-[480px]:text-[20px] dark:bg-[#222] dark:text-[#ededed] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)] dark:active:bg-[rgba(60,208,112,0.12)] dark:hover:bg-[rgba(60,208,112,0.08)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
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
              class="flex items-center gap-1.5 rounded-pill border border-transparent bg-transparent px-5 py-2.5 font-medium text-[13px] text-text-muted tracking-[0.01em] transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary-light hover:text-text dark:hover:border-[#333] dark:hover:bg-[rgba(60,208,112,0.08)] dark:hover:text-[#ededed]"
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
        <div class="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-cream p-6 dark:bg-[#0a0a0a]">
          <div class="flex w-full max-w-[500px] flex-col gap-6">
            <div class="flex flex-col items-center gap-2">
              <div class="font-bold font-display text-[24px] text-text tracking-[-0.02em] dark:text-[#ededed]">
                Pilih Akun
              </div>
              <div class="font-medium text-[14px] text-text-muted">
                Siapa yang akan menggunakan perangkat ini?
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 max-[480px]:grid-cols-2">
              <For each={SAMPLE_USERS}>
                {(user, i) => (
                  <button
                    aria-label={`${user.name}, ${user.role}`}
                    class="flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-border bg-surface px-3 py-6 shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-[border-color,background,transform,box-shadow] duration-200 hover:border-accent hover:bg-accent-2 hover:shadow-[0_4px_16px_rgba(60,208,112,0.08)] active:scale-[0.97] dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:hover:border-[rgba(60,208,112,0.3)] dark:hover:bg-[rgba(60,208,112,0.06)]"
                    classList={{
                      "animate-stagger-in": true,
                    }}
                    onClick={[selectUser, user]}
                    style={{ "animation-delay": `${i() * 0.08}s` }}
                    type="button"
                  >
                    <div class="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-[rgba(60,208,112,0.20)] bg-accent-2 font-display font-extrabold text-[18px] text-primary dark:border-[rgba(60,208,112,0.15)] dark:bg-[rgba(60,208,112,0.08)] dark:text-accent">
                      {user.initials}
                    </div>
                    <div class="text-center font-display font-semibold text-[14px] text-text dark:text-[#ededed]">
                      {user.name}
                    </div>
                    <div class="font-medium text-[12px] text-text-muted tracking-[0.01em]">
                      {user.role}
                    </div>
                  </button>
                )}
              </For>
            </div>

            <div class="text-center">
              <button
                aria-label="Batal"
                class="flex items-center gap-1.5 rounded-pill border border-transparent bg-transparent px-5 py-2.5 font-medium text-[13px] text-text-muted tracking-[0.01em] transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary-light hover:text-text dark:hover:border-[#333] dark:hover:bg-[rgba(60,208,112,0.08)] dark:hover:text-[#ededed]"
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
        <div class="fixed inset-0 z-[1000] flex animate-fade-in items-center justify-center bg-[linear-gradient(135deg,#0b5239,#063a28)] dark:bg-[linear-gradient(135deg,#0d2e1f,#091e14)]">
          <div class="flex animate-success-pop flex-col items-center gap-4">
            <div class="grid h-20 w-20 place-items-center rounded-full bg-[rgba(60,208,112,0.15)] text-accent shadow-[0_8px_32px_rgba(60,208,112,0.20)]">
              <CheckCircleIcon class="h-9 w-9" />
            </div>
            <div class="font-bold font-display text-[24px] text-white tracking-[-0.02em]">
              Berhasil masuk
            </div>
            <div class="font-medium text-[14px] text-[rgba(255,255,255,0.55)]">
              Mengalihkan ke dashboard...
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
