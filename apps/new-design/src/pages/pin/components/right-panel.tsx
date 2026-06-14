import { createSignal, onCleanup, onMount } from "solid-js";
import { toast } from "solid-sonner";
import { UsersIcon } from "~/assets";
import { cn } from "~/lib/utils";
import { DIGIT_RE, MAX_PIN, type PinUser, SAMPLE_USERS } from "../types";
import { usePinAuth } from "../use-pin-auth";
import { AccountSelector } from "./account-selector";
import { Numpad } from "./numpad";
import { PinDots } from "./pin-dots";
import { SuccessOverlay } from "./success-overlay";
import { UserCard } from "./user-card";

export function PinRightPanel() {
  const [currentUser, setCurrentUser] = createSignal<PinUser>(SAMPLE_USERS[0]);
  const [showUserList, setShowUserList] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);

  const auth = usePinAuth({
    user: currentUser,
    onSuccess: () => setShowSuccess(true),
  });

  function selectUser(user: PinUser) {
    setCurrentUser(user);
    auth.reset();
    setShowUserList(false);
    toast.success(`Akun dipilih: ${user.name}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showUserList()) {
      if (e.key === "Escape") {
        setShowUserList(false);
      }
      return;
    }
    if (DIGIT_RE.test(e.key)) {
      auth.addDigit(e.key);
    } else if (e.key === "Backspace") {
      auth.removeDigit();
    } else if (e.key === "Enter" && auth.pin().length === MAX_PIN) {
      auth.submit();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    onCleanup(() => window.removeEventListener("keydown", handleKeydown));
  });

  return (
    <>
      {/* Right panel */}
      <div class="relative flex flex-1 flex-col items-center overflow-y-auto overflow-x-hidden bg-background p-8 max-[900px]:min-h-screen max-[900px]:p-6">
        <div class="relative z-[1] my-auto flex w-full max-w-[400px] flex-col items-center gap-6 max-[480px]:gap-5">
          {/* Mobile logo (hidden on desktop) */}
          <div>
            <div class="flex flex-col items-center gap-3 lg:hidden">
              <img
                alt="Nata POS"
                class="h-12 w-12 rounded-sm object-contain"
                height={48}
                src="/logo.png"
                width={48}
              />
              <span class="font-bold font-display text-heading-sm text-primary dark:text-foreground">
                Nata POS
              </span>
            </div>

            {/* Greeting */}
            <div class="font-medium text-body-sm text-faint-foreground tracking-[0.02em]">
              Selamat datang kembali
            </div>
          </div>

          {/* User info */}
          <UserCard user={currentUser()} />

          {/* Title */}
          <div class="text-center font-medium text-body text-muted-foreground leading-relaxed tracking-[0.01em]">
            Masukkan PIN untuk melanjutkan
          </div>

          {/* PIN dots */}
          <PinDots hasError={!!auth.error()} length={auth.pin().length} />

          {/* Error message */}
          <div
            class={cn(
              "min-h-[18px] text-center font-medium text-body-sm text-destructive transition-[opacity,transform] duration-200",
              !auth.error() && "-translate-y-1 opacity-0",
              !!auth.error() && "translate-y-0 opacity-100"
            )}
            role="alert"
          >
            {auth.error() || "PIN salah, coba lagi"}
          </div>

          {/* Numpad */}
          <Numpad
            disabled={auth.locked()}
            onBackspace={auth.removeDigit}
            onDigit={auth.addDigit}
          />

          {/* Switch account */}
          <div class="mt-1 flex items-center gap-2">
            <button
              aria-label="Ganti akun"
              class="flex items-center gap-1.5 rounded-full border border-transparent bg-transparent px-5 py-2.5 font-medium text-body-sm text-faint-foreground transition-[background,color,border-color] duration-150 hover:border-border hover:bg-primary/5 hover:text-foreground"
              onClick={() => setShowUserList(true)}
              type="button"
            >
              <UsersIcon class="h-[15px] w-[15px]" />
              Ganti Akun
            </button>
          </div>
        </div>
      </div>

      {/* Account selector overlay — AnimatePresence for exit animation */}
      <AccountSelector
        onCancel={() => setShowUserList(false)}
        onSelect={selectUser}
        open={showUserList()}
      />

      {/* Success overlay */}
      <SuccessOverlay show={showSuccess()} />
    </>
  );
}
