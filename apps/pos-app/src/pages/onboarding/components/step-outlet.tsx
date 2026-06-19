import {
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  TextFieldTextArea,
} from "~/components/ui/text-field";
import type { Region } from "~/lib/data/regions";
import { RegionCombobox } from "./region-combobox";

interface StepOutletProps {
  // Handlers
  readonly onOutletNameChange: (value: string) => void;
  readonly onOutletPhoneChange: (value: string) => void;
  readonly onRegionSelect: (region: Region) => void;
  readonly onStreetAddressChange: (value: string) => void;
  // Outlet
  readonly outletName: string;
  readonly outletPhone: string;
  readonly phoneInvalid: boolean;
  readonly rawStreetAddress: string;
  readonly regionInvalid: boolean;
  readonly selectedLabel?: string;
  // Location
  readonly subdistrictId: string;
}

const PHONE_RE = /^[0-9]{8,15}$/;

/** Normalize a typed phone string to digits only. */
export const normalizePhone = (raw: string): string =>
  raw.replace(/[^0-9]/g, "");

export const isPhoneValid = (digits: string): boolean => PHONE_RE.test(digits);

export function StepOutlet(props: StepOutletProps) {
  return (
    <div class="flex flex-col gap-[18px]">
      {/* Outlet name */}
      <TextField onChange={props.onOutletNameChange} value={props.outletName}>
        <TextFieldLabel for="outlet_name">Nama Cabang</TextFieldLabel>
        <TextFieldInput
          autocomplete="organization"
          id="outlet_name"
          placeholder="Contoh: Pusat"
          type="text"
        />
      </TextField>

      {/* Outlet phone */}
      <TextField
        onChange={props.onOutletPhoneChange}
        validationState={props.phoneInvalid ? "invalid" : "valid"}
        value={props.outletPhone}
      >
        <TextFieldLabel for="outlet_phone">Nomor HP Cabang</TextFieldLabel>
        <TextFieldInput
          autocomplete="tel"
          id="outlet_phone"
          inputmode="tel"
          placeholder="0812-xxxx-xxxx"
          required
          type="tel"
        />
        <TextFieldErrorMessage class="mt-[5px] h-0 overflow-hidden opacity-0 transition-all duration-standard ease-standard data-[invalid]:h-5 data-[invalid]:opacity-100">
          Nomor HP 8–15 digit.
        </TextFieldErrorMessage>
      </TextField>

      {/* Region combobox */}
      <div class="flex flex-col gap-1">
        <label
          class="font-medium text-body-sm text-foreground leading-none tracking-normal"
          for="region-trigger"
        >
          Lokasi Usaha (Kecamatan / Kota)
        </label>
        <RegionCombobox
          id="region-trigger"
          onSelect={props.onRegionSelect}
          selectedLabel={props.selectedLabel}
          value={props.subdistrictId}
        />
        <p
          class="mt-0.5 text-muted-foreground text-xs transition-opacity duration-standard ease-standard"
          classList={{
            "text-danger opacity-100": props.regionInvalid,
            "opacity-0": !props.regionInvalid,
          }}
        >
          Pilih lokasi usaha Anda.
        </p>
      </div>

      {/* Street address */}
      <TextField
        onChange={props.onStreetAddressChange}
        value={props.rawStreetAddress}
      >
        <TextFieldLabel for="raw_street_address">
          Alamat Jalan / Patokan{" "}
          <span class="font-normal text-muted-foreground">(opsional)</span>
        </TextFieldLabel>
        <TextFieldTextArea
          class="min-h-[88px] resize-y"
          id="raw_street_address"
          placeholder="Contoh: Jl. Malioboro No. 42, samping gedung pos"
        />
      </TextField>
    </div>
  );
}
