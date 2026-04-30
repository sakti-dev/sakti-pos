import { createSignal, For, Show, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import PinPad from "~/components/PinPad";
import { getActiveUsers, login, getLastUserId, type AuthUser } from "~/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [users, setUsers] = createSignal<AuthUser[]>([]);
  const [selectedUser, setSelectedUser] = createSignal<AuthUser | null>(null);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [pinDisabled, setPinDisabled] = createSignal(false);
  const [attempts, setAttempts] = createSignal(0);
  let lockoutTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      const activeUsers = await getActiveUsers();
      setUsers(activeUsers);
      const lastUserId = getLastUserId();
      const lastUser = activeUsers.find((u) => u.id === lastUserId);
      if (lastUser) setSelectedUser(lastUser);
    } catch (err) {
      console.error("[login] Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  });

  const handlePinSubmit = async (pin: string) => {
    if (!selectedUser() || pinDisabled()) return;
    setError("");
    setLoading(true);
    try {
      const authUser = await login(selectedUser()!.id, pin);
      const target = authUser.role === "cashier" ? "/pos" : "/menu";
      navigate(target);
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("Invalid PIN") ? "PIN salah" : msg);
      const next = attempts() + 1;
      setAttempts(next);
      if (next >= 5) {
        setPinDisabled(true);
        setError("Terlalu banyak percobaan. Coba lagi dalam 30 detik.");
        lockoutTimer = setTimeout(() => {
          setAttempts(0);
          setPinDisabled(false);
          setError("");
        }, 30_000);
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
    <div class="flex flex-col items-center justify-center min-h-screen p-6 gap-8">
      <div class="text-center">
        <h1 class="text-3xl font-bold">Sakti POS</h1>
        <p class="text-sm text-muted-foreground mt-1">
          {selectedUser() ? "Masukkan PIN" : "Pilih pengguna"}
        </p>
      </div>

      <Show
        when={!loading() || users().length > 0}
        fallback={
          <div class="text-muted-foreground text-sm">Memuat pengguna...</div>
        }
      >
        <Show
          when={selectedUser()}
          fallback={
            <div class="grid grid-cols-2 gap-3 w-full max-w-xs">
              <For each={users()}>
                {(u) => (
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    class="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary transition-colors"
                  >
                    <div class="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span class="text-sm font-medium">{u.name}</span>
                    <span class="text-xs text-muted-foreground capitalize">
                      {u.role}
                    </span>
                  </button>
                )}
              </For>
            </div>
          }
        >
          {(selUser) => (
            <div class="flex flex-col items-center gap-6">
              <button
                type="button"
                onClick={handleBackToUsers}
                class="text-sm text-muted-foreground hover:text-foreground self-start -mt-2"
              >
                ← Kembali
              </button>

              <div class="flex flex-col items-center gap-2">
                <div class="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                  {selUser().name.charAt(0).toUpperCase()}
                </div>
                <span class="text-lg font-semibold">{selUser().name}</span>
                <span class="text-xs text-muted-foreground capitalize">
                  {selUser().role}
                </span>
              </div>

              <Show when={error()}>
                <div class="text-sm text-destructive bg-destructive/10 px-3 py-1.5 rounded-lg">
                  {error()}
                </div>
              </Show>

              <PinPad
                onSubmit={handlePinSubmit}
                disabled={pinDisabled() || loading()}
                maxLength={6}
              />
            </div>
          )}
        </Show>
      </Show>
    </div>
  );
}
