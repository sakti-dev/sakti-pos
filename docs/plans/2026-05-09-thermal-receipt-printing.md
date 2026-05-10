# Thermal Receipt Printing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Android thermal receipt printing to Sakti POS using a native Tauri mobile printer plugin backed by the Android ESC/POS thermal printer library.

**Architecture:** The frontend stays TypeScript/SolidJS and talks to a small printer service. Android printer transport runs natively through a Tauri mobile plugin so the app can use paired Bluetooth Classic thermal printers, and later TCP/USB printers, without relying on Web Bluetooth. Receipt data is captured from the completed checkout before the cart is cleared, then converted into a printer-friendly formatted receipt.

**Tech Stack:** Tauri v2 mobile plugin, Kotlin, DantSu `ESCPOS-ThermalPrinter-Android`, TypeScript, SolidJS, Vitest, Android Bluetooth permissions

**Primary Native Library:** `com.github.DantSu:ESCPOS-ThermalPrinter-Android:3.3.0`

**Reference Docs:**
- Tauri mobile plugin development: `https://v2.tauri.app/develop/plugins/develop-mobile/`
- Android ESC/POS library: `https://github.com/DantSu/ESCPOS-ThermalPrinter-Android`
- Receipt visual reference: `docs/receipt-preview.html`

---

## Hardware Assumptions

- Target device is an Android tablet running the Tauri mobile app.
- Target printer is a common 58mm ESC/POS thermal printer paired in Android OS Bluetooth settings.
- Bluetooth Classic paired-device printing is required for v1.
- BLE-only discovery is not enough for v1.
- Cashier should be able to configure one default printer and run a test print.
- Checkout must still complete if printing fails.

---

## Task 1: Native Printer Feasibility Spike

**Files:**
- Modify: `apps/pos-app/src-tauri/gen/android/app/build.gradle.kts`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Create: `apps/pos-app/src-tauri/src/printer.rs`

**Step 1: Add the Android dependency**

Modify `apps/pos-app/src-tauri/gen/android/app/build.gradle.kts`:

```kotlin
dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.github.DantSu:ESCPOS-ThermalPrinter-Android:3.3.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}
```

If Gradle cannot resolve JitPack, add JitPack to the Android repositories in `apps/pos-app/src-tauri/gen/android/settings.gradle.kts` or the appropriate generated Gradle repository file after inspecting the current generated Android project.

**Step 2: Add Android Bluetooth permissions**

Modify `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml` and add these above `<application>`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-feature android:name="android.hardware.bluetooth" android:required="false" />
```

**Step 3: Add temporary Rust command stubs**

Create `apps/pos-app/src-tauri/src/printer.rs`:

```rust
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub address: String,
    pub name: String,
}

#[tauri::command]
pub async fn list_paired_thermal_printers() -> Result<Vec<PrinterInfo>, String> {
    Err("Native Android printer bridge is not implemented yet".to_string())
}

#[tauri::command]
pub async fn test_thermal_printer(address: String) -> Result<(), String> {
    let _ = address;
    Err("Native Android printer bridge is not implemented yet".to_string())
}
```

**Step 4: Register command stubs**

Modify `apps/pos-app/src-tauri/src/lib.rs`:

```rust
mod printer;
```

Add commands to `tauri::generate_handler!`:

```rust
printer::list_paired_thermal_printers,
printer::test_thermal_printer,
```

**Step 5: Run Android build**

Run:

```bash
cd apps/pos-app && bun run tauri android build
```

Expected: The Android project compiles with the added dependency and permissions. If the build fails on JitPack or generated Gradle structure, fix repository configuration before continuing.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "chore(printer): add Android thermal printer dependency"
```

---

## Task 2: Create Tauri Mobile Printer Plugin Boundary

