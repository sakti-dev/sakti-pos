import { For } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  SectionCard,
  ToggleRow,
} from "./primitives";

const METHODS = [
  {
    title: "Tunai",
    desc: "Terima pembayaran uang tunai langsung dari pelanggan.",
    checked: true,
  },
  {
    title: "QRIS",
    desc: "Pembayaran via scan QR code (GoPay, OVO, Dana, dll).",
    checked: true,
  },
  {
    title: "Kartu Debit / Kredit",
    desc: "Terima pembayaran via mesin EDC atau terminal kartu.",
    checked: true,
  },
  {
    title: "E-Wallet",
    desc: "Transfer langsung ke e-wallet bisnis Anda.",
    checked: false,
  },
  {
    title: "Transfer Bank",
    desc: "Terima pembayaran via transfer bank (BCA, Mandiri, BRI, dll).",
    checked: false,
  },
] as const;

export function SectionPembayaran() {
  return (
    <SectionCard>
      <div>
        <CardTitle>Metode Pembayaran</CardTitle>
        <CardDesc>
          Kelola metode pembayaran yang diterima di kasir Anda.
        </CardDesc>
      </div>
      <For each={METHODS}>
        {(m, i) => (
          <ToggleRow
            checked={m.checked}
            desc={m.desc}
            last={i() === METHODS.length - 1}
            title={m.title}
          />
        )}
      </For>
      <BtnRow>
        <Button look="outline" tone="neutral" type="button">
          Batal
        </Button>
        <Button type="button">Simpan Perubahan</Button>
      </BtnRow>
    </SectionCard>
  );
}
