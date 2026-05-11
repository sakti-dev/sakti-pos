import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { TbOutlinePrinter, TbOutlineRefresh } from "solid-icons/tb";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onMount,
  Show,
} from "solid-js";
import { toast } from "solid-sonner";
import { FormTextField } from "~/components/form/form-text-field";
import { Button } from "~/components/ui/button";
import {
  getOutletReceiptDefaults,
  saveOutletReceiptHeader,
} from "~/db/outlets";
import { createLogger } from "~/lib/logger";
import {
  getDefaultPrinter,
  listPairedPrinters,
  requestBluetoothPermission,
  saveDefaultPrinter,
  type ThermalPrinterInfo,
  testPrint,
} from "~/lib/printer/client";
import { PrinterSettingsSchema } from "~/lib/schema/printer-settings-form";
import { currentOutletId } from "~/store/outlet";

const settingsPrinterLogger = createLogger({
  module: "settings",
  scope: "printer",
});

const PERMISSION_RELOAD_FALLBACK_MS = 1500;
const LIST_PRINTERS_TIMEOUT_MS = 3000;
const LIST_PRINTERS_TIMEOUT_MESSAGE =
  "Gagal memuat printer. Tekan Segarkan untuk mencoba lagi.";

const withTimeout = async <T,>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void
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
    getDefaultPrinter() ?? null
  );
  const receiptForm = createForm({
    schema: PrinterSettingsSchema,
    initialInput: {
      receiptAddress: "",
      receiptName: "",
    },
  });
  const canSaveReceiptHeader = createMemo(() => {
    const input = getInput(receiptForm);
    return !!input?.receiptName?.trim() || !!input?.receiptAddress?.trim();
  });
  const [receiptDefaults, { refetch: refetchReceiptDefaults }] = createResource(
    currentOutletId,
    async (outletId) => {
      if (!outletId) {
        return null;
      }

      return await getOutletReceiptDefaults(outletId);
    }
  );

  createEffect(() => {
    const defaults = receiptDefaults();
    if (!defaults) {
      return;
    }

    reset(receiptForm, {
      initialInput: {
        receiptAddress: defaults.effectiveAddress ?? "",
        receiptName: defaults.effectiveName,
      },
    });
  });

  const loadPrinters = async (options?: { notify?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await withTimeout(
        listPairedPrinters(),
        LIST_PRINTERS_TIMEOUT_MS,
        () => settingsPrinterLogger.warn("load_printers:timeout")
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
      let message = "Gagal memuat printer";
      if (e instanceof Error) {
        message = e.message;
      } else if (typeof e === "string") {
        message = e;
      }
      if (message.toLowerCase().includes("permission")) {
        setNeedsPermission(true);
        setError(null);
      } else {
        setError(message);
        settingsPrinterLogger.error("load_printers:failed", e, {
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
      settingsPrinterLogger.error("request_permission:failed", e);
    });

    try {
      let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
      const fallback = new Promise<"fallback">((resolve) => {
        fallbackTimeout = setTimeout(() => {
          settingsPrinterLogger.warn("request_permission:reload_fallback");
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
      settingsPrinterLogger.warn("test_print:skipped_no_printer");
      return;
    }
    setTesting(true);
    try {
      await requestBluetoothPermission();
      await testPrint(address);
      toast.success("Test print berhasil");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencetak test");
      settingsPrinterLogger.error("test_print:failed", e, { address });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveReceiptHeader = async () => {
    const outletId = currentOutletId();
    if (!outletId) {
      return;
    }

    const input = getInput(receiptForm);
    if (!input) {
      return;
    }

    try {
      const updated = await saveOutletReceiptHeader(
        outletId,
        input.receiptName?.trim() || null,
        input.receiptAddress?.trim() || null
      );
      if (!updated) {
        toast.error("Gagal menyimpan header struk");
        return;
      }

      toast.success("Header struk disimpan");
      await refetchReceiptDefaults();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan header");
      settingsPrinterLogger.error("receipt_header:failed", e, { outletId });
    }
  };

  return (
    <section class="space-y-4">
      <Show when={currentOutletId()}>
        <div class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">
            Header Struk
          </h2>
          <div class="space-y-3 rounded-xl border bg-card p-4">
            <p class="text-muted-foreground text-sm">
              Biarkan kosong untuk mengikuti nama merchant dan alamat outlet.
            </p>
            <Form of={receiptForm} onSubmit={handleSaveReceiptHeader}>
              <Field of={receiptForm} path={["receiptName"]}>
                {(field) => (
                  <FormTextField
                    {...field.props}
                    errors={field.errors}
                    input={field.input}
                    label="Nama merchant di struk"
                    placeholder={
                      receiptDefaults()?.merchantName ?? "Nama merchant"
                    }
                    type="text"
                  />
                )}
              </Field>

              <Field of={receiptForm} path={["receiptAddress"]}>
                {(field) => (
                  <FormTextField
                    {...field.props}
                    errors={field.errors}
                    input={field.input}
                    label="Alamat di struk"
                    placeholder={
                      receiptDefaults()?.outletAddress ?? "Alamat outlet"
                    }
                    type="text"
                  />
                )}
              </Field>

              <Button
                class="w-full"
                disabled={!canSaveReceiptHeader()}
                onClick={handleSaveReceiptHeader}
                size="sm"
                type="button"
                variant="outline"
              >
                Simpan Header Struk
              </Button>
            </Form>
          </div>
        </div>
      </Show>

      <div class="space-y-2">
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
        <div class="overflow-hidden rounded-xl border bg-card">
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
                    <p class="truncate font-medium text-sm">{printer.name}</p>
                    <p class="text-muted-foreground text-xs">
                      {printer.address}
                    </p>
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
      </div>
    </section>
  );
}