**Files:**
- Create: `apps/pos-app/src-tauri/src/printer_mobile.rs`
- Modify: `apps/pos-app/src-tauri/src/printer.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Create or modify: Android Kotlin plugin files generated by Tauri plugin tooling

**Step 1: Generate or scaffold a local Tauri mobile plugin**

Use Tauri's mobile plugin pattern. The Android implementation must define a Kotlin class extending `app.tauri.plugin.Plugin`, annotated with `@TauriPlugin`, and native commands annotated with `@Command`.

The plugin must expose these commands:

```text
plugin:thermal-printer|listPrinters
plugin:thermal-printer|printReceipt
plugin:thermal-printer|testPrint
plugin:thermal-printer|checkPermissions
plugin:thermal-printer|requestPermissions
```

**Step 2: Define Android command argument classes**

In the Kotlin plugin, define invoke argument classes for:

```kotlin
@InvokeArg
class PrintReceiptArgs {
    lateinit var address: String
    lateinit var formattedText: String
}

@InvokeArg
class TestPrintArgs {
    lateinit var address: String
}
```

**Step 3: Implement permission methods**

The Kotlin plugin must declare and handle:

- `BLUETOOTH_CONNECT` for Android 12+
- `BLUETOOTH_SCAN` if scanning is ever added
- legacy Bluetooth permissions for Android 11 and lower

Use Tauri mobile plugin permission helpers so the frontend can call `checkPermissions` and `requestPermissions`.

**Step 4: Wire Rust command wrappers**

Update `apps/pos-app/src-tauri/src/printer.rs` so public Tauri commands call the mobile plugin on Android. Keep desktop behavior explicit:

```rust
#[tauri::command]
pub async fn list_paired_thermal_printers<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<PrinterInfo>, String> {
    #[cfg(target_os = "android")]
    {
        return app
            .plugin_handle("thermal-printer")
            .map_err(|error| error.to_string())?
            .run_mobile_plugin("listPrinters", serde_json::json!({}))
            .map_err(|error| error.to_string());
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Thermal printing is only supported on Android".to_string())
    }
}
```

Adjust the exact API to match the generated Tauri plugin handle types.

**Step 5: Run type/build check**

Run:

```bash
cd apps/pos-app && bun run tauri android build
```

Expected: Android build succeeds and the app starts.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(printer): add native Android printer bridge"
```

---

## Task 3: Implement Android Paired Printer Listing

**Files:**
- Modify: Android Kotlin thermal printer plugin class
- Modify: `apps/pos-app/src-tauri/src/printer.rs`

**Step 1: Implement native listing**

In Kotlin, use Android's `BluetoothAdapter` bonded devices. Return paired devices as:

```json
[
  {
    "name": "Printer58",
    "address": "00:11:22:33:44:55"
  }
]
```

Only include devices that have an address. Do not attempt BLE scanning in v1.

**Step 2: Handle permission errors clearly**

If Bluetooth permission is missing, reject the invoke with:

```text
Bluetooth permission is required to list paired printers
```

If Bluetooth is unavailable or disabled, reject with:

```text
Bluetooth is not available or not enabled
```

**Step 3: Run on Android hardware**

Run the app on an Android device with a paired printer:

```bash
cd apps/pos-app && bun run tauri android dev
```

Expected: Calling `list_paired_thermal_printers` returns the paired printer.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(printer): list paired Android Bluetooth printers"
```

---

## Task 4: Receipt Data Types

**Files:**
- Create: `apps/pos-app/src/lib/receipt/types.ts`
- Test: `apps/pos-app/src/lib/receipt/__test__/types.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import type { ReceiptData } from "../types";

