import { useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import {
	TbOutlineChevronRight,
	TbOutlineCloud,
	TbOutlineCloudOff,
} from "solid-icons/tb";
import { createResource, createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { AppShell } from "~/components/layout";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
} from "~/components/ui/drawer";
import { logout as cloudLogout, getSession } from "~/lib/cloud-auth";
import { cn } from "~/lib/utils";
import { changeCurrentUserPin, currentUser, logout } from "~/store/auth";
import { clearOutletContext, currentOutletId } from "~/store/outlet";
import { syncNow, syncStatus } from "~/store/sync";
import { setTheme, theme } from "~/store/theme";

interface DbInfo {
	db_path: string;
	size_formatted: string;
}

export default function Settings() {
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
			toast.success(
				`Sinkronisasi berhasil (${result.pull.rows_received} diterima, ${result.purged} dibersihkan)`,
			);
		} catch {
			toast.error("Gagal menyinkronkan — periksa koneksi internet");
		}
	};

	return (
		<AppShell title="Pengaturan">
			<div class="space-y-4 p-4">
				<div class="flex items-center gap-3 rounded-xl border bg-card p-4">
					<div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-lg text-primary-foreground">
						{user?.name.charAt(0).toUpperCase() ?? "?"}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold text-lg">{user?.name}</p>
						<p class="text-muted-foreground text-sm capitalize">{user?.role}</p>
					</div>
				</div>

				<section class="space-y-2">
					<h2 class="font-medium text-muted-foreground text-sm">Akun</h2>
					<div class="rounded-xl border bg-card">
						<button
							class="flex w-full items-center justify-between p-4 active:bg-accent"
							onClick={() => setShowPinDrawer(true)}
							type="button"
						>
							<span>Ubah PIN</span>
							<TbOutlineChevronRight class="size-5 text-muted-foreground" />
						</button>
					</div>
				</section>

				<Show when={cloudSession()?.user}>
					<section class="space-y-2">
						<h2 class="font-medium text-muted-foreground text-sm">Cloud</h2>
						<div class="rounded-xl border bg-card">
							<div class="flex items-center gap-3 border-b p-4">
								<TbOutlineCloud class="size-5 text-primary shrink-0" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">
										{cloudSession()?.user?.email}
									</p>
									<Show when={currentOutletId()}>
										<p class="text-muted-foreground text-xs">
											Toko aktif terhubung
										</p>
									</Show>
								</div>
							</div>
							<Show when={currentOutletId()}>
								<div class="flex items-center justify-between border-b p-4">
									<span class="text-sm">Sinkronisasi</span>
									<Button
										class="h-8 text-xs"
										disabled={syncStatus() === "syncing"}
										onClick={handleSyncNow}
										size="sm"
										variant="outline"
									>
										{syncStatus() === "syncing"
											? "Menyinkronkan..."
											: "Sinkron Sekarang"}
									</Button>
								</div>
							</Show>
							<button
								class="flex w-full items-center justify-between p-4 active:bg-accent"
								onClick={() => setShowDisconnectConfirm(true)}
								type="button"
							>
								<span class="text-sm text-destructive">Lepaskan Perangkat</span>
								<TbOutlineCloudOff class="size-5 text-destructive" />
							</button>
						</div>
					</section>
				</Show>

				<Show when={!cloudSession()?.user}>
					<section class="space-y-2">
						<h2 class="font-medium text-muted-foreground text-sm">Cloud</h2>
						<div class="rounded-xl border bg-card">
							<button
								class="flex w-full items-center justify-between p-4 active:bg-accent"
								onClick={() => navigate("/cloud-login")}
								type="button"
							>
								<span class="text-sm">Hubungkan akun cloud</span>
								<TbOutlineChevronRight class="size-5 text-muted-foreground" />
							</button>
						</div>
					</section>
				</Show>

				<section class="space-y-2">
					<h2 class="font-medium text-muted-foreground text-sm">Aplikasi</h2>
					<div class="rounded-xl border bg-card">
						<div class="flex items-center justify-between border-b p-4">
							<span>Tema</span>
							<div class="flex overflow-hidden rounded-lg border">
								<button
									class={cn(
										"px-3 py-1 text-sm",
										theme() === "light" && "bg-primary text-primary-foreground",
									)}
									onClick={() => setTheme("light")}
									type="button"
								>
									Terang
								</button>
								<button
									class={cn(
										"border-x px-3 py-1 text-sm",
										theme() === "system" &&
											"bg-primary text-primary-foreground",
									)}
									onClick={() => setTheme("system")}
									type="button"
								>
									Sistem
								</button>
								<button
									class={cn(
										"px-3 py-1 text-sm",
										theme() === "dark" && "bg-primary text-primary-foreground",
									)}
									onClick={() => setTheme("dark")}
									type="button"
								>
									Gelap
								</button>
							</div>
						</div>
						<div class="flex items-center justify-between border-b p-4">
							<span>Versi</span>
							<span class="text-muted-foreground text-sm">0.1.0</span>
						</div>
						<div class="flex items-center justify-between border-b p-4">
							<span>Ukuran Data</span>
							<span class="text-muted-foreground text-sm">
								{dbInfo()?.size_formatted ?? "Memuat..."}
							</span>
						</div>
						<Show when={user?.role === "manager" || user?.role === "owner"}>
							<div class="flex items-center justify-between p-4">
								<span>Akses</span>
								<span class="text-muted-foreground text-sm">Owner</span>
							</div>
						</Show>
					</div>
				</section>

				<Button
					class="w-full"
					onClick={() => setShowLogoutConfirm(true)}
					variant="outline"
				>
					Keluar
				</Button>
			</div>

			<ConfirmDrawer
				confirmLabel="Lepaskan"
				message="Perangkat akan dilepas dari outlet ini. Anda perlu login ulang dengan akun cloud atau memasangkan ulang perangkat."
				onClose={() => setShowDisconnectConfirm(false)}
				onConfirm={handleDisconnect}
				open={showDisconnectConfirm()}
				title="Lepaskan Perangkat"
				variant="destructive"
			/>

			<ConfirmDrawer
				confirmLabel="Keluar"
				message="Anda akan keluar dari aplikasi."
				onClose={() => setShowLogoutConfirm(false)}
				onConfirm={handleLogout}
				open={showLogoutConfirm()}
				title="Keluar"
				variant="destructive"
			/>

			<Show when={showPinDrawer()}>
				<ChangePinDrawer onClose={() => setShowPinDrawer(false)} />
			</Show>
		</AppShell>
	);
}

