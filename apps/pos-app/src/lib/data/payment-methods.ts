export interface PaymentMethodConfig {
  readonly checked: boolean;
  readonly desc: string;
  readonly title: string;
}

export const paymentMethods: readonly PaymentMethodConfig[] = [
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
];
