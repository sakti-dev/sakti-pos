import { A } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import { ArrowRightIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import {
  getPaymentSettings,
  upsertPaymentSettings,
} from "~/db/payment-settings";
import {
  readCachedNotificationAccess,
  readStoredMonitoredPackages,
} from "~/lib/qris/detection";
import { createLogger } from "~/lib/utils";
import { CardDesc, CardTitle, SectionCard, ToggleRow } from "./primitives";
import { type QRISTargetMode, QRISWalkthrough } from "./qris-walkthrough";

const logger = createLogger({ domain: "SETTINGS", module: "payment-methods" });

interface WalkthroughState {
  readonly initialStep: 1 | 2;
  readonly target: QRISTargetMode | null;
}

export function SectionPaymentMethods() {
  const [settings, { refetch }] = createResource(getPaymentSettings);
  const [walkthrough, setWalkthrough] = createSignal<WalkthroughState | null>(
    null
  );

  const hasPayload = () => Boolean(settings()?.qrisStaticPayload);

  const detectionStatus = () => {
    const count = readStoredMonitoredPackages().length;
    const granted = readCachedNotificationAccess();
    if (count === 0) {
      return "Belum diatur — pilih aplikasi yang dipantau";
    }
    if (granted === false) {
      return `${count} aplikasi · izin notifikasi belum aktif`;
    }
    return `${count} aplikasi dipantau${granted ? " · aktif" : ""}`;
  };

  const handleToggle = async (mode: QRISTargetMode, next: boolean) => {
    if (next && !hasPayload()) {
      setWalkthrough({ initialStep: 1, target: mode });
      return;
    }
    try {
      await upsertPaymentSettings(
        mode === "qris_statis"
          ? { qrisStatisEnabled: next }
          : { qrisDinamisEnabled: next }
      );
      logger.info("PAYMENT_METHOD_TOGGLED", { mode, next });
      await refetch();
    } catch (error) {
      logger.error("PAYMENT_METHOD_TOGGLE_FAILED", { error: String(error) });
    }
  };

  return (
    <SectionCard>
      <div>
        <CardTitle>Metode Pembayaran</CardTitle>
        <CardDesc>
          Kelola metode pembayaran yang diterima di kasir Anda. Perubahan
          tersimpan otomatis.
        </CardDesc>
      </div>

      <ToggleRow
        checked
        desc="Terima pembayaran uang tunai langsung dari pelanggan."
        disabled
        title="Tunai"
      />
      <ToggleRow
        checked={settings()?.qrisStatisEnabled ?? false}
        desc="Tampilkan QRIS cetakan Anda; pelanggan pindai lalu kasir konfirmasi."
        onChange={(next) => handleToggle("qris_statis", next)}
        title="QRIS Statis"
      />
      <ToggleRow
        checked={settings()?.qrisDinamisEnabled ?? false}
        desc="QR dengan total belanja tersemat, dibuat otomatis dari QRIS Statis Anda."
        onChange={(next) => handleToggle("qris_dinamis", next)}
        title="QRIS Dinamis"
      />

      <Show
        when={
          (settings()?.qrisStatisEnabled ?? false) ||
          (settings()?.qrisDinamisEnabled ?? false)
        }
      >
        <A
          class="flex items-center justify-between gap-4 py-3"
          href="/setting/payment-monitor"
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium text-body-sm text-foreground">
              Deteksi Pembayaran
            </div>
            <div class="mt-0.5 text-caption text-muted-foreground">
              {detectionStatus()}
            </div>
          </div>
          <ArrowRightIcon class="size-5 shrink-0 text-muted-foreground" />
        </A>
      </Show>

      <Show when={hasPayload()}>
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="font-medium text-body-sm text-foreground">
              Ganti QRIS Statis
            </div>
            <div class="mt-0.5 text-caption text-muted-foreground">
              Pindai ulang jika QRIS merchant Anda berubah.
            </div>
          </div>
          <Button
            look="outline"
            onClick={() => setWalkthrough({ initialStep: 2, target: null })}
            size="sm"
            tone="neutral"
            type="button"
          >
            Pindai Ulang
          </Button>
        </div>
      </Show>

      <Show when={walkthrough()}>
        {(state) => (
          <QRISWalkthrough
            initialStep={state().initialStep}
            onClose={() => setWalkthrough(null)}
            onSaved={async () => {
              setWalkthrough(null);
              await refetch();
            }}
            targetMode={state().target}
          />
        )}
      </Show>
    </SectionCard>
  );
}
