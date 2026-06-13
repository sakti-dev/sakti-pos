import { For } from "solid-js";
import { CreditCardIcon, FileIcon, ShieldIcon } from "~/assets";

const features = [
  {
    Icon: CreditCardIcon,
    text: "Pembayaran Cepat",
    label: "Tunai, QRIS, kartu, e-wallet",
  },
  {
    Icon: FileIcon,
    text: "Laporan Real-time",
    label: "Pendapatan, transaksi, dan stok",
  },
  {
    Icon: ShieldIcon,
    text: "Aman & Terenkripsi",
    label: "Data bisnis Anda terlindungi",
  },
] as const;

export function PinLeftPanel() {
  return (
    <div class="relative hidden w-[55%] flex-col items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#0b5239,#063a28)] p-12 lg:flex">
      <div class="pointer-events-none absolute -top-[120px] -right-[80px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(211,250,153,0.15)_0%,transparent_70%)]" />
      <div class="pointer-events-none absolute -bottom-[100px] -left-[60px] h-[350px] w-[350px] rounded-full bg-[radial-gradient(circle,rgba(211,250,153,0.10)_0%,transparent_70%)]" />

      <div class="relative z-[1] flex animate-fade-in flex-col items-center gap-5">
        <div class="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-lg bg-white/10 p-3.5 backdrop-blur-[10px] dark:border">
          <img
            alt=""
            class="h-full w-full object-contain brightness-0 invert"
            height={44}
            src="/logo.png"
            width={44}
          />
        </div>
        <div class="font-display font-extrabold text-[32px] text-white tracking-[-0.02em]">
          Nata POS
        </div>
        <div class="max-w-[280px] text-center font-medium text-[15px] text-white/55 leading-relaxed tracking-[0.01em]">
          Kelola transaksi, katalog, dan laporan bisnis Anda dalam satu
          platform.
        </div>

        <div class="mt-10 flex flex-col gap-3">
          <For each={features}>
            {(f, i) => (
              <div
                class="flex items-center gap-3.5 rounded-[14px] border border-white/10 bg-white/5 px-5 py-3.5 backdrop-blur-[8px] transition-[background] duration-200 hover:bg-white/10"
                style={{
                  animation: `fadeUp 0.4s ease ${0.15 + i() * 0.1}s both`,
                }}
              >
                <div class="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent/15">
                  <f.Icon class="h-[18px] w-[18px] text-accent" />
                </div>
                <div>
                  <div class="font-medium text-[14px] text-white/75 tracking-[0.01em]">
                    {f.text}
                  </div>
                  <div class="mt-0.5 text-[12px] text-white/40 tracking-[0.01em]">
                    {f.label}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