function ChangePinDrawer(props: { onClose: () => void }) {
	const [newPin, setNewPin] = createSignal("");
	const [confirmPin, setConfirmPin] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [error, setError] = createSignal("");

	const isValid = () => {
		const np = newPin();
		const cp = confirmPin();
		return np.length >= 6 && np === cp;
	};

	const handleSubmit = async () => {
		if (!isValid()) {
			return;
		}
		setSaving(true);
		setError("");
		try {
			await changeCurrentUserPin(newPin());
			toast.success("PIN berhasil diubah");
			props.onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Drawer
			closeOnEscapeKeyDown={false}
			closeOnOutsideFocus={false}
			modal={false}
			onOpenChange={(open) => {
				if (!open) {
					props.onClose();
				}
			}}
			open={true}
			trapFocus={false}
		>
			<DrawerPortal>
				<DrawerOverlay />
				<DrawerContent class="px-4 pb-6">
					<DrawerTitle>Ubah PIN</DrawerTitle>
					<div class="space-y-3 pt-2">
						<Show when={error()}>
							{(msg) => (
								<div class="rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
									{msg()}
								</div>
							)}
						</Show>
						<div>
							<label
								class="mb-1 block text-muted-foreground text-sm"
								for="new-pin"
							>
								PIN Baru
							</label>
							<input
								autocomplete="new-password"
								class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
								id="new-pin"
								inputMode="numeric"
								maxlength={6}
								onInput={(e) => setNewPin(e.currentTarget.value)}
								placeholder="6 digit"
								type="password"
							/>
						</div>
						<div>
							<label
								class="mb-1 block text-muted-foreground text-sm"
								for="confirm-pin"
							>
								Konfirmasi PIN
							</label>
							<input
								autocomplete="new-password"
								class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
								id="confirm-pin"
								inputMode="numeric"
								maxlength={6}
								onInput={(e) => setConfirmPin(e.currentTarget.value)}
								placeholder="Ulangi PIN baru"
								type="password"
							/>
						</div>
						<Show when={newPin() && confirmPin() && newPin() !== confirmPin()}>
							<p class="text-destructive text-sm">PIN tidak cocok</p>
						</Show>
					</div>
					<div class="mt-4 flex gap-2">
						<Button class="flex-1" onClick={props.onClose} variant="outline">
							Batal
						</Button>
						<Button
							class="flex-1"
							disabled={!isValid() || saving()}
							onClick={handleSubmit}
						>
							{saving() ? "Menyimpan..." : "Simpan"}
						</Button>
					</div>
				</DrawerContent>
			</DrawerPortal>
		</Drawer>
	);
}
