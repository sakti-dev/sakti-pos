import { TbOutlinePrinter, TbOutlineRefresh } from "solid-icons/tb";
import { createSignal, For, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
	getDefaultPrinter,
	listPairedPrinters,
	requestBluetoothPermission,
	saveDefaultPrinter,
	type ThermalPrinterInfo,
	testPrint,
} from "~/lib/printer";
import { logPrinterError, logPrinterWarn } from "~/lib/printer-log";

const PERMISSION_RELOAD_FALLBACK_MS = 1_500;
const LIST_PRINTERS_TIMEOUT_MS = 3_000;
const LIST_PRINTERS_TIMEOUT_MESSAGE =
	"Gagal memuat printer. Tekan Segarkan untuk mencoba lagi.";

const withTimeout = async <T,>(
	promise: Promise<T>,
	ms: number,
	onTimeout: () => void,
): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			onTimeout();
			reject(new Error(LIST_PRINTERS_TIMEOUT_MESSAGE));
		}, ms);
	});

	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
};

export default function PrinterSettings() {
	const [printers, setPrinters] = createSignal<ThermalPrinterInfo[]>([]);
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);
	const [needsPermission, setNeedsPermission] = createSignal(false);
	const [refreshing, setRefreshing] = createSignal(false);
	const [testing, setTesting] = createSignal(false);
	const [savedAddress, setSavedAddress] = createSignal(
		getDefaultPrinter() ?? null,
	);

	const loadPrinters = async (options?: { notify?: boolean }) => {
		setLoading(true);
		setError(null);
		try {
			const result = await withTimeout(
				listPairedPrinters(),
				LIST_PRINTERS_TIMEOUT_MS,
				() => logPrinterWarn("settings:load_printers:timeout"),
			);
			setPrinters(result);
			setNeedsPermission(false);
			if (options?.notify) {
				if (result.length > 0) {
					toast.success(`${result.length} printer ditemukan`);
				} else {
					toast.error("Tidak ada printer ditemukan");
				}
			}
		} catch (e) {
			const message =
				e instanceof Error
					? e.message
					: typeof e === "string"
						? e
						: "Gagal memuat printer";
			if (message.toLowerCase().includes("permission")) {
				setNeedsPermission(true);
				setError(null);
			} else {
				setError(message);
				logPrinterError("settings:load_printers:failed", e, {
					message,
				});
				if (options?.notify) {
					toast.error(message);
				}
			}
		} finally {
			setLoading(false);
		}
	};

	onMount(loadPrinters);

	const handleGrantPermission = async () => {
		const permissionRequest = requestBluetoothPermission();
		permissionRequest.catch((e) => {
			toast.error("Izin Bluetooth ditolak");
			logPrinterError("settings:request_permission:failed", e);
		});

		try {
			let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
			const fallback = new Promise<"fallback">((resolve) => {
				fallbackTimeout = setTimeout(() => {
					logPrinterWarn("settings:request_permission:reload_fallback");
					resolve("fallback");
				}, PERMISSION_RELOAD_FALLBACK_MS);
			});
			const result = await Promise.race([
				permissionRequest.then(() => "permission" as const),
				fallback,
			]);
			if (result === "permission" && fallbackTimeout) {
				clearTimeout(fallbackTimeout);
			}
			await loadPrinters();
		} catch {
			// The permission request promise has its own rejection handler above.
		}
	};

	const handleSelectPrinter = (address: string) => {
		saveDefaultPrinter(address);
		setSavedAddress(address);
		toast.success("Printer disimpan");
	};

	const handleRefreshPrinters = async () => {
		setRefreshing(true);
		try {
			await loadPrinters({ notify: true });
		} finally {
			setRefreshing(false);
		}
	};

	const handleTestPrint = async () => {
		const address = savedAddress();
		if (!address) {
			logPrinterWarn("settings:test_print:skipped_no_printer");
			return;
		}
		setTesting(true);
		try {
			await requestBluetoothPermission();
			await testPrint(address);
			toast.success("Test print berhasil");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal mencetak test");
			logPrinterError("settings:test_print:failed", e, { address });
		} finally {
			setTesting(false);
		}
	};

	return (
		<section class="space-y-2">
			<div class="flex items-center justify-between gap-2">
				<h2 class="font-medium text-muted-foreground text-sm">Printer</h2>
				<Button
					disabled={loading() || refreshing()}
					onClick={handleRefreshPrinters}
					size="sm"
					variant="outline"
				>
					<TbOutlineRefresh
						class="size-4"
						classList={{ "animate-spin": refreshing() }}
					/>
					<span>{refreshing() ? "Menyegarkan..." : "Segarkan"}</span>
				</Button>
			</div>
			<div class="rounded-xl border bg-card overflow-hidden">
				<Show when={loading()}>
					<div class="p-4 text-muted-foreground text-sm">Memuat...</div>
				</Show>

				<Show when={error()}>
					{(msg) => <div class="p-4 text-destructive text-sm">{msg()}</div>}
				</Show>

				<Show when={needsPermission() && !loading()}>
					<div class="space-y-2 p-4">
						<p class="text-muted-foreground text-sm">
							Izin Bluetooth diperlukan untuk mencari printer
						</p>
						<Button class="w-full" onClick={handleGrantPermission} size="sm">
							Berikan Izin Bluetooth
						</Button>
					</div>
				</Show>

				<Show
					when={
						printers().length === 0 &&
						!loading() &&
						!error() &&
						!needsPermission()
					}
				>
					<div class="p-4 text-muted-foreground text-sm">
						Tidak ada printer ditemukan
					</div>
				</Show>

				<For each={printers()}>
					{(printer) => (
						<button
							class="flex w-full items-center justify-between border-b p-4 last:border-b-0 active:bg-accent"
							classList={{
								"bg-accent/50": savedAddress() === printer.address,
							}}
							onClick={() => handleSelectPrinter(printer.address)}
							type="button"
						>
							<div class="flex items-center gap-3">
								<TbOutlinePrinter class="size-5 shrink-0 text-muted-foreground" />
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{printer.name}</p>
									<p class="text-muted-foreground text-xs">{printer.address}</p>
								</div>
							</div>
							<Show when={savedAddress() === printer.address}>
								<span class="text-primary text-xs">Printer tersimpan</span>
							</Show>
						</button>
					)}
				</For>

				<Show when={savedAddress()}>
					<div class="border-t p-4">
						<Button
							class="w-full"
							disabled={testing()}
							onClick={handleTestPrint}
							size="sm"
							variant="outline"
						>
							{testing() ? "Mencetak..." : "Cetak Test"}
						</Button>
					</div>
				</Show>
			</div>
		</section>
	);
}
