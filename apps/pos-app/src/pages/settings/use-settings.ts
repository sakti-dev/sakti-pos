import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { createMemo, createResource, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { logout as cloudLogout, getSession } from "~/lib/cloud-auth";
import { currentUser, logout } from "~/store/auth";
import { clearOutletContext, currentOutletId } from "~/store/outlet";
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
	const [dbInfo] = createResource(() => invoke<DbInfo>("get_db_info"));
	const [cloudSession, { refetch: refetchCloudSession }] = createResource(() =>
		getSession().catch(() => null),
	);

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

	const activeUserLabel = createMemo(() => user?.name.charAt(0).toUpperCase() ?? "?");

	return {
		activeUserLabel,
		cloudSession,
		currentOutletId,
		dbInfo,
		handleDisconnect,
		handleConnectCloud,
		handleLogout,
		handleSyncNow,
		setShowDisconnectConfirm,
		setShowLogoutConfirm,
		setShowPinDrawer,
		showDisconnectConfirm,
		showLogoutConfirm,
		showPinDrawer,
		syncStatus,
		theme,
		user,
		setTheme,
	};
}
