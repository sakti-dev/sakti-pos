import { Button } from "~/components/ui/button";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  FormGrid,
  FormGroup,
  FormInput,
  FormLabel,
  FormTextarea,
  SectionCard,
} from "./primitives";

export function SectionBusiness() {
  return (
    <SectionCard>
      <div>
        <CardTitle>Profil Bisnis</CardTitle>
        <CardDesc>
          Informasi dasar bisnis Anda yang akan tampil di struk dan halaman
          pelanggan.
        </CardDesc>
      </div>
      <FormGrid>
        <FormGroup>
          <FormLabel>Nama Bisnis</FormLabel>
          <FormInput placeholder="Nama bisnis" value="Tantri Cafe" />
        </FormGroup>
        <FormGroup>
          <FormLabel>Nomor Telepon</FormLabel>
          <FormInput
            placeholder="Nomor telepon"
            type="tel"
            value="+62 822-1234-5678"
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Email</FormLabel>
          <FormInput
            placeholder="Email bisnis"
            type="email"
            value="hello@tantricaffe.id"
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Website</FormLabel>
          <FormInput
            placeholder="https://..."
            type="url"
            value="https://tantricaffe.id"
          />
        </FormGroup>
        <FormGroup fullWidth>
          <FormLabel>Alamat</FormLabel>
          <FormTextarea
            placeholder="Alamat lengkap"
            value="Jl. Banda No.30, Citarum, Kec. Bandung Wetan, Kota Bandung, Jawa Barat 40115"
          />
        </FormGroup>
      </FormGrid>
      <BtnRow>
        <Button look="outline" tone="neutral" type="button">
          Batal
        </Button>
        <Button type="button">Simpan Perubahan</Button>
      </BtnRow>
    </SectionCard>
  );
}
