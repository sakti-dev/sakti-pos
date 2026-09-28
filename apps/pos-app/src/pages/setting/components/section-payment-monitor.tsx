import type { JSX } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
  appIcons,
  hydrateAppIcons,
  isNotificationAccessGranted,
  listInstalledApps,
  openNotificationAccessSettings,
  type QrisAppInfo,
  readCachedInstalledApps,
  readCachedNotificationAccess,
  readStoredMonitoredPackages,
  saveMonitoredPackages,
  syncStoredPackagesToNative,
} from "~/lib/qris/detection";
import { createLogger } from "~/lib/utils";
import {
  BtnRow,
  CardDesc,
  CardTitle,
  FormInput,
  SectionCard,
  ToggleRow,
} from "./primitives";

const logger = createLogger({ domain: "SETTINGS", module: "payment-monitor" });

const LOAD_DEFER_MS = 1000;

export function SectionPaymentMonitor() {
  const [apps, setApps] = createSignal<readonly QrisAppInfo[]>([]);
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const [search, setSearch] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [accessGranted, setAccessGranted] = createSignal<boolean | null>(null);
  const [saving, setSaving] = createSignal(false);

  const refreshAccessState = async () => {
    try {
      setAccessGranted(await isNotificationAccessGranted());
    } catch {
      setAccessGranted(null);
    }
  };

  const load = async () => {
    const startedAt = performance.now();
    try {
      await syncStoredPackagesToNative();
      const [installed, granted] = await Promise.all([
        listInstalledApps(),
        isNotificationAccessGranted(),
      ]);
      setApps(installed);
      setSelected(new Set(readStoredMonitoredPackages()));
      const previousGranted = accessGranted();
      if (previousGranted !== null && previousGranted !== granted) {
        logger.info("ACCESS_STATE_CHANGED", { granted });
      }
      setAccessGranted(granted);
      logger.info("SECTION_LOADED", {
        appCount: installed.length,
        granted,
        selectedCount: readStoredMonitoredPackages().length,
        durationMs: Math.round(performance.now() - startedAt),
      });
      hydrateAppIcons(installed).catch(() => undefined);
    } catch (error) {
      logger.error("MONITORED_APPS_LOAD_FAILED", String(error));
      if (apps().length === 0) {
        toast.error("Tidak bisa memuat daftar aplikasi");
      }
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    const cached = readCachedInstalledApps();
    if (cached.length > 0) {
      setApps(cached);
      setSelected(new Set(readStoredMonitoredPackages()));
      setLoading(false);
      logger.info("APP_LIST_CACHE_HIT", { count: cached.length });
    }
    const cachedAccess = readCachedNotificationAccess();
    if (cachedAccess !== null) {
      setAccessGranted(cachedAccess);
    }
    const mountedAt = performance.now();
    window.setTimeout(() => {
      logger.info("DEFERRED_LOAD_STARTED", {
        deferredMs: Math.round(performance.now() - mountedAt),
      });
      load();
    }, LOAD_DEFER_MS);
  });
  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshAccessState();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  const toggle = (packageName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMonitoredPackages([...selected()]);
      toast.success("Aplikasi yang dipantau tersimpan");
    } catch (error) {
      logger.error("MONITORED_APPS_SAVE_FAILED", String(error));
      toast.error("Gagal menyimpan pilihan aplikasi");
    } finally {
      setSaving(false);
    }
  };

  const appIcon = (app: QrisAppInfo): JSX.Element => (
    <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[25%] bg-muted">
      <Show keyed when={appIcons().get(app.packageName)}>
        {(iconDataUrl) => <img alt="" class="size-10" src={iconDataUrl} />}
      </Show>
      <Show when={!appIcons().has(app.packageName)}>
        <span class="font-semibold text-caption text-muted-foreground">
          {app.appName.charAt(0).toUpperCase()}
        </span>
      </Show>
    </span>
  );

  const filteredApps = () => {
    const query = search().trim().toLowerCase();
    if (!query) {
      return apps();
    }
    return apps().filter(
      (app) =>
        app.appName.toLowerCase().includes(query) ||
        app.packageName.toLowerCase().includes(query)
    );
  };

  return (
    <SectionCard>
      <div>
        <CardTitle>Pemantau Notifikasi Pembayaran</CardTitle>
        <CardDesc>
          Pilih aplikasi bank/e-wallet yang notifikasinya dipantau untuk
          membantu konfirmasi pembayaran QRIS. Pilihan tersimpan di perangkat
          ini.
        </CardDesc>
      </div>

      <ToggleRow
        checked={accessGranted() === true}
        desc={
          accessGranted() === true
            ? "Notifikasi dipantau. Deteksi pembayaran aktif."
            : "Notifikasi belum dipantau. Ketuk untuk membuka pengaturan akses notifikasi, lalu izinkan Sakti POS."
        }
        onChange={(next) => {
          if (next) {
            openNotificationAccessSettings().catch((error: unknown) => {
              logger.error("OPEN_NOTIFICATION_SETTINGS_FAILED", String(error));
              toast.error("Tidak bisa membuka pengaturan notifikasi");
            });
          }
        }}
        title="Akses Notifikasi"
      />

      <FormInput
        onInput={(e) => {
          const target = e.currentTarget;
          if (target instanceof HTMLInputElement) {
            setSearch(target.value);
          }
        }}
        placeholder="Cari aplikasi (mis. BCA, Livin', GoBiz)…"
        type="search"
        value={search()}
      />

      <Show when={loading()}>
        <p class="text-caption text-faint-foreground">
          Memuat daftar aplikasi…
        </p>
      </Show>
      <Show when={!loading()}>
        <Show
          fallback={
            <p class="text-caption text-faint-foreground">
              Tidak ada aplikasi yang cocok dengan pencarian.
            </p>
          }
          when={filteredApps().length > 0}
        >
          <ul class="scrollbar-thin max-h-80 space-y-1 overflow-y-auto rounded-lg border border-border/50">
            <For each={filteredApps()}>
              {(app) => (
                <li class="border-border/30 border-b last:border-b-0">
                  <ToggleRow
                    checked={selected().has(app.packageName)}
                    class="px-4"
                    desc={app.packageName}
                    descClass="truncate"
                    icon={appIcon(app)}
                    onChange={() => toggle(app.packageName)}
                    title={app.appName}
                  />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <p class="text-caption text-faint-foreground">
        {selected().size} aplikasi dipilih
      </p>

      <BtnRow>
        <Button
          disabled={saving()}
          look="outline"
          onClick={load}
          tone="neutral"
          type="button"
        >
          Muat Ulang
        </Button>
        <Button disabled={saving()} onClick={handleSave} type="button">
          <Show when={saving()}>Menyimpan…</Show>
          <Show when={!saving()}>Simpan Pilihan</Show>
        </Button>
      </BtnRow>
    </SectionCard>
  );
}
