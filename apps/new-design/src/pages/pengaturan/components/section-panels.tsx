import { useColorMode } from "@kobalte/core";
import { motion } from "motion-solidjs";
import { createSignal, For, type JSX, Show } from "solid-js";
import {
  InfoIcon,
  MoonIcon,
  PrinterIcon,
  ScannerIcon,
  SunIcon,
} from "~/assets";
import { Button } from "~/components/ui/button";
import type { SectionKey } from "./settings-nav";

/* ── shared primitives ────────────────────────────────────────── */

function SectionCard(props: {
  readonly children: JSX.Element;
  readonly class?: string;
}) {
  return (
    <div
      class={`flex flex-col gap-5 rounded-[14px] border border-border bg-card px-6 py-6 ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}

function CardTitle(props: { readonly children: JSX.Element }) {
  return (
    <h3 class="font-bold font-display text-[16px] text-foreground tracking-[-0.01em]">
      {props.children}
    </h3>
  );
}

function CardDesc(props: { readonly children: JSX.Element }) {
  return (
    <p class="mt-0.5 text-[13px] text-muted-foreground leading-relaxed tracking-[0.01em]">
      {props.children}
    </p>
  );
}

function FormGrid(props: { readonly children: JSX.Element }) {
  return (
    <div class="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
      {props.children}
    </div>
  );
}

function FormGroup(props: {
  readonly children: JSX.Element;
  readonly fullWidth?: boolean;
}) {
  return (
    <div
      class={`flex flex-col gap-1.5 ${props.fullWidth ? "col-span-1 -col-end-1 max-[600px]:col-span-auto" : ""}`}
    >
      {props.children}
    </div>
  );
}

function FormLabel(props: { readonly children: JSX.Element }) {
  return (
    <span class="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.04em]">
      {props.children}
    </span>
  );
}

function FormInput(props: {
  readonly type?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
}) {
  return (
    <input
      class="h-[42px] rounded-[10px] border border-border bg-card px-3.5 font-[inherit] text-[14px] text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      max={props.max}
      min={props.min}
      placeholder={props.placeholder}
      step={props.step}
      type={props.type ?? "text"}
      value={props.value}
    />
  );
}

function FormTextarea(props: {
  readonly value?: string;
  readonly placeholder?: string;
  readonly rows?: number;
}) {
  return (
    <textarea
      class="min-h-[80px] resize-y rounded-[10px] border border-border bg-card px-3.5 py-2.5 font-[inherit] text-[14px] text-foreground leading-relaxed outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      placeholder={props.placeholder}
      rows={props.rows ?? 3}
      value={props.value}
    />
  );
}

function FormSelect(props: {
  readonly children: JSX.Element;
  readonly value?: string;
}) {
  return (
    <select
      class="h-[42px] cursor-pointer appearance-none rounded-[10px] border border-border bg-[length:12px_8px] bg-[position:right_14px_center] bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2712%27%20height%3D%278%27%20viewBox%3D%270%200%2012%208%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M1%201.5L6%206.5L11%201.5%27%20stroke%3D%27%23737c77%27%20stroke-width%3D%271.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E')] bg-card bg-no-repeat px-3.5 pr-9 font-[inherit] text-[14px] text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
      value={props.value}
    >
      {props.children}
    </select>
  );
}

function ToggleRow(props: {
  readonly title: string;
  readonly desc: string;
  readonly checked?: boolean;
  readonly last?: boolean;
}) {
  return (
    <div
      class={`flex items-center justify-between gap-4 py-3 ${props.last ? "" : "border-border border-b"}`}
    >
      <div class="min-w-0 flex-1">
        <div class="font-medium text-[14px] text-foreground tracking-[0.01em]">
          {props.title}
        </div>
        <div class="mt-0.5 text-[12px] text-muted-foreground tracking-[0.01em]">
          {props.desc}
        </div>
      </div>
      <label class="relative h-6 w-11 shrink-0">
        <input
          checked={props.checked}
          class="absolute h-0 w-0 opacity-0"
          type="checkbox"
        />
        <span class="absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full bg-border transition-[background] duration-250 before:absolute before:bottom-[3px] before:left-[3px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-white before:shadow-card before:transition-[transform] before:duration-250 before:content-[''] checked:bg-primary dark:checked:bg-accent" />
      </label>
    </div>
  );
}

function BtnRow(props: { readonly children: JSX.Element }) {
  return (
    <div class="flex items-center justify-end gap-2.5 pt-2">
      {props.children}
    </div>
  );
}

/* ── sections ──────────────────────────────────────────────────── */

function SectionBisnis() {
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

function SectionUmum() {
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
                  class={`flex flex-1 items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 font-medium text-[13px] transition-[border-color,background,color] duration-150 ${
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

function SectionPajak() {
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

function SectionPembayaran() {
  const methods = [
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

  return (
    <SectionCard>
      <div>
        <CardTitle>Metode Pembayaran</CardTitle>
        <CardDesc>
          Kelola metode pembayaran yang diterima di kasir Anda.
        </CardDesc>
      </div>
      <For each={methods}>
        {(m, i) => (
          <ToggleRow
            checked={m.checked}
            desc={m.desc}
            last={i() === methods.length - 1}
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

function SectionStruk() {
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

const STAFF = [
  { initials: "YB", name: "Yos Bb", role: "Manager", active: true },
  { initials: "RS", name: "Rina Sari", role: "Kasir Senior", active: true },
  { initials: "AF", name: "Ahmad Fauzi", role: "Kasir", active: true },
  { initials: "DL", name: "Dian Lestari", role: "Barista", active: false },
] as const;

function SectionTim() {
  return (
    <SectionCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Kasir & Tim</CardTitle>
          <CardDesc>Kelola anggota tim dan hak akses kasir Anda.</CardDesc>
        </div>
        <Button type="button">
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tambah Anggota
        </Button>
      </div>
      <div class="flex flex-col gap-2">
        <For each={STAFF}>
          {(s) => (
            <div class="flex items-center gap-3.5 rounded-[10px] border border-border bg-muted px-4 py-3.5">
              <div class="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent-soft font-bold font-display text-[13px] text-primary">
                {s.initials}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-[14px] text-foreground">
                  {s.name}
                </div>
                <div class="mt-px text-[12px] text-muted-foreground">
                  {s.role}
                </div>
              </div>
              <span
                class={`rounded-full px-2.5 py-[3px] font-semibold text-[11px] uppercase tracking-[0.04em] ${
                  s.active
                    ? "bg-accent/10 text-primary dark:text-accent"
                    : "bg-status-danger/10 text-status-danger dark:bg-status-danger dark:text-status-danger-foreground"
                }`}
              >
                {s.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          )}
        </For>
      </div>
    </SectionCard>
  );
}

const DEVICES = [
  {
    name: "Thermal Printer — EPSON TM-T82X",
    status: "Terhubung via USB",
    connected: true,
    Icon: PrinterIcon,
    kind: "printer" as const,
  },
  {
    name: "Barcode Scanner — Honeywell 1900g",
    status: "Terhubung via USB",
    connected: true,
    Icon: ScannerIcon,
    kind: "scanner" as const,
  },
  {
    name: "Kitchen Printer — EPSON TM-U220",
    status: "Tidak terhubung",
    connected: false,
    Icon: PrinterIcon,
    kind: "printer" as const,
  },
] as const;

function SectionPerangkat() {
  return (
    <SectionCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Perangkat Terhubung</CardTitle>
          <CardDesc>
            Kelola printer, scanner, dan perangkat keras lainnya.
          </CardDesc>
        </div>
        <Button look="outline" tone="neutral" type="button">
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Tambah Perangkat
        </Button>
      </div>
      <div class="flex flex-col gap-2">
        <For each={DEVICES}>
          {(d) => (
            <div class="flex items-center gap-3.5 rounded-[10px] border border-border bg-muted p-4">
              <div
                class={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] ${
                  d.kind === "printer"
                    ? "bg-accent/10 text-primary dark:text-accent"
                    : "bg-status-warning/15 text-status-warning dark:bg-status-warning dark:text-status-warning-foreground"
                }`}
              >
                <d.Icon class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-[14px] text-foreground">
                  {d.name}
                </div>
                <div class="mt-0.5 text-[12px] text-muted-foreground">
                  <span
                    class={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                      d.connected
                        ? "bg-status-success dark:bg-accent"
                        : "bg-faint-foreground"
                    }`}
                  />
                  {d.status}
                </div>
              </div>
              <label class="relative h-6 w-11 shrink-0">
                <input
                  checked={d.connected}
                  class="absolute h-0 w-0 opacity-0"
                  type="checkbox"
                />
                <span class="absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full bg-border transition-[background] duration-250 before:absolute before:bottom-[3px] before:left-[3px] before:h-[18px] before:w-[18px] before:rounded-full before:bg-white before:shadow-card before:transition-[transform] before:duration-250 before:content-[''] checked:bg-primary dark:checked:bg-accent" />
              </label>
            </div>
          )}
        </For>
      </div>
    </SectionCard>
  );
}

function SectionTentang() {
  return (
    <SectionCard class="items-center text-center">
      <div class="grid h-16 w-16 place-items-center rounded-[18px] border border-border bg-muted">
        <InfoIcon class="h-8 w-8 text-faint-foreground" />
      </div>
      <div class="font-bold font-display text-[20px] text-foreground">
        Sakti POS
      </div>
      <div class="-mt-2 text-[13px] text-muted-foreground">
        Versi 1.0.0 (Build 2026.06)
      </div>
      <p class="max-w-[360px] text-center text-[13px] text-muted-foreground leading-relaxed">
        Sistem kasir modern untuk bisnis F&amp;B Anda. Didesain untuk cepat,
        andal, dan mudah digunakan.
      </p>
      <div class="mt-2 flex gap-3">
        <button
          class="font-medium text-[13px] text-primary transition-[opacity] duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Kebijakan Privasi
        </button>
        <button
          class="font-medium text-[13px] text-primary transition-[opacity] duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Syarat &amp; Ketentuan
        </button>
        <button
          class="font-medium text-[13px] text-primary transition-[opacity] duration-150 hover:opacity-75 dark:text-accent"
          type="button"
        >
          Bantuan
        </button>
      </div>
    </SectionCard>
  );
}

/* ── public map ─────────────────────────────────────────────────── */

const SECTION_MAP: Record<SectionKey, () => JSX.Element> = {
  bisnis: SectionBisnis,
  umum: SectionUmum,
  pajak: SectionPajak,
  pembayaran: SectionPembayaran,
  struk: SectionStruk,
  tim: SectionTim,
  perangkat: SectionPerangkat,
  tentang: SectionTentang,
};

export function SectionPanel(props: { readonly active: SectionKey }) {
  const key = () => props.active;
  return (
    <Show keyed when={key()}>
      {(k) => (
        <motion.div
          animate={{ opacity: 1, x: 0, scale: 1 }}
          initial={{ opacity: 0, x: 16, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {SECTION_MAP[k]()}
        </motion.div>
      )}
    </Show>
  );
}
