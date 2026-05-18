import { useNavigate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { AppShell } from "~/components/layout";
import { Button } from "~/components/ui/button";
import { Card, cardVariants } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { useSettings } from "./use-settings";

interface SettingCard {
  description: string;
  title: string;
}

const SETTING_CARDS: SettingCard[] = [
  {
    description: "Profil, nama, dan ubah PIN",
    title: "Akun",
  },
  {
    description: "Informasi toko dan zona waktu",
    title: "Outlet",
  },
  {
    description: "Printer struk dan dapur",
    title: "Printer",
  },
  {
    description: "Kelola kategori dan produk menu",
    title: "Produk & Kategori",
  },
];

const CARD_ROUTES: Record<string, string> = {
  Akun: "/settings/account",
  Outlet: "/settings/outlet",
  Printer: "/settings/printer",
  "Produk & Kategori": "/settings/products-categories",
};

export default function SettingsHome() {
  const settings = useSettings();
  const navigate = useNavigate();

  return (
    <AppShell title="Pengaturan">
      <div class="space-y-3 p-4">
        <For each={SETTING_CARDS}>
          {(card) => (
            <button
              class={cn(
                cardVariants({ interactive: "clickable" }),
                "flex w-full items-center justify-between text-left"
              )}
              onClick={() => navigate(CARD_ROUTES[card.title])}
              type="button"
            >
              <div>
                <p class="font-medium">{card.title}</p>
                <p class="text-muted-foreground text-sm">{card.description}</p>
              </div>
            </button>
          )}
        </For>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Aplikasi</h2>
          <Card size="none">
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
            <div class="flex items-center justify-between p-4">
              <span>Ukuran Data</span>
              <span class="text-muted-foreground text-sm">
                {settings.dbInfo()?.size_formatted ?? "Memuat..."}
              </span>
            </div>
            <Show when={import.meta.env.DEV}>
              <div class="border-t p-4">
                <Button
                  class="w-full"
                  disabled={settings.exportingDbSnapshot()}
                  onClick={settings.handleExportDbSnapshot}
                  variant="outline"
                >
                  {settings.exportingDbSnapshot()
                    ? "Mengekspor Snapshot DB..."
                    : "Ekspor Snapshot DB"}
                </Button>
                <p class="mt-2 text-muted-foreground text-xs">
                  Hanya tersedia di build dev.
                </p>
              </div>
            </Show>
            <Show when={settings.cloudSession()?.user}>
              <button
                class="flex w-full items-center justify-between border-t p-4 text-left active:bg-accent"
                onClick={() => settings.setShowDisconnectConfirm(true)}
                type="button"
              >
                <span class="text-destructive text-sm">Lepaskan Perangkat</span>
              </button>
            </Show>
          </Card>
        </section>
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
    </AppShell>
  );
}
