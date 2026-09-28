import { createSignal, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
  hydrateChargeConfigFromDb,
  isValidPercent,
  saveChargeConfig,
} from "~/db/outlets";
import {
  type OutletChargeConfig,
  outletChargeConfig,
} from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  FormGrid,
  FormGroup,
  FormInput,
  FormLabel,
  SectionCard,
  ToggleRow,
} from "./primitives";

const logger = createLogger({ domain: "SETTINGS", module: "tax" });

export function SectionTax() {
  const [config, setConfig] = createSignal<OutletChargeConfig | null>(null);
  const [saving, setSaving] = createSignal(false);

  onMount(async () => {
    await hydrateChargeConfigFromDb();
    setConfig(outletChargeConfig());
  });

  const patch = (next: Partial<OutletChargeConfig>) => {
    setConfig((prev) => ({ ...(prev ?? outletChargeConfig()), ...next }));
  };

  const percentValue = (value: number) => String(value);
  const parsePercent = (e: InputEvent): number => {
    const target = e.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return 0;
    }
    const parsed = Number.parseInt(target.value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleSave = async () => {
    const current = config();
    if (!current) {
      return;
    }
    if (!isValidPercent(current.taxPercentage)) {
      toast.error("PPN harus angka bulat 0-100");
      return;
    }
    if (!isValidPercent(current.serviceChargePercentage)) {
      toast.error("Biaya layanan harus angka bulat 0-100");
      return;
    }
    setSaving(true);
    try {
      await saveChargeConfig(current);
      setConfig(outletChargeConfig());
      toast.success("Pengaturan pajak tersimpan");
      logger.info("CHARGE_CONFIG_SAVED", {
        useTax: current.useTax,
        taxPercentage: current.taxPercentage,
        useServiceCharge: current.useServiceCharge,
        serviceChargePercentage: current.serviceChargePercentage,
      });
    } catch (error) {
      toast.error("Gagal menyimpan pengaturan pajak");
      logger.error("CHARGE_CONFIG_SAVE_FAILED", {
        error: String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setConfig(outletChargeConfig());
  };

  return (
    <SectionCard>
      <div>
        <CardTitle>Pajak &amp; Biaya Tambahan</CardTitle>
        <CardDesc>
          Atur pajak dan biaya layanan yang berlaku di setiap transaksi.
          Perubahan berlaku setelah disimpan.
        </CardDesc>
      </div>
      <FormGrid>
        <FormGroup>
          <FormLabel>PPN / Pajak (%)</FormLabel>
          <FormInput
            disabled={!config()?.useTax}
            max="100"
            min="0"
            onInput={(e) => patch({ taxPercentage: parsePercent(e) })}
            placeholder="0"
            step="1"
            type="number"
            value={percentValue(config()?.taxPercentage ?? 0)}
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Biaya Layanan (%)</FormLabel>
          <FormInput
            disabled={!config()?.useServiceCharge}
            max="100"
            min="0"
            onInput={(e) => patch({ serviceChargePercentage: parsePercent(e) })}
            placeholder="0"
            step="1"
            type="number"
            value={percentValue(config()?.serviceChargePercentage ?? 0)}
          />
        </FormGroup>
      </FormGrid>
      <ToggleRow
        checked={Boolean(config()?.useTax)}
        desc="Terapkan pajak pada setiap transaksi."
        onChange={(next) => patch({ useTax: next })}
        title="Aktifkan PPN"
      />
      <ToggleRow
        checked={Boolean(config()?.useServiceCharge)}
        desc="Tambahkan biaya layanan otomatis ke total."
        onChange={(next) => patch({ useServiceCharge: next })}
        title="Aktifkan Biaya Layanan"
      />
      <BtnRow>
        <Button
          disabled={saving()}
          look="outline"
          onClick={handleCancel}
          tone="neutral"
          type="button"
        >
          Batal
        </Button>
        <Button disabled={saving()} onClick={handleSave} type="button">
          <Show when={saving()}>Menyimpan…</Show>
          <Show when={!saving()}>Simpan Perubahan</Show>
        </Button>
      </BtnRow>
    </SectionCard>
  );
}
