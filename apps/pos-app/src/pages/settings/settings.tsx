import { useNavigate } from "@solidjs/router";
import { For } from "solid-js";
import { AppShell } from "~/components/layout";
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
  {
    description: "Koneksi cloud dan sinkronisasi",
    title: "Cloud",
  },
];

const CARD_ROUTES: Record<string, string> = {
  Akun: "/settings/account",
  Cloud: "/settings/cloud",
  Outlet: "/settings/outlet",
  Printer: "/settings/printer",
  "Produk & Kategori": "/settings/products-categories",
};

export default function Settings() {
  const settings = useSettings();
  const navigate = useNavigate();

  return (
    <AppShell title="Pengaturan">
      <div class="space-y-3 p-4">
        <For each={SETTING_CARDS}>
          {(card) => (
            <button
              class="flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left active:bg-accent"
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
            <div class="flex items-center justify-between p-4">
              <span>Ukuran Data</span>
              <span class="text-muted-foreground text-sm">
                {settings.dbInfo()?.size_formatted ?? "Memuat..."}
              </span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
