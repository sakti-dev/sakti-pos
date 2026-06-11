import { useNavigate } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { cardVariants } from "~/components/ui/card";
import PinPad from "~/components/ui/pinpad";
import { isCloudAuthenticated } from "~/lib/auth/cloud";
import { cn } from "~/lib/utils";
import {
  type AuthUser,
  getActiveStaff,
  getLastUserId,
  login,
  setScope,
} from "~/store/auth";
import { currentMerchantId, currentOutletId } from "~/store/outlet";
import { useIsLandscape } from "~/store/responsive";

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000;

export default function LocalAuth() {
  const navigate = useNavigate();
  const isLandscape = useIsLandscape();
  const [users, setUsers] = createSignal<AuthUser[]>([]);
  const [selectedUser, setSelectedUser] = createSignal<AuthUser | null>(null);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [pinDisabled, setPinDisabled] = createSignal(false);
  const [attempts, setAttempts] = createSignal(0);

  onMount(async () => {
    try {
      const activeStaff = await getActiveStaff();
      if (activeStaff.length === 0) {
        const merchantId = currentMerchantId();
        const outletId = currentOutletId();
        const hasCloudSession = await isCloudAuthenticated();
        if (merchantId && outletId && hasCloudSession) {
          navigate(
            `/onboarding?merchantId=${merchantId}&outletId=${outletId}`,
            {
              replace: true,
            }
          );
          return;
        }

        navigate("/cloud-login", { replace: true });
        return;
      }
      setUsers(activeStaff);

      if (activeStaff.length === 1) {
        setSelectedUser(activeStaff[0]);
      } else {
        const lastUserId = getLastUserId();
        const lastUser = activeStaff.find((u) => u.id === lastUserId);
        if (lastUser) {
          setSelectedUser(lastUser);
        }
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  });

  const handlePinSubmit = async (pin: string) => {
    const user = selectedUser();
    if (!user || pinDisabled()) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const authUser = await login(user.id, pin);
      const outletId = currentOutletId();
      if (outletId) {
        setScope(outletId);
      }
      const target = authUser.role === "cashier" ? "/pos" : "/";
      navigate(target, { replace: true });
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("Invalid PIN") ? "PIN salah" : msg);
      const next = attempts() + 1;
      setAttempts(next);
      if (next >= MAX_PIN_ATTEMPTS) {
        setPinDisabled(true);
        setError("Terlalu banyak percobaan. Coba lagi dalam 30 detik.");
        setTimeout(() => {
          setAttempts(0);
          setPinDisabled(false);
          setError("");
        }, LOCKOUT_DURATION_MS);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToUsers = () => {
    setSelectedUser(null);
    setError("");
  };

  const leftPanel = (
    <Show
      fallback={
        <div class="text-muted-foreground text-sm">Memuat pengguna...</div>
      }
      when={!loading() || users().length > 0}
    >
      <Show
        fallback={
          <div class="grid w-full max-w-xs grid-cols-2 gap-3">
            <For each={users()}>
              {(u) => (
                <button
                  class={cn(
                    cardVariants({ interactive: "selectable" }),
                    "flex flex-col items-center gap-2"
                  )}
                  onClick={() => setSelectedUser(u)}
                  type="button"
                >
                  <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary font-bold text-lg text-primary-foreground">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span class="font-medium text-sm">{u.name}</span>
                  <span class="text-muted-foreground text-xs capitalize">
                    {u.role}
                  </span>
                </button>
              )}
            </For>
          </div>
        }
        when={selectedUser()}
      >
        {(selUser) => (
          <div class="flex flex-col items-center gap-3">
            <button
              class="-mt-2 self-start text-muted-foreground text-sm hover:text-foreground"
              onClick={handleBackToUsers}
              type="button"
            >
              ← Kembali
            </button>

            <div class="flex flex-col items-center gap-1">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xl">
                {selUser().name.charAt(0).toUpperCase()}
              </div>
              <span class="font-semibold text-lg">{selUser().name}</span>
              <span class="text-muted-foreground text-xs capitalize">
                {selUser().role}
              </span>
            </div>

            <Show when={error()}>
              <div class="rounded-lg bg-destructive/10 px-3 py-1.5 text-destructive text-sm">
                {error()}
              </div>
            </Show>
          </div>
        )}
      </Show>
    </Show>
  );

  return (
    <Show
      fallback={
        <div class="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
          <div class="text-center">
            <h1 class="font-bold text-3xl">Sakti POS</h1>
            <p class="mt-1 text-muted-foreground text-sm">
              {selectedUser() ? "Masukkan PIN" : "Pilih pengguna"}
            </p>
          </div>
          {leftPanel}
          <Show when={selectedUser() && (!loading() || users().length > 0)}>
            <PinPad
              disabled={pinDisabled() || loading()}
              maxLength={6}
              onSubmit={handlePinSubmit}
            />
          </Show>
        </div>
      }
      when={isLandscape() && selectedUser()}
    >
      <div class="flex min-h-screen flex-row items-center justify-center gap-8">
        <div class="flex flex-col items-center gap-3">
          <h1 class="font-bold text-2xl">Sakti POS</h1>
          {leftPanel}
        </div>
        <PinPad
          disabled={pinDisabled() || loading()}
          maxLength={6}
          onSubmit={handlePinSubmit}
        />
      </div>
    </Show>
  );
}
