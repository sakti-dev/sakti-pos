import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { BellIcon, QrCodeIcon, ScannerIcon } from "~/assets";
import { upsertPaymentSettings } from "~/db/payment-settings";
import type { QRISValidationRejection } from "~/lib/qris";
import { parseQRIS } from "~/lib/qris";
import { isNotificationAccessGranted } from "~/lib/qris/detection";
import { type ScanFailure, scanQRISFromPicker } from "~/lib/qris/scan";
import { createLogger } from "~/lib/utils";
import { WizardShell } from "~/pages/onboarding/components/wizard-shell";

const logger = createLogger({ domain: "SETTINGS", module: "qris-walkthrough" });

export type QRISTargetMode = "qris_statis" | "qris_dinamis";

const SCAN_FAILURE_TEXT: Record<ScanFailure, string> = {
  "pick-failed": "Tidak bisa membuka galeri. Coba lagi.",
  "image-load-failed": "Foto tidak bisa dibaca. Pilih foto lain.",
  "no-qr-found":
    "Tidak ada QR code pada foto tersebut. Coba foto yang lebih jelas.",
};

const VALIDATION_FAILURE_TEXT: Record<QRISValidationRejection, string> = {
  "not-a-qris":
    "QR code ini bukan QRIS. Pastikan Anda memindai QRIS dari pendaftaran merchant Anda.",
  "bad-format": "Format QRIS tidak dikenali. Coba pindai ulang.",
  "invalid-crc": "Data QRIS rusak atau tidak lengkap. Coba pindai ulang.",
  "already-dynamic":
    "Ini QRIS Dinamis. Yang dibutuhkan adalah QRIS Statis (QR cetakan dari bank/ penyedia Anda).",
};

type GrantStatus = "checking" | "granted" | "denied";

const GRANT_DOT_CLASS: Record<GrantStatus, string> = {
  checking: "animate-pulse bg-muted-foreground",
  denied: "bg-warning",
  granted: "bg-success",
};

const GRANT_LABEL: Record<GrantStatus, string> = {
  checking: "Memeriksa…",
  denied: "Belum aktif",
  granted: "Aktif",
};

interface QRISWalkthroughProps {
  readonly initialStep?: 1 | 2;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /** Which toggle triggered the walkthrough; null = replace ("Ganti QRIS") flow. */
  readonly targetMode: QRISTargetMode | null;
}

