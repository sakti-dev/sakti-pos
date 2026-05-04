import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { createResource, createSignal, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { AppShell } from "~/components/layout";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import { changeCurrentUserPin, currentUser, logout } from "~/lib/auth";
import { toast } from "~/lib/toast";

interface DbInfo {
  db_path: string;
  size_formatted: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const user = currentUser();
  const [showLogoutConfirm, setShowLogoutConfirm] = createSignal(false);
  const [showPinDrawer, setShowPinDrawer] = createSignal(false);
  const [dbInfo] = createResource(() => invoke<DbInfo>("get_db_info"));

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AppShell title="Pengaturan">
      <div class="space-y-4 p-4">
        <div class="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-lg text-primary-foreground">
            {user?.name.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-lg">{user?.name}</p>
            <p class="text-muted-foreground text-sm capitalize">{user?.role}</p>
          </div>
        </div>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Akun</h2>
          <div class="rounded-xl border bg-card">
            <button
              class="flex w-full items-center justify-between p-4 active:bg-accent"
              onClick={() => setShowPinDrawer(true)}
              type="button"
            >
              <span>Ubah PIN</span>
              <svg
                aria-hidden="true"
                class="size-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Aplikasi</h2>
          <div class="rounded-xl border bg-card">
            <div class="flex items-center justify-between border-b p-4">
              <span>Versi</span>
              <span class="text-muted-foreground text-sm">0.1.0</span>
            </div>
            <div class="flex items-center justify-between border-b p-4">
              <span>Ukuran Data</span>
              <span class="text-muted-foreground text-sm">
                {dbInfo()?.size_formatted ?? "Memuat..."}
              </span>
            </div>
            <Show when={user?.role === "owner"}>
              <div class="flex items-center justify-between p-4">
                <span>Akses</span>
                <span class="text-muted-foreground text-sm">Owner</span>
              </div>
            </Show>
          </div>
        </section>

        <Button
          class="w-full"
          onClick={() => setShowLogoutConfirm(true)}
          variant="outline"
        >
          Keluar
        </Button>
      </div>

      <ConfirmDrawer
        confirmLabel="Keluar"
        message="Anda akan keluar dari aplikasi."
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        open={showLogoutConfirm()}
        title="Keluar"
        variant="destructive"
      />

      <Show when={showPinDrawer()}>
        <ChangePinDrawer onClose={() => setShowPinDrawer(false)} />
      </Show>
    </AppShell>
  );
}

function ChangePinDrawer(props: { onClose: () => void }) {
  const [newPin, setNewPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const isValid = () => {
    const np = newPin();
    const cp = confirmPin();
    return np.length >= 4 && np === cp;
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await changeCurrentUserPin(newPin());
      toast("PIN berhasil diubah", "success");
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      closeOnEscapeKeyDown={false}
      closeOnOutsideFocus={false}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
      open={true}
      trapFocus={false}
    >
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent class="px-4 pb-6">
          <DrawerTitle>Ubah PIN</DrawerTitle>
          <div class="space-y-3 pt-2">
            <Show when={error()}>
              {(msg) => (
                <div class="rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
                  {msg()}
                </div>
              )}
            </Show>
            <div>
              <label
                class="mb-1 block text-muted-foreground text-sm"
                for="new-pin"
              >
                PIN Baru
              </label>
              <input
                autocomplete="new-password"
                class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                id="new-pin"
                maxlength={6}
                onInput={(e) => setNewPin(e.currentTarget.value)}
                placeholder="Min. 4 digit"
                type="password"
              />
            </div>
            <div>
              <label
                class="mb-1 block text-muted-foreground text-sm"
                for="confirm-pin"
              >
                Konfirmasi PIN
              </label>
              <input
                autocomplete="new-password"
                class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                id="confirm-pin"
                maxlength={6}
                onInput={(e) => setConfirmPin(e.currentTarget.value)}
                placeholder="Ulangi PIN baru"
                type="password"
              />
            </div>
            <Show when={newPin() && confirmPin() && newPin() !== confirmPin()}>
              <p class="text-destructive text-sm">PIN tidak cocok</p>
            </Show>
          </div>
          <div class="mt-4 flex gap-2">
            <Button class="flex-1" onClick={props.onClose} variant="outline">
              Batal
            </Button>
            <Button
              class="flex-1"
              disabled={!isValid() || saving()}
              onClick={handleSubmit}
            >
              {saving() ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}
