import { Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import { useSettings } from "~/pages/settings/use-settings";

const TIMEZONE_OPTIONS = [
  { label: "Asia/Jakarta", value: "Asia/Jakarta" },
  { label: "Asia/Makassar", value: "Asia/Makassar" },
  { label: "Asia/Jayapura", value: "Asia/Jayapura" },
  { label: "Asia/Singapore", value: "Asia/Singapore" },
  { label: "Asia/Bangkok", value: "Asia/Bangkok" },
  { label: "UTC", value: "UTC" },
];

export default function OutletSettings() {
  const settings = useSettings();

  return (
    <>
      <PageHeader backHref="/settings">Outlet</PageHeader>
      <div class="space-y-4 p-4">
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
      </div>
    </>
  );
}