describe("ReceiptData type", () => {
	test("accepts completed checkout receipt data", () => {
		const data: ReceiptData = {
			business: {
				address: "Jl. Merdeka No. 123",
				name: "SAKTI KOPI",
				phone: "021-1234567",
			},
			items: [
				{
					name: "Kopi Susu Gula Aren",
					quantity: 2,
					subtotal: 36_000,
					unitPrice: 18_000,
				},
			],
			order: {
				cashierName: "Rina",
				createdAt: "2026-05-09T14:32:00.000Z",
				orderNumber: "2026-05-09-014",
			},
			payment: {
				amountPaid: 50_000,
				changeAmount: 14_000,
				method: "cash",
			},
			totals: {
				total: 36_000,
			},
		};

		expect(data.payment.method).toBe("cash");
		expect(data.items[0].subtotal).toBe(36_000);
	});
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/lib/receipt/__test__/types.test.ts
```

Expected: FAIL because `../types` does not exist.

**Step 3: Implement types**

Create `apps/pos-app/src/lib/receipt/types.ts`:

```ts
export interface ReceiptItem {
	name: string;
	quantity: number;
	subtotal: number;
	unitPrice: number;
}

export interface ReceiptBusinessInfo {
	address?: string;
	name: string;
	phone?: string;
}

export interface ReceiptOrderInfo {
	cashierName: string;
	createdAt: string;
	orderNumber: string;
}

export interface ReceiptLineAmount {
	amount: number;
	label: string;
}

export interface ReceiptTotals {
	adminFee?: ReceiptLineAmount;
	subtotal?: number;
	tax?: ReceiptLineAmount;
	total: number;
}

export interface ReceiptPaymentInfo {
	amountPaid: number;
	changeAmount: number | null;
	method: "cash" | "qris";
}

export interface ReceiptData {
	business: ReceiptBusinessInfo;
	items: ReceiptItem[];
	order: ReceiptOrderInfo;
	payment: ReceiptPaymentInfo;
	totals: ReceiptTotals;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun run test src/lib/receipt/__test__/types.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/receipt/
git commit -m "feat(receipt): add receipt data types"
```

---

## Task 5: Receipt Formatter for Native Android Library

**Files:**
- Create: `apps/pos-app/src/lib/receipt/format-receipt.ts`
- Test: `apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, test } from "vitest";
import { formatReceiptForAndroid } from "../format-receipt";
import type { ReceiptData } from "../types";

const receipt: ReceiptData = {
	business: {
		address: "Jl. Merdeka No. 123",
		name: "SAKTI KOPI",
		phone: "021-1234567",
	},
	items: [
		{
			name: "Kopi Susu Gula Aren",
			quantity: 2,
			subtotal: 36_000,
			unitPrice: 18_000,
		},
	],
	order: {
		cashierName: "Rina",
		createdAt: "2026-05-09T14:32:00.000Z",
		orderNumber: "2026-05-09-014",
	},
	payment: {
		amountPaid: 50_000,
		changeAmount: 14_000,
		method: "cash",
	},
	totals: {
		total: 36_000,
	},
};

describe("formatReceiptForAndroid", () => {
	test("uses DantSu formatted text alignment tags", () => {
		const text = formatReceiptForAndroid(receipt);

		expect(text).toContain("[C]<b><font size='big'>SAKTI KOPI</font></b>");
		expect(text).toContain("[L]No:");
		expect(text).toContain("[L]Kasir:");
		expect(text).toContain("[L]Kopi Susu Gula Aren");
		expect(text).toContain("[R]36.000");
	});

	test("wraps long item names without exceeding 32 visible chars", () => {
		const text = formatReceiptForAndroid({
			...receipt,
			items: [
				{
					name: "Roti Bakar Coklat Keju Spesial Lebar",
					quantity: 1,
					subtotal: 15_000,
					unitPrice: 15_000,
				},
			],
		});

		expect(text).toContain("[L]Roti Bakar Coklat Keju");
		expect(text).toContain("[L]Spesial Lebar");
	});
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/lib/receipt/__test__/format-receipt.test.ts
```

Expected: FAIL because `format-receipt.ts` does not exist.

**Step 3: Implement formatter**

Create `apps/pos-app/src/lib/receipt/format-receipt.ts`:

```ts
import dayjs from "dayjs";
import type { ReceiptData } from "./types";

const LINE_WIDTH = 32;

const formatAmount = (amount: number): string =>
	new Intl.NumberFormat("id-ID").format(amount);

const wrapWords = (value: string, width: number): string[] => {
	const words = value.trim().split(/\s+/);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length <= width) {
			current = next;
			continue;
		}
		if (current) {
			lines.push(current);
		}
		current = word.length > width ? word.slice(0, width) : word;
	}

	if (current) {
		lines.push(current);
	}

	return lines;
};

const lineAmount = (label: string, amount: number): string =>
	`[L]${label}[R]${formatAmount(amount)}`;

export const formatReceiptForAndroid = (data: ReceiptData): string => {
	const lines: string[] = [
		`[C]<b><font size='big'>${data.business.name}</font></b>`,
	];

	if (data.business.address) {
		for (const line of wrapWords(data.business.address, LINE_WIDTH)) {
			lines.push(`[C]${line}`);
		}
	}
	if (data.business.phone) {
		lines.push(`[C]${data.business.phone}`);
	}

	lines.push(
		"[C]--------------------------------",
		`[L]No: ${data.order.orderNumber}`,
		`[L]Tgl: ${dayjs(data.order.createdAt).format("YYYY-MM-DD HH:mm")}`,
		`[L]Kasir: ${data.order.cashierName}`,
		"[C]--------------------------------",
	);

	for (const item of data.items) {
		for (const nameLine of wrapWords(item.name, LINE_WIDTH)) {
			lines.push(`[L]${nameLine}`);
		}
		lines.push(`[L]  ${item.quantity} x ${formatAmount(item.unitPrice)}[R]${formatAmount(item.subtotal)}`);
	}

	lines.push("[C]--------------------------------");
	if (data.totals.subtotal != null) {
		lines.push(lineAmount("Subtotal", data.totals.subtotal));
	}
	if (data.totals.tax) {
		lines.push(lineAmount(data.totals.tax.label, data.totals.tax.amount));
	}
	if (data.totals.adminFee) {
		lines.push(lineAmount(data.totals.adminFee.label, data.totals.adminFee.amount));
	}
	lines.push(`[L]<b>TOTAL</b>[R]<b>${formatAmount(data.totals.total)}</b>`);
	lines.push("[C]--------------------------------");

	const paymentLabel = data.payment.method === "cash" ? "TUNAI" : "QRIS";
	lines.push(`[L]Metode: ${paymentLabel}`);
	lines.push(lineAmount("Bayar", data.payment.amountPaid));
	if (data.payment.method === "cash" && data.payment.changeAmount != null) {
		lines.push(lineAmount("Kembali", data.payment.changeAmount));
	}

	lines.push(
		"[C]--------------------------------",
		"[C]Terima Kasih!",
		"[C]atas kunjungan Anda",
		"[L]\n[L]\n[L]",
	);

	return lines.join("\n");
};
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun run test src/lib/receipt/__test__/format-receipt.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/receipt/
git commit -m "feat(receipt): format receipts for Android printer"
```

---

## Task 6: Frontend Printer Service

**Files:**
- Create: `apps/pos-app/src/lib/printer.ts`
- Test: `apps/pos-app/src/lib/__test__/printer.test.ts`

**Step 1: Write failing tests**

```ts
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { listPairedPrinters, printReceipt, saveDefaultPrinter } from "../printer";
import type { ReceiptData } from "../receipt/types";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const receipt: ReceiptData = {
	business: { name: "SAKTI KOPI" },
	items: [{ name: "Kopi", quantity: 1, subtotal: 18_000, unitPrice: 18_000 }],
	order: {
		cashierName: "Rina",
		createdAt: "2026-05-09T14:32:00.000Z",
		orderNumber: "2026-05-09-001",
	},
	payment: { amountPaid: 20_000, changeAmount: 2_000, method: "cash" },
	totals: { total: 18_000 },
};

describe("printer service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});

	test("lists paired printers through Tauri command", async () => {
		vi.mocked(invoke).mockResolvedValue([{ address: "00:11", name: "Printer58" }]);

		const printers = await listPairedPrinters();

		expect(printers).toEqual([{ address: "00:11", name: "Printer58" }]);
		expect(invoke).toHaveBeenCalledWith("list_paired_thermal_printers");
	});

	test("prints receipt through native command", async () => {
		vi.mocked(invoke).mockResolvedValue(undefined);

		await printReceipt("00:11", receipt);

		expect(invoke).toHaveBeenCalledWith("print_thermal_receipt", {
			address: "00:11",
			formattedText: expect.stringContaining("SAKTI KOPI"),
		});
	});

	test("saves default printer address", () => {
		saveDefaultPrinter("00:11");

		expect(localStorage.getItem("sakti.defaultPrinterAddress")).toBe("00:11");
	});
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/lib/__test__/printer.test.ts
```

Expected: FAIL because `printer.ts` does not exist.

**Step 3: Implement service**

Create `apps/pos-app/src/lib/printer.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { formatReceiptForAndroid } from "~/lib/receipt/format-receipt";
import type { ReceiptData } from "~/lib/receipt/types";

const DEFAULT_PRINTER_KEY = "sakti.defaultPrinterAddress";

export interface ThermalPrinterInfo {
	address: string;
	name: string;
}

export const listPairedPrinters = async (): Promise<ThermalPrinterInfo[]> =>
	invoke<ThermalPrinterInfo[]>("list_paired_thermal_printers");

export const printReceipt = async (
	address: string,
	receipt: ReceiptData,
): Promise<void> => {
	await invoke("print_thermal_receipt", {
		address,
		formattedText: formatReceiptForAndroid(receipt),
	});
};

export const testPrint = async (address: string): Promise<void> => {
	await invoke("test_thermal_printer", { address });
};

export const getDefaultPrinter = (): string | null =>
	localStorage.getItem(DEFAULT_PRINTER_KEY);

export const saveDefaultPrinter = (address: string): void => {
	localStorage.setItem(DEFAULT_PRINTER_KEY, address);
};
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/pos-app && bun run test src/lib/__test__/printer.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/
git commit -m "feat(printer): add frontend printer service"
```

---

## Task 7: Native Receipt Printing Command

**Files:**
- Modify: `apps/pos-app/src-tauri/src/printer.rs`
- Modify: Android Kotlin thermal printer plugin class

**Step 1: Add Rust command shape**

Add a command that accepts `address` and `formattedText`:

```rust
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintThermalReceiptArgs {
    pub address: String,
    pub formatted_text: String,
}

#[tauri::command]
pub async fn print_thermal_receipt<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    address: String,
    formatted_text: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return app
            .plugin_handle("thermal-printer")
            .map_err(|error| error.to_string())?
            .run_mobile_plugin(
                "printReceipt",
                PrintThermalReceiptArgs {
                    address,
                    formatted_text,
                },
            )
            .map_err(|error| error.to_string());
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let _ = address;
        let _ = formatted_text;
        Err("Thermal printing is only supported on Android".to_string())
    }
}
```

Adjust the exact generic return type to match the generated plugin handle API.

**Step 2: Register command**

Add to `tauri::generate_handler!`:

```rust
printer::print_thermal_receipt,
```

**Step 3: Implement Android print command**

In Kotlin, implement `printReceipt` using DantSu:

```kotlin
@Command
fun printReceipt(invoke: Invoke) {
    val args = invoke.parseArgs(PrintReceiptArgs::class.java)

    CoroutineScope(Dispatchers.IO).launch {
        try {
            val connection = BluetoothPrintersConnections().list
                ?.firstOrNull { it.device.address == args.address }

            if (connection == null) {
                invoke.reject("Printer is not paired or not available")
                return@launch
            }

            val printer = EscPosPrinter(connection, 203, 48f, 32)
            printer.printFormattedText(args.formattedText)
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject(error.message ?: "Failed to print receipt")
        }
    }
}
```

Use the exact DantSu connection API available in the imported version. Keep blocking printer work on `Dispatchers.IO`.

**Step 4: Implement test print**

Use a short formatted text:

```text
[C]<b>SAKTI POS</b>
[C]Test Print
[C]--------------------------------
[L]Printer connected.
[L]
[L]
```

**Step 5: Run hardware test**

Pair printer in Android OS settings, then run:

```bash
cd apps/pos-app && bun run tauri android dev
```

Expected: A test print comes out of the paired printer.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(printer): print receipts through Android Bluetooth"
```

---

## Task 8: Printer Settings UI

**Files:**
- Create: `apps/pos-app/src/components/settings/printer-settings.tsx`
- Test: `apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx`
- Modify: settings page file if one exists after inspection

**Step 1: Write failing UI tests**

Test these behaviors:

- Shows paired printers returned by `listPairedPrinters`.
- Saves selected printer through `saveDefaultPrinter`.
- Calls `testPrint` when the test button is clicked.
- Shows an error message if listing or test print fails.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/components/settings/__test__/printer-settings.test.tsx
```

Expected: FAIL because the component does not exist.

**Step 3: Implement component**

Create a compact settings component using existing project Button/Card/input patterns. The component should:

- Load paired printers on mount.
- Show a select for printer name/address.
- Save selected address as default.
- Provide a test print button.
- Show clear status text: `Printer disimpan`, `Mencetak test...`, `Test print berhasil`, or an error message.

Do not use `console.error` in production component code.

**Step 4: Wire into settings page**

Find the existing settings route/page and add the printer settings section there. If no settings page exists, add the component to the nearest admin/settings area and document the route.

**Step 5: Run tests**

Run:

```bash
cd apps/pos-app && bun run test src/components/settings/__test__/printer-settings.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/components/settings/ apps/pos-app/src/pages/
git commit -m "feat(printer): add printer settings UI"
```

---

## Task 9: Capture Checkout Receipt Snapshot

**Files:**
- Modify: `apps/pos-app/src/pages/pos.tsx`
- Modify: `apps/pos-app/src/pages/__test__/pos.test.tsx`

**Step 1: Write failing test**

Add a test to `apps/pos-app/src/pages/__test__/pos.test.tsx`:

```tsx
test("captures receipt data before clearing cart after payment", async () => {
	// Mock cartItems with one product and createOrder returning an order number.
	// Complete payment.
	// Verify printReceipt receives receipt data with the order number,
	// cashier name, item name, quantity, and total.
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/pos-app && bun run test src/pages/__test__/pos.test.tsx
```

Expected: FAIL because printing is not integrated.

**Step 3: Implement receipt snapshot builder in POS flow**

In `handlePayment`, before `clearCart()`:

- Capture `cartItems()`.
- Capture `cartTotal()`.
- Capture current user name.
- Use the `orderNumber` returned by `createOrder`.
- Build `ReceiptData`.
- Use default business info for v1:
  - name: `SAKTI POS`
  - optional address/phone can be added from settings later.

**Step 4: Trigger background print when default printer exists**

After order creation succeeds:

```ts
const printerAddress = getDefaultPrinter();
if (printerAddress) {
	printReceipt(printerAddress, receiptData).catch((error: unknown) => {
		const message =
			error instanceof Error ? error.message : "Gagal mencetak struk";
		toast.error(message);
	});
}
```

Checkout should still show the existing `Selesai!` overlay even if printing fails.

**Step 5: Run POS tests**

Run:

```bash
cd apps/pos-app && bun run test src/pages/__test__/pos.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/pages/
git commit -m "feat(receipt): print receipt after checkout"
```

---

## Task 10: Optional Reprint on Completion

**Files:**
- Modify: `apps/pos-app/src/pages/pos.tsx`
- Modify: `apps/pos-app/src/pages/__test__/pos.test.tsx`

**Step 1: Write failing test**

Add a test:

```tsx
test("allows cashier to retry printing from the success overlay", async () => {
	// Complete checkout with a configured default printer.
	// Verify a Cetak Ulang button appears.
	// Click it and verify printReceipt is called again with same receipt data.
});
```

**Step 2: Implement retry state**

Store the last `ReceiptData` while the success overlay is visible. Add a `Cetak Ulang` button to the overlay only when a default printer is configured.

**Step 3: Run POS tests**

Run:

```bash
cd apps/pos-app && bun run test src/pages/__test__/pos.test.tsx
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/pos-app/src/pages/
git commit -m "feat(receipt): allow reprint after checkout"
```

---

## Task 11: Verification

**Files:** None

**Step 1: Run focused frontend tests**

Run:

```bash
cd apps/pos-app && bun run test src/lib/receipt/__test__/types.test.ts src/lib/receipt/__test__/format-receipt.test.ts src/lib/__test__/printer.test.ts src/pages/__test__/pos.test.tsx
```

Expected: PASS.

**Step 2: Run all POS tests**

Run:

```bash
cd apps/pos-app && bun run test
```

Expected: PASS.

**Step 3: Run typecheck**

Run:

```bash
cd apps/pos-app && bun run check-types
```

Expected: No TypeScript errors.

**Step 4: Run lint**

Run:

```bash
cd apps/pos-app && bun run lint
```

Expected: No Ultracite errors.

**Step 5: Run Android build**

Run:

```bash
cd apps/pos-app && bun run tauri android build
```

Expected: Android APK builds successfully.

**Step 6: Hardware acceptance test**

On the target Android tablet:

1. Pair the printer in Android OS Bluetooth settings with PIN `0000` or `1234`.
2. Open Sakti POS.
3. Open Printer Settings.
4. Select paired printer.
5. Tap Test Print.
6. Complete a checkout.
7. Verify the receipt prints and checkout success still appears.
8. Turn printer off and complete another checkout.
9. Verify checkout still succeeds and a print failure toast appears.

**Step 7: Commit final fixes if needed**

```bash
git add apps/pos-app/
git commit -m "fix(printer): resolve verification issues"
```

---

## File Summary

| Action | Path |
|--------|------|
| Modify | `apps/pos-app/src-tauri/gen/android/app/build.gradle.kts` |
| Modify | `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml` |
| Modify | `apps/pos-app/src-tauri/src/lib.rs` |
| Create | `apps/pos-app/src-tauri/src/printer.rs` |
| Create/Modify | Android Kotlin Tauri mobile plugin files |
| Create | `apps/pos-app/src/lib/receipt/types.ts` |
| Create | `apps/pos-app/src/lib/receipt/format-receipt.ts` |
| Create | `apps/pos-app/src/lib/printer.ts` |
| Create | `apps/pos-app/src/lib/receipt/__test__/types.test.ts` |
| Create | `apps/pos-app/src/lib/receipt/__test__/format-receipt.test.ts` |
| Create | `apps/pos-app/src/lib/__test__/printer.test.ts` |
| Create | `apps/pos-app/src/components/settings/printer-settings.tsx` |
| Create | `apps/pos-app/src/components/settings/__test__/printer-settings.test.tsx` |
| Modify | `apps/pos-app/src/pages/pos.tsx` |
| Modify | `apps/pos-app/src/pages/__test__/pos.test.tsx` |

---

## Explicit Non-Goals For V1

- No Web Bluetooth.
- No BLE scanning.
- No iOS printing.
- No cloud printer management.
- No image/logo printing until text receipts are proven on hardware.
- No automatic discovery of unpaired printers.
