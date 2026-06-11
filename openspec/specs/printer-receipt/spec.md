# Printer & Receipt

## Purpose

Sakti POS prints thermal receipts for Indonesian food & beverage businesses. The cashier completes a checkout in the POS app, and the system formats a structured receipt (header, line items, totals, payment, footer) into ESC/POS-compatible text for a Bluetooth Classic thermal printer connected to an Android tablet. The print step is fire-and-forget — a failed print never blocks the checkout. Cashiers can configure one default printer per device, test-print, and customize the receipt header (business name and address) per outlet.

## Architecture

```
SolidJS POS UI
  → TypeScript printer client (localStorage for default printer)
  → Tauri invoke commands (list/print/test/permissions)
  → Rust printer bridge (hardware/printer.rs)
  → Tauri Android Kotlin plugin (com.sakti_dev.sakti_pos.printer)
  → DantSu ESCPOS-ThermalPrinter-Android
  → Bluetooth Classic ESC/POS thermal printer (58mm)
```

## Requirements

### R1: Bluetooth Printer Discovery

The system SHALL list Android Bluetooth Classic paired (bonded) thermal printers.

**WHEN** the user opens Printer Settings or taps "Segarkan"
**THEN** the system invokes `list_paired_thermal_printers` and displays each printer's name and Bluetooth address

**WHEN** Bluetooth permission is missing
**THEN** the system shows a "Berikan Izin Bluetooth" button and invokes `request_bluetooth_permission`

**WHEN** the printer list times out after 3 seconds
**THEN** the system shows a timeout error message

**WHEN** no paired printers are found
**THEN** the system shows "Tidak ada printer ditemukan"

### R2: Default Printer Persistence

The system SHALL persist one default printer address per device using `localStorage` under the key `sakti.defaultPrinterAddress`.

**WHEN** the user taps a paired printer in the list
**THEN** the system saves its Bluetooth address as the default printer

**WHEN** `getDefaultPrinter()` is called
**THEN** the system returns the saved address or `null` if none is configured

### R3: Test Printing

The system SHALL support sending a test page to the selected default printer.

**WHEN** the user taps "Cetak Test" with a default printer configured
**THEN** the system invokes `request_bluetooth_permission` then `test_thermal_printer` with the saved address

**WHEN** test print succeeds
**THEN** the system shows "Test print berhasil"

**WHEN** test print fails
**THEN** the system shows the error message from the native bridge

### R4: Receipt Data Model

The system SHALL represent receipt data using the `ReceiptData` interface containing:

- `business`: business name (required), address (optional), phone (optional), timezone (optional)
- `items`: array of `{ name, quantity, unitPrice, subtotal }`
- `order`: `{ orderNumber, cashierName, createdAt }`
- `payment`: `{ method: "cash" | "qris", amountPaid, changeAmount }`
- `totals`: `{ total, subtotal?, tax?: { label, amount }, adminFee?: { label, amount } }`

### R5: Receipt Formatting (32-char ESC/POS)

The system SHALL format receipt text at 32-character line width using DantSu alignment tags (`[L]`, `[C]`, `[R]`).

**WHEN** `formatReceiptForAndroid` receives `ReceiptData`
**THEN** the output contains:
- Bold centered business name: `[C]<b><font size='big'>NAME</font></b>`
- Centered address (word-wrapped to 32 chars) and phone
- Separator line: `[C]--------------------------------`
- Order info: `No:`, `Tgl:` (formatted in business timezone), `Kasir:`
- Items: name (word-wrapped), quantity × unit price left-aligned, subtotal right-aligned
- Totals: optional subtotal/tax/admin fee lines, bold total line
- Payment: method label (TUNAI or QRIS), amount paid ("Bayar"), change ("Kembali") for cash only
- Footer: centered "Terima Kasih!" / "atas kunjungan Anda" followed by three blank lines

**WHEN** an item name exceeds 32 characters
**THEN** the formatter wraps it across multiple lines, each ≤ 32 characters

**WHEN** the payment method is "qris"
**THEN** the receipt omits the "Kembali" (change) line

### R6: Indonesian Locale Formatting

The system SHALL format monetary amounts using `Intl.NumberFormat("id-ID")` for Indonesian thousand separators (e.g., `36.000`).

### R7: Checkout Auto-Print

The system SHALL attempt to print a receipt in the background after a successful checkout.

**WHEN** a checkout completes and a default printer is configured
**THEN** the system builds `ReceiptData` from the cart, order number, cashier name, and outlet receipt header, then calls `printReceipt` asynchronously

**WHEN** the auto-print fails
**THEN** the checkout still completes and a toast error "Gagal mencetak struk" is shown

**WHEN** no default printer is configured
**THEN** no print attempt is made and checkout completes normally

### R8: Reprint After Checkout

The system SHALL allow the cashier to reprint the last receipt from the success overlay.

**WHEN** the checkout success overlay is visible with a `lastReceipt` stored
**THEN** a "Cetak Ulang" button is displayed

**WHEN** the cashier taps "Cetak Ulang"
**THEN** the system calls `printReceipt` with the stored receipt data and default printer address

**WHEN** reprint fails
**THEN** a toast error is shown but the success overlay remains

### R9: Receipt Header Customization

The system SHALL allow per-outlet customization of the receipt header (business name and address on the printed receipt).

**WHEN** the outlet has a `receiptName`
**THEN** that value is used as the business name on the receipt

**WHEN** the outlet's `receiptName` is empty
**THEN** the system falls back to the merchant name, then to the outlet name

**WHEN** the outlet has a `receiptAddress`
**THEN** that value is used as the address on the receipt

**WHEN** the outlet's `receiptAddress` is empty
**THEN** the system falls back to the outlet's address field

**WHEN** the user saves receipt header fields in Printer Settings
**THEN** the changes persist via `saveOutletReceiptHeader` and sync through baresync

### R10: Printer Settings Page

The system SHALL provide a Printer Settings page at `/settings/printer` accessible from the Settings home.

The page SHALL display:
- Receipt header form: editable merchant name and address fields (with placeholder fallbacks from the outlet record)
- "Simpan Header Struk" button to save receipt header changes
- Paired printers list with name and Bluetooth address
- "Segarkan" button to re-scan paired printers
- Selected printer highlighted with "Printer tersimpan" label
- "Cetak Test" button (visible only when a default printer is saved)

**WHEN** the user grants Bluetooth permission
**THEN** the system reloads the paired printer list after the permission request completes

### R11: Platform Support

The system SHALL support thermal printing only on Android via Bluetooth Classic.

**WHEN** the app runs on desktop (non-Android)
**THEN** Tauri commands return "Thermal printing is only supported on Android"

**WHEN** the app runs on Android
**THEN** printing routes through the Rust printer bridge → Kotlin plugin → DantSu library → Bluetooth Classic

### R12: Non-Functional Constraints

- Checkout SHALL NOT fail because printing failed.
- Printer connection timeout is approximately 2.5 seconds (owned by the app, not Android default socket timeout).
- V1 SHALL NOT support: Web Bluetooth, BLE scanning, iOS printing, cloud printer management, automatic discovery of unpaired printers, or image/logo printing.
