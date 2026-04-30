import { useNavigate } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import PinPad from "~/components/ui/pinpad";
import {
  type AuthUser,
  getActiveUsers,
  getLastUserId,
  login,
} from "~/lib/auth";

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000;

export default function Login() {
  const navigate = useNavigate();
  const [users, setUsers] = createSignal<AuthUser[]>([]);
  const [selectedUser, setSelectedUser] = createSignal<AuthUser | null>(null);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [pinDisabled, setPinDisabled] = createSignal(false);
  const [attempts, setAttempts] = createSignal(0);
  let _lockoutTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      const activeUsers = await getActiveUsers();
      setUsers(activeUsers);
      const lastUserId = getLastUserId();
      const lastUser = activeUsers.find((u) => u.id === lastUserId);
      if (lastUser) {
        setSelectedUser(lastUser);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  });

  const handlePinSubmit = async (pin: string) => {
    if (!selectedUser() || pinDisabled()) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const authUser = await login(selectedUser()?.id, pin);
      const target = authUser.role === "cashier" ? "/pos" : "/menu";
      navigate(target);
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("Invalid PIN") ? "PIN salah" : msg);
      const next = attempts() + 1;
      setAttempts(next);
      if (next >= MAX_PIN_ATTEMPTS) {
        setPinDisabled(true);
        setError("Terlalu banyak percobaan. Coba lagi dalam 30 detik.");
        _lockoutTimer = setTimeout(() => {
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

  return (
    <div class="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div class="text-center">
        <h1 class="font-bold text-3xl">Sakti POS</h1>
        <p class="mt-1 text-muted-foreground text-sm">
          {selectedUser() ? "Masukkan PIN" : "Pilih pengguna"}
        </p>
      </div>

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
                    class="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
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
            <div class="flex flex-col items-center gap-6">
              <button
                class="-mt-2 self-start text-muted-foreground text-sm hover:text-foreground"
                onClick={handleBackToUsers}
                type="button"
              >
                ← Kembali
              </button>

              <div class="flex flex-col items-center gap-2">
                <div class="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-bold text-2xl text-primary-foreground">
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

              <PinPad
                disabled={pinDisabled() || loading()}
                maxLength={6}
                onSubmit={handlePinSubmit}
              />
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
