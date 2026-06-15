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

export function SectionReceipt() {
  return (
    <SectionCard>
      <div>
        <CardTitle>Pengaturan Struk</CardTitle>
        <CardDesc>
          Kustomisasi tampilan dan konten struk yang dicetak atau dikirim ke
          pelanggan.
        </CardDesc>
      </div>
      <FormGrid>
        <FormGroup fullWidth>
          <FormLabel>Teks Header Struk</FormLabel>
          <FormInput
            placeholder="Teks di atas struk"
            value="Terima kasih atas kunjungan Anda!"
          />
        </FormGroup>
        <FormGroup fullWidth>
          <FormLabel>Teks Footer Struk</FormLabel>
          <FormInput
            placeholder="Teks di bawah struk"
            value="Selamat menikmati — Tantri Cafe"
          />
        </FormGroup>
      </FormGrid>
      <ToggleRow
        checked
        desc="Cetak struk secara otomatis setelah transaksi selesai."
        title="Cetak Otomatis"
      />
      <ToggleRow
        checked
        desc="Sertakan logo bisnis di bagian atas struk."
        title="Tampilkan Logo"
      />
      <ToggleRow
        checked
        desc="Tampilkan rincian pajak pada struk."
        last
        title="Tampilkan Pajak"
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
