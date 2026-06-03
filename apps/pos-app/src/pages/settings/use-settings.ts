import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { createEffect, createMemo, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { getOutletById, updateOutletTimezone } from "~/db/outlets";
import { logout as cloudLogout, getSession } from "~/lib/auth/cloud";
import { DEFAULT_BUSINESS_TIMEZONE } from "~/lib/date-time";
import { createLogger } from "~/lib/logger";
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
import { currentUser, logout } from "~/store/auth";
import {
  clearOutletContext,
  currentOutletId,
  currentOutletTimezone,
  setOutletTimezone,
} from "~/store/outlet";
import { formatSyncSuccessMessage, syncNow, syncStatus } from "~/store/sync";
import { setTheme, theme } from "~/store/theme";

interface DbInfo {
  db_path: string;
  size_formatted: string;
}

interface DbSnapshotExportResult {
  snapshot_path: string;
}

const dbLogger = createLogger({ domain: "DB", module: "settings" });

export { formatSyncSuccessMessage };

export function useSettings() {
  const navigate = useNavigate();
  const user = currentUser();
  const [showLogoutConfirm, setShowLogoutConfirm] = createSignal(false);
  const [showPinDrawer, setShowPinDrawer] = createSignal(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = createSignal(false);
  const [selectedOutletTimezone, setSelectedOutletTimezone] = createSignal(
    currentOutletTimezone()
  );
  const [savingTimezone, setSavingTimezone] = createSignal(false);
  const [exportingDbSnapshot, setExportingDbSnapshot] = createSignal(false);
  const dbInfoQuery = useDrizzleQuery(["db-info"], () =>
    invoke<DbInfo>("get_db_info")
  );
  const cloudSessionQuery = useDrizzleQuery(["cloud-session"], () =>
    getSession().catch(() => null)
  );
  const outletQuery = useDrizzleQuery(currentOutletId, async () => {
    const outletId = currentOutletId();
    if (!outletId) {
      return;
    }

    return await getOutletById(outletId);
  });

  createEffect(() => {
    const current = outletQuery.data();
    if (!current) {
      return;
    }

    setSelectedOutletTimezone(current.timezone ?? DEFAULT_BUSINESS_TIMEZONE);
  });

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleDisconnect = async () => {
    try {
      await cloudLogout();
    } catch {
      // Session may already be expired
    }
    clearOutletContext();
    toast.success("Akun cloud terputus");
    setShowDisconnectConfirm(false);
    cloudSessionQuery.refetch();
  };

  const handleSyncNow = async () => {
    try {
      const result = await syncNow();
      toast.success(formatSyncSuccessMessage(result));
    } catch {
      toast.error("Gagal menyinkronkan — periksa koneksi internet");
    }
  };

  const handleConnectCloud = () => {
    navigate("/cloud-login");
  };

  const handleExportDbSnapshot = async () => {
    if (exportingDbSnapshot()) {
      return;
    }

    setExportingDbSnapshot(true);
    dbLogger.info("snapshot_export_requested");
    try {
      const result = await invoke<DbSnapshotExportResult>("export_db_snapshot");
      toast.success(
        `Snapshot DB tersimpan di perangkat: ${result.snapshot_path}`
      );
      dbLogger.info("snapshot_export_finished", {
        snapshotPath: result.snapshot_path,
      });
    } catch (error) {
      toast.error("Gagal mengekspor snapshot DB");
      dbLogger.error("snapshot_export_failed", error);
    } finally {
      setExportingDbSnapshot(false);
    }
  };

  const handleSaveOutletTimezone = async () => {
    const outletId = currentOutletId();
    if (!outletId) {
      return;
    }

    setSavingTimezone(true);
    try {
      const updated = await updateOutletTimezone(
        outletId,
        selectedOutletTimezone()
      );
      if (!updated) {
        toast.error("Gagal memperbarui zona waktu outlet");
        return;
      }

      setOutletTimezone(updated.timezone);
      setSelectedOutletTimezone(updated.timezone);
      toast.success("Zona waktu outlet diperbarui");
      await outletQuery.refetch();
    } catch {
      toast.error("Gagal memperbarui zona waktu outlet");
    } finally {
      setSavingTimezone(false);
    }
  };

  const activeUserLabel = createMemo(
    () => user?.name.charAt(0).toUpperCase() ?? "?"
  );

  return {
    activeUserLabel,
    cloudSession: cloudSessionQuery.data,
    currentOutletId,
    dbInfo: dbInfoQuery.data,
    handleDisconnect,
    handleConnectCloud,
    handleExportDbSnapshot,
    handleLogout,
    handleSyncNow,
    handleSaveOutletTimezone,
    setShowDisconnectConfirm,
    setShowLogoutConfirm,
    setShowPinDrawer,
    setSelectedOutletTimezone,
    showDisconnectConfirm,
    showLogoutConfirm,
    showPinDrawer,
    selectedOutletTimezone,
    savingTimezone,
    exportingDbSnapshot,
    syncStatus,
    theme,
    user,
    setTheme,
  };
}
