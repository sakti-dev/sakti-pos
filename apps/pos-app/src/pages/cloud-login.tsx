import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	ApiError,
	type CurrentCloudStaff,
	login as cloudLogin,
	register as cloudRegister,
	getCurrentCloudStaff,
	getGoogleOAuthUrl,
	getMerchants,
	getOutlets,
	type Outlet,
	type SessionMerchant,
} from "~/lib/cloud-auth";
import { getActiveStaff, loginWithCloudStaff } from "~/store/auth";
import { setOutletContext } from "~/store/outlet";
import { syncNow } from "~/store/sync";

type Step = "login" | "register" | "merchant-picker" | "outlet-picker";

const routeForRole = (role: string) => (role === "cashier" ? "/pos" : "/");

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function debugLog(event: string, data: Record<string, unknown>) {
	console.info(`[CLOUD-LOGIN] ${event} ${JSON.stringify(data)}`);
}

export default function CloudLogin() {
	const navigate = useNavigate();
	const [step, setStep] = createSignal<Step>("login");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [name, setName] = createSignal("");
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [merchants, setMerchants] = createSignal<SessionMerchant[]>([]);
	const [outlets, setOutlets] = createSignal<Outlet[]>([]);

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			if (step() === "login") {
				await cloudLogin(email(), password());
			} else {
				await cloudRegister(email(), password(), name());
			}

			const userMerchants = await getMerchants();
			if (userMerchants.length > 0) {
				setMerchants(userMerchants);
				setStep("merchant-picker");
			} else {
				navigate("/onboarding", { replace: true });
			}
		} catch (err) {
			if (err instanceof ApiError) {
				const messages: Record<number, string> = {
					401: "Email atau kata sandi salah",
					409: "Email sudah terdaftar",
				};
				setError(messages[err.status] ?? err.message);
			} else {
				setError("Gagal terhubung ke server");
			}
		} finally {
			setLoading(false);
		}
	};

	const handleSelectMerchant = async (merchant: SessionMerchant) => {
		setLoading(true);
		setError("");
		try {
			const merchantOutlets = await getOutlets(merchant.merchantId);
			if (merchantOutlets.length > 0) {
				setOutlets(merchantOutlets);
				setStep("outlet-picker");
			} else {
				navigate(`/onboarding?merchantId=${merchant.merchantId}`, {
					replace: true,
				});
			}
		} catch {
			setError("Gagal memuat outlet");
		} finally {
			setLoading(false);
		}
	};

	const handleSelectOutlet = async (outlet: Outlet) => {
		setLoading(true);
		setError("");
		debugLog("outlet selected", {
			merchantId: outlet.merchantId,
			outletId: outlet.id,
			outletName: outlet.name,
		});
		setOutletContext(outlet.id, outlet.merchantId);
		let currentCloudStaff: CurrentCloudStaff;
		try {
			debugLog("current cloud staff request", {
				merchantId: outlet.merchantId,
			});
			currentCloudStaff = await getCurrentCloudStaff(outlet.merchantId);
			debugLog("current cloud staff result", {
				claimed: currentCloudStaff.claimed,
				reason: currentCloudStaff.reason,
				staffId: currentCloudStaff.staff?.id,
				staffRole: currentCloudStaff.staff?.role,
			});
		} catch (err) {
			const message = describeError(err);
			console.error(
				`[CLOUD-LOGIN] current cloud staff failed ${JSON.stringify({
					error: message,
					merchantId: outlet.merchantId,
					outletId: outlet.id,
				})}`,
			);
			setError(`Gagal memeriksa staff cloud: ${message}`);
			setLoading(false);
			return;
		}

		try {
			debugLog("sync request", {
				merchantId: outlet.merchantId,
				outletId: outlet.id,
			});
			await syncNow();
			debugLog("sync result", {
				merchantId: outlet.merchantId,
				outletId: outlet.id,
			});
		} catch (err) {
			const message = describeError(err);
			console.error(
				`[CLOUD-LOGIN] sync failed ${JSON.stringify({
					error: message,
					merchantId: outlet.merchantId,
					outletId: outlet.id,
				})}`,
			);
			setError(`Gagal menyinkronkan data: ${message}`);
			return;
		} finally {
			setLoading(false);
		}

		if (currentCloudStaff.staff) {
			try {
				const authUser = await loginWithCloudStaff(currentCloudStaff.staff.id);
				navigate(routeForRole(authUser.role), { replace: true });
			} catch (err) {
				console.error(
					`[CLOUD-LOGIN] local cloud staff login failed ${JSON.stringify({
						error: describeError(err),
						staffId: currentCloudStaff.staff.id,
					})}`,
				);
				setError("Data pengguna belum tersinkron. Coba sinkronkan lagi.");
			}
			return;
		}

		if (
			currentCloudStaff.reason === "ambiguous-owner" ||
			currentCloudStaff.reason === "not-allowed"
		) {
			navigate("/login", { replace: true });
			return;
		}

		const activeStaff = await getActiveStaff();
		if (activeStaff.length === 0) {
			navigate(
				`/onboarding?merchantId=${outlet.merchantId}&outletId=${outlet.id}`,
				{
					replace: true,
				},
			);
			return;
		}

		navigate("/login", { replace: true });
	};

	const handleGoogle = () => {
		window.open(getGoogleOAuthUrl(), "_blank", "noopener");
	};

	return (
		<div class="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
			<div class="w-full max-w-sm text-center">
				<h1 class="font-bold text-3xl">Sakti POS</h1>
				<p class="mt-1 text-muted-foreground text-sm">
					{step() === "outlet-picker"
						? "Pilih outlet"
						: step() === "merchant-picker"
							? "Pilih bisnis"
							: step() === "register"
								? "Buat akun baru"
								: "Masuk ke akun cloud"}
				</p>
			</div>

			<Show
				when={
					error() &&
					(step() === "merchant-picker" || step() === "outlet-picker")
				}
			>
				<div class="w-full max-w-sm rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
					{error()}
				</div>
			</Show>

			<Show when={step() === "merchant-picker"}>
				<div class="flex w-full max-w-sm flex-col items-center gap-3">
					<div class="grid w-full gap-2">
						<For each={merchants()}>
							{(merchant) => (
								<Button
									class="justify-start"
									onClick={() => handleSelectMerchant(merchant)}
									disabled={loading()}
								>
									<span class="font-medium">{merchant.name}</span>
								</Button>
							)}
						</For>
					</div>
				</div>
			</Show>

			<Show when={step() === "outlet-picker"}>
				<div class="flex w-full max-w-sm flex-col items-center gap-3">
					<div class="grid w-full gap-2">
						<For each={outlets()}>
							{(outlet) => (
								<Button
									class="justify-start"
									variant="outline"
									onClick={() => handleSelectOutlet(outlet)}
								>
									<div class="text-left">
										<span class="block font-medium">{outlet.name}</span>
										<Show when={outlet.address}>
											<span class="block text-muted-foreground text-xs">
												{outlet.address}
											</span>
										</Show>
									</div>
								</Button>
							)}
						</For>
					</div>
					<Button
						class="w-full"
						onClick={() => setStep("merchant-picker")}
						variant="secondary"
					>
						← Kembali ke pilih bisnis
					</Button>
				</div>
			</Show>

			<Show when={step() === "login" || step() === "register"}>
				<form
					class="flex w-full max-w-sm flex-col gap-4"
					onSubmit={handleSubmit}
				>
					<Show when={error()}>
						<div class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{error()}
						</div>
					</Show>

					<Show when={step() === "register"}>
						<div class="flex flex-col gap-1.5">
							<label class="font-medium text-sm" for="cloud-name">
								Nama
							</label>
							<input
								autofocus
								class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
								id="cloud-name"
								onInput={(e) => setName(e.currentTarget.value)}
								placeholder="Nama lengkap"
								required
								type="text"
								value={name()}
							/>
						</div>
					</Show>

					<div class="flex flex-col gap-1.5">
						<label class="font-medium text-sm" for="cloud-email">
							Email
						</label>
						<input
							autofocus={step() === "login"}
							class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
							id="cloud-email"
							onInput={(e) => setEmail(e.currentTarget.value)}
							placeholder="email@contoh.com"
							required
							type="email"
							value={email()}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<label class="font-medium text-sm" for="cloud-password">
							Kata Sandi
						</label>
						<input
							class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
							id="cloud-password"
							minlength={step() === "register" ? 8 : undefined}
							onInput={(e) => setPassword(e.currentTarget.value)}
							placeholder={
								step() === "register" ? "Minimal 8 karakter" : "Kata sandi"
							}
							required
							type="password"
							value={password()}
						/>
					</div>

					<Button class="w-full" disabled={loading()} type="submit">
						{loading()
							? "Memproses..."
							: step() === "register"
								? "Daftar"
								: "Masuk"}
					</Button>

					<div class="text-center text-sm">
						<Show
							fallback={
								<button
									class="text-primary hover:underline"
									onClick={() => setStep("register")}
									type="button"
								>
									Belum punya akun? Daftar
								</button>
							}
							when={step() === "register"}
						>
							<button
								class="text-primary hover:underline"
								onClick={() => setStep("login")}
								type="button"
							>
								Sudah punya akun? Masuk
							</button>
						</Show>
					</div>

					<div class="relative">
						<div class="absolute inset-0 flex items-center">
							<span class="w-full border-t" />
						</div>
						<div class="relative flex justify-center text-xs uppercase">
							<span class="bg-background px-2 text-muted-foreground">atau</span>
						</div>
					</div>

					<Button class="w-full" onClick={handleGoogle} variant="outline">
						Masuk dengan Google
					</Button>

					<Button
						class="w-full"
						onClick={() => navigate("/device-pair", { replace: true })}
						variant="secondary"
					>
						Sambungkan Perangkat
					</Button>
				</form>
			</Show>
		</div>
	);
}
