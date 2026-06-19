import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { UsersIcon } from "~/assets";
import { Numpad, PinDots, SuccessOverlay, UserCard } from "~/components/pin";
import { Button } from "~/components/ui/button";
import { getActiveStaff } from "~/lib/auth/session";
import { cn } from "~/lib/utils";
import { DIGIT_RE, MAX_PIN, type PinUser } from "../types";
import { usePinAuth } from "../use-pin-auth";
import { AccountSelector } from "./account-selector";

function toPinUser(staff: { id: string; name: string; role: string }): PinUser {
  const parts = staff.name.split(" ");
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts.at(-1)![0]}`
      : staff.name.slice(0, 2).toUpperCase();
  return {
    id: staff.id,
    initials: initials.toUpperCase(),
    name: staff.name,
    role: staff.role.charAt(0).toUpperCase() + staff.role.slice(1),
    venue: "", // outlet name not in staff row; could be fetched
  };
}

export function PinRightPanel() {
  const [staffList, setStaffList] = createSignal<PinUser[]>([]);
  const [currentUser, setCurrentUser] = createSignal<PinUser | null>(null);
  const [showUserList, setShowUserList] = createSignal(false);
  const [showSuccess, setShowSuccess] = createSignal(false);

  const auth = usePinAuth({
    user: () => currentUser()!,
    onSuccess: () => setShowSuccess(true),
  });

  onMount(async () => {
    try {
      const activeStaff = await getActiveStaff();
      const users = activeStaff.map(toPinUser);
      setStaffList(users);
      if (users.length > 0) {
        setCurrentUser(users[0]);
      }
    } catch {
      // DB not ready yet — could show error or retry
    }
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
      <div class="relative flex min-h-screen flex-1 flex-col items-center overflow-y-auto overflow-x-hidden bg-background p-6 pt-10 lg:p-8">
        <div class="relative z-10 flex w-full max-w-[400px] flex-col items-center gap-5 sm:gap-6">
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
            <div class="font-medium text-body-sm text-faint-foreground tracking-wide">
              Selamat datang kembali
            </div>
          </div>

          {/* User info */}
          <Show
            fallback={
              <div class="text-center text-muted-foreground text-sm">
                Memuat data...
              </div>
            }
            when={currentUser()}
          >
            <UserCard user={currentUser()!} />
          </Show>

          {/* Title */}
          <div class="text-center font-medium text-body text-muted-foreground leading-relaxed tracking-normal">
            Masukkan PIN untuk melanjutkan
          </div>

          {/* PIN dots */}
          <PinDots hasError={!!auth.error()} length={auth.pin().length} />

          {/* Error message */}
          <div
            class={cn(
              "min-h-5 text-center font-medium text-body-sm text-danger transition duration-200",
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
          <div class="mt-1 flex items-center justify-center">
            <Button
              class="rounded-full px-5 py-2.5 text-faint-foreground hover:text-foreground"
              look="outline"
              onClick={() => setShowUserList(true)}
              tone="neutral"
            >
              <UsersIcon class="h-[15px] w-[15px]" />
              Ganti Akun
            </Button>
          </div>
        </div>
      </div>

      {/* Account selector overlay — AnimatePresence for exit animation */}
      <AccountSelector
        onCancel={() => setShowUserList(false)}
        onSelect={selectUser}
        open={showUserList()}
        users={staffList()}
      />

      {/* Success overlay */}
      <SuccessOverlay show={showSuccess()} />
    </>
  );
}
