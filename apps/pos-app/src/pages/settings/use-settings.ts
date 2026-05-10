import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { toast } from "solid-sonner";
import { getOutletById, updateOutletTimezone } from "~/db/outlets";
import { logout as cloudLogout, getSession } from "~/lib/auth/cloud";
import { DEFAULT_BUSINESS_TIMEZONE } from "~/lib/date-time";
import { currentUser, logout } from "~/store/auth";
import {
  clearOutletContext,
  currentOutletId,
  currentOutletTimezone,
  setOutletTimezone,
} from "~/store/outlet";
import { type SyncNowResult, syncNow, syncStatus } from "~/store/sync";
import { setTheme, theme } from "~/store/theme";

interface DbInfo {
  db_path: string;
  size_formatted: string;
}

export function formatSyncSuccessMessage(result: SyncNowResult): string {
  if (result.mode === "skipped") {
    return "Data sudah terbaru";
  }

  if (result.mode === "pull_only") {
    return `Sinkronisasi berhasil (${result.pull.rows_received} diterima)`;
  }

  const sentTables = result.push.tables_synced.length;
  if (result.mode === "push_only") {
    return `Sinkronisasi berhasil (${sentTables} tabel dikirim)`;
  }

  return `Sinkronisasi berhasil (${result.pull.rows_received} diterima, ${sentTables} tabel dikirim, ${result.purged} dibersihkan)`;
}

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
  const [dbInfo] = createResource(() => invoke<DbInfo>("get_db_info"));
  const [cloudSession, { refetch: refetchCloudSession }] = createResource(() =>
    getSession().catch(() => null)
  );
  const [outlet, { refetch: refetchOutlet }] = createResource(
    currentOutletId,
    async (outletId) => {
      if (!outletId) {
        return;
      }

      return await getOutletById(outletId);
    }
  );

  createEffect(() => {
    const current = outlet();
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
    refetchCloudSession();
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
      await refetchOutlet();
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
    cloudSession,
    currentOutletId,
    dbInfo,
    handleDisconnect,
    handleConnectCloud,
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
    syncStatus,
    theme,
    user,
    setTheme,
  };
}
