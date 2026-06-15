import type { Component } from "solid-js";
import { PrinterIcon, ScannerIcon } from "~/assets";

export type DeviceKind = "printer" | "scanner";

export interface ConnectedDevice {
  readonly connected: boolean;
  readonly Icon: Component<{ class?: string }>;
  readonly kind: DeviceKind;
  readonly name: string;
  readonly status: string;
}

export const connectedDevices: readonly ConnectedDevice[] = [
  {
    name: "Thermal Printer — EPSON TM-T82X",
    status: "Terhubung via USB",
    connected: true,
    Icon: PrinterIcon,
    kind: "printer",
  },
  {
    name: "Barcode Scanner — Honeywell 1900g",
    status: "Terhubung via USB",
    connected: true,
    Icon: ScannerIcon,
    kind: "scanner",
  },
  {
    name: "Kitchen Printer — EPSON TM-U220",
    status: "Tidak terhubung",
    connected: false,
    Icon: PrinterIcon,
    kind: "printer",
  },
];
