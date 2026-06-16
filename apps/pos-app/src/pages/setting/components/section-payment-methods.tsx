import { For } from "solid-js";
import { Button } from "~/components/ui/button";
import { paymentMethods } from "~/lib/data/payment-methods";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  SectionCard,
  ToggleRow,
} from "./primitives";

export function SectionPaymentMethods() {
  return (
    <SectionCard>
      <div>
        <CardTitle>Metode Pembayaran</CardTitle>
        <CardDesc>
          Kelola metode pembayaran yang diterima di kasir Anda.
        </CardDesc>
      </div>
      <For each={paymentMethods}>
        {(m, i) => (
          <ToggleRow
            checked={m.checked}
            desc={m.desc}
            last={i() === paymentMethods.length - 1}
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