export function QRISWalkthrough(props: QRISWalkthroughProps) {
  const navigate = useNavigate();
  const [step, setStep] = createSignal<1 | 2 | 3 | 4>(props.initialStep ?? 1);
  const [scanning, setScanning] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [payload, setPayload] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [grantStatus, setGrantStatus] = createSignal<GrantStatus>("checking");

  const identity = () => {
    const current = payload();
    if (!current) {
      return null;
    }
    const parsed = parseQRIS(current);
    return {
      city: parsed.merchantCity,
      merchantId: parsed.merchantAccountInfo[0]?.merchantId,
      name: parsed.merchantName,
    };
  };

  const refreshGrant = async () => {
    setGrantStatus("checking");
    try {
      const granted = await isNotificationAccessGranted();
      setGrantStatus(granted ? "granted" : "denied");
      logger.info("QRIS_WALKTHROUGH_GRANT_CHECKED", { granted });
    } catch (error_) {
      setGrantStatus("denied");
      logger.warn("QRIS_WALKTHROUGH_GRANT_CHECK_FAILED", {
        error: String(error_),
      });
    }
  };

  createEffect(() => {
    if (step() === 4) {
      refreshGrant().catch(() => undefined);
    }
  });

  onMount(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        step() === 4 &&
        grantStatus() !== "granted"
      ) {
        refreshGrant().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    onCleanup(() =>
      document.removeEventListener("visibilitychange", onVisibilityChange)
    );
  });

  const handleOpenMonitor = () => {
    logger.info("QRIS_WALKTHROUGH_MONITOR_OPENED", {});
    props.onSaved();
    navigate("/setting/payment-monitor");
  };

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    logger.info("QRIS_WALKTHROUGH_SCAN_START", { step: step() });

    const result = await scanQRISFromPicker();

    if (!result.ok) {
      setError(SCAN_FAILURE_TEXT[result.reason]);
      setScanning(false);
      return;
    }

    const { validateStaticQRIS } = await import("~/lib/qris");
    const validation = validateStaticQRIS(result.payload);
    if (!validation.ok) {
      logger.warn("QRIS_WALKTHROUGH_SCAN_INVALID", {
        reason: validation.reason,
      });
      setError(VALIDATION_FAILURE_TEXT[validation.reason]);
      setScanning(false);
      return;
    }

    logger.info("QRIS_WALKTHROUGH_SCAN_VALID", {});
    setPayload(result.payload);
    setScanning(false);
    setStep(3);
  };

  const handleSave = async () => {
    const current = payload();
    if (!current) {
      return;
    }
    setSaving(true);
    try {
      await upsertPaymentSettings({
        ...(props.targetMode === "qris_statis"
          ? { qrisStatisEnabled: true }
          : {}),
        ...(props.targetMode === "qris_dinamis"
          ? { qrisDinamisEnabled: true }
          : {}),
        qrisStaticPayload: current,
      });
      logger.info("QRIS_WALKTHROUGH_SAVED", { target: props.targetMode });
      setSaving(false);
      setStep(4);
    } catch (error_) {
      logger.error("QRIS_WALKTHROUGH_SAVE_FAILED", { error: String(error_) });
      setError("Gagal menyimpan. Coba lagi.");
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step() === 3) {
      setStep(2);
      return;
    }
    if (step() === 2 && (props.initialStep ?? 1) === 2) {
      props.onClose();
      return;
    }
    if (step() === 2) {
      setStep(1);
      return;
    }
    props.onClose();
  };

  return (
    <div class="fixed inset-0 z-50 flex flex-col bg-background">
      <Show when={step() === 1}>
        <WizardShell
          canProceed
          onBack={props.onClose}
          onNext={() => setStep(2)}
          step={1}
          subtitle="Satu pemindaian QRIS Statis mengaktifkan dua metode pembayaran."
          title="Pindai QRIS Statis Anda"
          total={4}
        >
          <div class="flex flex-col gap-5">
            <div class="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
              <QrCodeIcon class="size-10 shrink-0 text-primary" />
              <div>
                <p class="font-medium text-body-sm text-foreground">
                  Apa itu QRIS Statis?
                </p>
                <p class="mt-1 text-body-sm text-muted-foreground leading-relaxed">
                  QR cetakan yang Anda terima saat mendaftar QRIS di bank atau
                  penyjadi layanan (GoPay, QRIS Teller, dll). Biasanya ditempel
                  di kasir.
                </p>
              </div>
            </div>
            <div class="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
              <ScannerIcon class="size-10 shrink-0 text-primary" />
              <div>
                <p class="font-medium text-body-sm text-foreground">
                  Sekali pindai, dua metode aktif
                </p>
                <p class="mt-1 text-body-sm text-muted-foreground leading-relaxed">
                  QRIS Statis menampilkan QR Anda apa adanya. QRIS Dinamis
                  otomatis menyematkan total belanja ke QR — pelanggan cukup
                  pindai dan bayar sesuai jumlahnya.
                </p>
              </div>
            </div>
          </div>
        </WizardShell>
      </Show>

      <Show when={step() === 2}>
        <WizardShell
          canProceed={!scanning()}
          onBack={handleBack}
          onNext={handleScan}
          step={2}
          submitLabel={scanning() ? "Memindai…" : "Pilih Foto QRIS"}
          submitting={scanning()}
          subtitle="Pilih foto QRIS Statis Anda dari galeri. Pastikan QR terlihat jelas dan tidak terpotong."
          title="Pindai QRIS Statis"
          total={4}
        >
          <Show when={error()}>
            <div class="rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4">
              <p class="text-body-sm text-danger leading-relaxed">{error()}</p>
            </div>
          </Show>
          <div class="rounded-2xl border border-border border-dashed bg-card px-5 py-8">
            <div class="flex flex-col items-center gap-3 text-center">
              <QrCodeIcon class="size-14 text-muted-foreground" />
              <p class="text-body-sm text-muted-foreground leading-relaxed">
                Foto QRIS dapat diambil terlebih dahulu dengan kamera, lalu
                dipilih dari galeri.
              </p>
            </div>
          </div>
        </WizardShell>
      </Show>

      <Show when={step() === 3}>
        <WizardShell
          canProceed={!saving()}
          onBack={() => setStep(2)}
          onNext={handleSave}
          step={3}
          submitLabel={saving() ? "Menyimpan…" : "Ya, Simpan"}
          submitting={saving()}
          subtitle="Pastikan identitas berikut sesuai dengan QRIS Anda."
          title="Konfirmasi QRIS"
          total={4}
        >
          <Show when={identity()}>
            {(info) => (
              <div class="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
                <ConfirmRow label="Nama Merchant" value={info().name} />
                <ConfirmRow label="Kota" value={info().city} />
                <ConfirmRow
                  label="ID Merchant"
                  value={info().merchantId ?? "—"}
                />
              </div>
            )}
          </Show>
          <Show when={error()}>
            <div class="rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4">
              <p class="text-body-sm text-danger leading-relaxed">{error()}</p>
            </div>
          </Show>
          <button
            class="self-center font-medium text-body-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            onClick={() => setStep(2)}
            type="button"
          >
            Bukan QRIS saya, ulangi pemindaian
          </button>
        </WizardShell>
      </Show>

      <Show when={step() === 4}>
        <WizardShell
          canProceed
          onBack={props.onSaved}
          onNext={handleOpenMonitor}
          step={4}
          submitLabel="Atur Deteksi Pembayaran"
          subtitle="Opsional — aktifkan deteksi pembayaran otomatis. Tanpa ini, kasir tetap bisa konfirmasi manual."
          title="Deteksi Pembayaran Otomatis"
          total={4}
        >
          <div class="flex flex-col gap-5">
            <div class="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
              <BellIcon class="size-10 shrink-0 text-primary" />
              <div>
                <p class="font-medium text-body-sm text-foreground">
                  Baca notifikasi pembayaran
                </p>
                <p class="mt-1 text-body-sm text-muted-foreground leading-relaxed">
                  Saat transaksi berlangsung, Sakti POS membaca notifikasi dana
                  masuk dari aplikasi pembayaran dan menandai pembayaran yang
                  cocok.
                </p>
              </div>
            </div>
            <div class="rounded-2xl border border-border bg-card px-5 py-4">
              <div class="flex items-center justify-between gap-4">
                <p class="font-medium text-body-sm text-foreground">
                  Akses notifikasi
                </p>
                <div class="flex items-center gap-2">
                  <span
                    class={`size-2 rounded-full ${GRANT_DOT_CLASS[grantStatus()]}`}
                  />
                  <p class="font-medium text-body-sm text-muted-foreground">
                    {GRANT_LABEL[grantStatus()]}
                  </p>
                </div>
              </div>
              <Show when={grantStatus() === "denied"}>
                <p class="mt-3 text-caption text-muted-foreground leading-relaxed">
                  Pilih aplikasi pembayaran yang dipantau dan berikan akses
                  notifikasi di layar berikutnya.
                </p>
              </Show>
            </div>
          </div>
        </WizardShell>
      </Show>
    </div>
  );
}

function ConfirmRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-baseline justify-between gap-4">
      <span class="font-semibold text-caption text-muted-foreground uppercase tracking-wider">
        {props.label}
      </span>
      <span class="min-w-0 truncate text-right font-medium text-body-sm text-foreground">
        {props.value || "—"}
      </span>
    </div>
  );
}
