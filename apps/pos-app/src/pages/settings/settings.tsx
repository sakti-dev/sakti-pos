import {
  TbOutlineChevronRight,
  TbOutlineCloud,
  TbOutlineCloudOff,
} from "solid-icons/tb";
import { createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { AppShell } from "~/components/layout";
import PrinterSettings from "~/components/settings/printer-settings";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import { Select } from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { changeCurrentUserPin } from "~/store/auth";
import { useSettings } from "./use-settings";

const TIMEZONE_OPTIONS = [
  { label: "Asia/Jakarta", value: "Asia/Jakarta" },
  { label: "Asia/Makassar", value: "Asia/Makassar" },
  { label: "Asia/Jayapura", value: "Asia/Jayapura" },
  { label: "Asia/Singapore", value: "Asia/Singapore" },
  { label: "Asia/Bangkok", value: "Asia/Bangkok" },
  { label: "UTC", value: "UTC" },
];

export default function Settings() {
  const settings = useSettings();

  return (
    <AppShell title="Pengaturan">
      <div class="space-y-4 p-4">
        <div class="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-lg text-primary-foreground">
            {settings.activeUserLabel()}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-lg">{settings.user?.name}</p>
            <p class="text-muted-foreground text-sm capitalize">
              {settings.user?.role}
            </p>
          </div>
        </div>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Akun</h2>
          <div class="rounded-xl border bg-card">
            <button
              class="flex w-full items-center justify-between p-4 active:bg-accent"
              onClick={() => settings.setShowPinDrawer(true)}
              type="button"
            >
              <span>Ubah PIN</span>
              <TbOutlineChevronRight class="size-5 text-muted-foreground" />
            </button>
          </div>
        </section>

        <Show when={settings.cloudSession()?.user}>
          <section class="space-y-2">
            <h2 class="font-medium text-muted-foreground text-sm">Cloud</h2>
            <div class="rounded-xl border bg-card">
              <div class="flex items-center gap-3 border-b p-4">
                <TbOutlineCloud class="size-5 shrink-0 text-primary" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-sm">
                    {settings.cloudSession()?.user?.email}
                  </p>
                  <Show when={settings.currentOutletId()}>
                    <p class="text-muted-foreground text-xs">
                      Toko aktif terhubung
                    </p>
                  </Show>
                </div>
              </div>
              <Show when={settings.currentOutletId()}>
                <div class="flex items-center justify-between border-b p-4">
                  <span class="text-sm">Sinkronisasi</span>
                  <Button
                    class="h-8 text-xs"
                    disabled={settings.syncStatus() === "syncing"}
                    onClick={settings.handleSyncNow}
                    size="sm"
                    variant="outline"
                  >
                    {settings.syncStatus() === "syncing"
                      ? "Menyinkronkan..."
                      : "Sinkron Sekarang"}
                  </Button>
                </div>
              </Show>
              <button
                class="flex w-full items-center justify-between p-4 active:bg-accent"
                onClick={() => settings.setShowDisconnectConfirm(true)}
                type="button"
              >
                <span class="text-destructive text-sm">Lepaskan Perangkat</span>
                <TbOutlineCloudOff class="size-5 text-destructive" />
              </button>
            </div>
          </section>
        </Show>

        <Show when={settings.currentOutletId()}>
          <section class="space-y-2">
            <h2 class="font-medium text-muted-foreground text-sm">
              Zona Waktu Outlet
            </h2>
            <div class="rounded-xl border bg-card p-4">
              <p class="mb-3 text-muted-foreground text-sm">
                Dipakai untuk Hari Ini, Kemarin, nomor transaksi, dan waktu
                struk.
              </p>
              <div class="space-y-3">
                <Select
                  label="Pilih zona waktu"
                  onChange={(value) =>
                    settings.setSelectedOutletTimezone(String(value ?? ""))
                  }
                  options={TIMEZONE_OPTIONS}
                  value={settings.selectedOutletTimezone()}
                />
                <Button
                  class="w-full"
                  disabled={settings.savingTimezone()}
                  onClick={settings.handleSaveOutletTimezone}
                  variant="outline"
                >
                  {settings.savingTimezone()
                    ? "Menyimpan..."
                    : "Simpan Zona Waktu"}
                </Button>
              </div>
            </div>
          </section>
        </Show>

        <Show when={!settings.cloudSession()?.user}>
          <section class="space-y-2">
            <h2 class="font-medium text-muted-foreground text-sm">Cloud</h2>
            <div class="rounded-xl border bg-card">
              <button
                class="flex w-full items-center justify-between p-4 active:bg-accent"
                onClick={settings.handleConnectCloud}
                type="button"
              >
                <span class="text-sm">Hubungkan akun cloud</span>
                <TbOutlineChevronRight class="size-5 text-muted-foreground" />
              </button>
            </div>
          </section>
        </Show>

        <PrinterSettings />

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Aplikasi</h2>
          <div class="rounded-xl border bg-card">
            <div class="flex items-center justify-between border-b p-4">
              <span>Tema</span>
              <div class="flex overflow-hidden rounded-lg border">
                <button
                  class={cn(
                    "px-3 py-1 text-sm",
                    settings.theme() === "light" &&
                      "bg-primary text-primary-foreground"
                  )}
                  onClick={() => settings.setTheme("light")}
                  type="button"
                >
                  Terang
                </button>
                <button
                  class={cn(
                    "border-x px-3 py-1 text-sm",
                    settings.theme() === "system" &&
                      "bg-primary text-primary-foreground"
                  )}
                  onClick={() => settings.setTheme("system")}
                  type="button"
                >
                  Sistem
                </button>
                <button
                  class={cn(
                    "px-3 py-1 text-sm",
                    settings.theme() === "dark" &&
                      "bg-primary text-primary-foreground"
                  )}
                  onClick={() => settings.setTheme("dark")}
                  type="button"
                >
                  Gelap
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between border-b p-4">
              <span>Versi</span>
              <span class="text-muted-foreground text-sm">0.1.0</span>
            </div>
            <div class="flex items-center justify-between border-b p-4">
              <span>Ukuran Data</span>
              <span class="text-muted-foreground text-sm">
                {settings.dbInfo()?.size_formatted ?? "Memuat..."}
              </span>
            </div>
            <Show
              when={
                settings.user?.role === "manager" ||
                settings.user?.role === "owner"
              }
            >
              <div class="flex items-center justify-between p-4">
                <span>Akses</span>
                <span class="text-muted-foreground text-sm">Owner</span>
              </div>
            </Show>
          </div>
        </section>

        <Button
          class="w-full"
          onClick={() => settings.setShowLogoutConfirm(true)}
          variant="outline"
        >
          Keluar
        </Button>
      </div>

      <ConfirmDrawer
        confirmLabel="Lepaskan"
        message="Perangkat akan dilepas dari outlet ini. Anda perlu login ulang dengan akun cloud atau memasangkan ulang perangkat."
        onClose={() => settings.setShowDisconnectConfirm(false)}
        onConfirm={settings.handleDisconnect}
        open={settings.showDisconnectConfirm()}
        title="Lepaskan Perangkat"
        variant="destructive"
      />

      <ConfirmDrawer
        confirmLabel="Keluar"
        message="Anda akan keluar dari aplikasi."
        onClose={() => settings.setShowLogoutConfirm(false)}
        onConfirm={settings.handleLogout}
        open={settings.showLogoutConfirm()}
        title="Keluar"
        variant="destructive"
      />

      <Show when={settings.showPinDrawer()}>
        <ChangePinDrawer onClose={() => settings.setShowPinDrawer(false)} />
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
    return np.length >= 6 && np === cp;
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await changeCurrentUserPin(newPin());
      toast.success("PIN berhasil diubah");
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
                inputMode="numeric"
                maxlength={6}
                onInput={(e) => setNewPin(e.currentTarget.value)}
                placeholder="6 digit"
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
                inputMode="numeric"
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
