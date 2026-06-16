import { useColorMode } from "@kobalte/core";
import { createSignal, For } from "solid-js";
import { MoonIcon, SunIcon } from "~/assets";
import { Button } from "~/components/ui/button";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  FormGrid,
  FormGroup,
  FormLabel,
  FormSelect,
  SectionCard,
} from "./primitives";

export function SectionGeneral() {
  const { setColorMode } = useColorMode();

  /* Kobalte stores the *preference* in localStorage under "kb-color-mode".
     colorMode() returns the resolved value ("light"/"dark"), not the preference.
     Read the raw preference so "system" stays highlighted correctly. */
  const [themePref, setThemePref] = createSignal(
    (localStorage.getItem("kb-color-mode") ?? "system").replace(/"/g, "") as
      | "light"
      | "system"
      | "dark"
  );

  const themeOptions = [
    { value: "light" as const, label: "Terang", Icon: SunIcon },
    { value: "system" as const, label: "Sistem", Icon: null },
    { value: "dark" as const, label: "Gelap", Icon: MoonIcon },
  ] as const;

  return (
    <SectionCard>
      <div>
        <CardTitle>Pengaturan Umum</CardTitle>
        <CardDesc>
          Konfigurasi dasar aplikasi untuk operasional harian.
        </CardDesc>
      </div>
      <FormGrid>
        <FormGroup>
          <FormLabel>Bahasa</FormLabel>
          <FormSelect value="Bahasa Indonesia">
            <option selected>Bahasa Indonesia</option>
            <option>English</option>
          </FormSelect>
        </FormGroup>
        <FormGroup>
          <FormLabel>Zona Waktu</FormLabel>
          <FormSelect value="WIB (GMT+07:00)">
            <option selected>WIB (GMT+07:00)</option>
            <option>WITA (GMT+08:00)</option>
            <option>WIT (GMT+09:00)</option>
          </FormSelect>
        </FormGroup>
        <FormGroup>
          <FormLabel>Mata Uang</FormLabel>
          <FormSelect value="IDR — Rupiah Indonesia">
            <option selected>IDR — Rupiah Indonesia</option>
            <option>USD — US Dollar</option>
            <option>MYR — Ringgit Malaysia</option>
          </FormSelect>
        </FormGroup>
        <FormGroup>
          <FormLabel>Format Waktu</FormLabel>
          <FormSelect value="24 Jam">
            <option selected>24 Jam</option>
            <option>12 Jam (AM/PM)</option>
          </FormSelect>
        </FormGroup>
      </FormGrid>

      {/* Theme selector */}
      <div>
        <FormLabel>Tema</FormLabel>
        <div class="mt-1.5 flex gap-2">
          <For each={themeOptions}>
            {(opt) => {
              const active = () => themePref() === opt.value;
              return (
                <button
                  class={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 font-medium text-body-sm transition-colors duration-150 ${
                    active()
                      ? "border-primary bg-accent-soft text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-border"
                  }`}
                  onClick={() => {
                    setThemePref(opt.value);
                    setColorMode(opt.value);
                  }}
                  type="button"
                >
                  {opt.Icon && <opt.Icon class="h-4 w-4" />}
                  <span>{opt.label}</span>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      <BtnRow>
        <Button look="outline" tone="neutral" type="button">
          Batal
        </Button>
        <Button type="button">Simpan Perubahan</Button>
      </BtnRow>
    </SectionCard>
  );
}
