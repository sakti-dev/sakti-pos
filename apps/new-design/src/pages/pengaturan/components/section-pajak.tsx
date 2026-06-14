import { Button } from "~/components/ui/button";
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

export function SectionPajak() {
  return (
    <SectionCard>
      <div>
        <CardTitle>Pajak & Biaya Tambahan</CardTitle>
        <CardDesc>
          Atur tarif pajak dan biaya layanan yang berlaku di setiap transaksi.
        </CardDesc>
      </div>
      <FormGrid>
        <FormGroup>
          <FormLabel>PPN / Pajak (%)</FormLabel>
          <FormInput
            max="100"
            min="0"
            placeholder="0"
            step="0.1"
            type="number"
            value="11"
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Biaya Layanan (%)</FormLabel>
          <FormInput
            max="100"
            min="0"
            placeholder="0"
            step="0.1"
            type="number"
            value="5"
          />
        </FormGroup>
      </FormGrid>
      <ToggleRow
        checked
        desc="Terapkan pajak pada setiap transaksi."
        title="Aktifkan PPN"
      />
      <ToggleRow
        checked
        desc="Tambahkan biaya layanan otomatis ke total."
        title="Aktifkan Biaya Layanan"
      />
      <ToggleRow
        desc="Harga menu sudah termasuk PPN (inclusive tax)."
        last
        title="PPN Termasuk Harga"
      />
      <BtnRow>
        <Button look="outline" tone="neutral" type="button">
          Batal
        </Button>
        <Button type="button">Simpan Perubahan</Button>
      </BtnRow>
    </SectionCard>
  );
}
