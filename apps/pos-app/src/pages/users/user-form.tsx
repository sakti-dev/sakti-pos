import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js";
import { createForm, Field, Form, getInput, reset } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { toast } from "solid-sonner";

import { ConfirmDrawer } from "~/components/confirm-drawer";
import { FormTextField } from "~/components/form/form-text-field";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
	createStaff,
	getStaffMember,
	updateStaffMember,
} from "~/db/staff";
import { createStaff as createStaffApi } from "~/lib/cloud-auth";
import { cn } from "~/lib/utils";
import {
	CreateUserSchema,
	EditUserSchema,
	type CreateUserValues,
	type EditUserValues,
} from "~/lib/schema/user-form";
import { currentUser } from "~/store/auth";
import { currentMerchantId } from "~/store/outlet";

const ROLE_OPTIONS = [
	{ value: "owner", label: "Owner" },
	{ value: "manager", label: "Manager" },
	{ value: "cashier", label: "Kasir" },
];

export default function UserForm() {
	const params = useParams();
	const navigate = useNavigate();
	const isEdit = () => !!params.id;
	const title = () => (isEdit() ? "Edit Pengguna" : "Tambah Pengguna");

	const [user] = createResource(
		() => (isEdit() ? params.id : undefined),
		(id) => (id === undefined ? undefined : getStaffMember(id)),
	);

	const [isActive, setIsActive] = createSignal(true);
	const [error, setError] = createSignal("");
	const [deactivateOpen, setDeactivateOpen] = createSignal(false);

	const createFormInstance = createForm({
		schema: CreateUserSchema,
		initialInput: { name: "", role: "", pin: "", confirmPin: "" },
	});

	const editFormInstance = createForm({
		schema: EditUserSchema,
		initialInput: { name: "", role: "" },
	});

	createEffect(() => {
		const data = user();
		if (!data) {
			return;
		}

		reset(editFormInstance, {
			initialInput: { name: data.name, role: data.role },
		});
		setIsActive(data.isActive);
		setError("");
	});

	const canSubmitCreate = createMemo(() => {
		const input = getInput(createFormInstance);
		if (!input) return false;
		if (createFormInstance.isSubmitting) return false;
		return (
			!!input.name?.trim() &&
			!!input.role?.trim() &&
			!!input.pin &&
			input.pin.length >= 6 &&
			input.pin === input.confirmPin
		);
	});

	const canSubmitEdit = createMemo(() => {
		const input = getInput(editFormInstance);
		if (!input) return false;
		if (editFormInstance.isSubmitting) return false;
		return !!input.name?.trim() && !!input.role?.trim();
	});

	const checkBusinessRules = async (): Promise<string | null> => {
		const me = currentUser();
		const targetId = params.id ?? "";
		const input = getInput(editFormInstance);
		const newRole = input?.role;

		if (isEdit() && me?.id === targetId) {
			if (!isActive()) {
				return "Tidak bisa menonaktifkan diri sendiri";
			}

			if (me.role === "owner" && newRole !== "owner") {
				return "Owner tidak bisa mengubah peran sendiri";
			}
		}

		return null;
	};

	const handleCreate = async (values: CreateUserValues) => {
		setError("");

		try {
			await createStaffApi({
				merchantId: currentMerchantId() ?? "",
				name: values.name.trim(),
				pin: values.pin,
				role: values.role as "manager" | "cashier" | "owner",
			});
			toast.success("Pengguna ditambahkan");
			navigate("/users", { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal menyimpan pengguna");
		}
	};

	const handleEdit = async (values: EditUserValues) => {
		setError("");

		try {
			const ruleError = await checkBusinessRules();
			if (ruleError) {
				setError(ruleError);
				return;
			}

			await updateStaffMember(params.id ?? "", {
				name: values.name.trim(),
				role: values.role as "manager" | "cashier" | "owner",
				isActive: isActive(),
			});
			toast.success("Pengguna diperbarui");
			navigate("/users", { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal menyimpan pengguna");
		}
	};

	const handleDeactivate = () => {
		setIsActive(false);
		setDeactivateOpen(false);
	};

	return (
		<>
			<PageHeader backHref="/users">{title()}</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show when={error()}>
					<div
						class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm"
						role="alert"
					>
						{error()}
					</div>
				</Show>

				<Show
					fallback={
						<div class="flex flex-1 items-center justify-center text-muted-foreground">
							Memuat...
						</div>
					}
					when={!isEdit() || user()}
				>
					<Show
						fallback={
							<Form
								class="flex flex-1 flex-col gap-4"
								of={createFormInstance}
								onSubmit={handleCreate}
							>
								<Field of={createFormInstance} path={["name"]}>
									{(field) => (
										<FormTextField
											{...field.props}
											errors={field.errors}
											input={field.input}
											label="Nama"
											placeholder="Nama pengguna"
											required
											type="text"
										/>
									)}
								</Field>

								<Field of={createFormInstance} path={["role"]}>
									{(field) => (
										<div>
											<label
												class="mb-1.5 block font-medium text-sm"
												for="user-role"
											>
												Peran
											</label>
											<Select
												label="Peran"
												name="role"
												onChange={(v) =>
													field.onInput(v == null ? "" : String(v))
												}
												options={ROLE_OPTIONS}
												placeholder="Pilih peran"
												value={field.input}
											/>
										</div>
									)}
								</Field>

								<Field of={createFormInstance} path={["pin"]}>
									{(field) => (
										<FormTextField
											{...field.props}
											errors={field.errors}
											input={field.input}
											label="PIN (6 digit)"
											placeholder="Minimal 6 digit"
											required
											type="password"
										/>
									)}
								</Field>

								<Field of={createFormInstance} path={["confirmPin"]}>
									{(field) => (
										<FormTextField
											{...field.props}
											errors={field.errors}
											input={field.input}
											label="Konfirmasi PIN"
											placeholder="Ulangi PIN"
											required
											type="password"
										/>
									)}
								</Field>

								<div class="mt-auto pt-4">
									<Button
										class="w-full"
										disabled={!canSubmitCreate()}
										size="lg"
										type="submit"
									>
										{createFormInstance.isSubmitting
											? "Menyimpan..."
											: "Simpan"}
									</Button>
								</div>
							</Form>
						}
						when={isEdit()}
					>
						<Form
							class="flex flex-1 flex-col gap-4"
							of={editFormInstance}
							onSubmit={handleEdit}
						>
							<Field of={editFormInstance} path={["name"]}>
								{(field) => (
									<FormTextField
										{...field.props}
										errors={field.errors}
										input={field.input}
										label="Nama"
										placeholder="Nama pengguna"
										required
										type="text"
									/>
								)}
							</Field>

							<Field of={editFormInstance} path={["role"]}>
								{(field) => (
									<div>
										<label
											class="mb-1.5 block font-medium text-sm"
											for="user-role"
										>
											Peran
										</label>
										<Select
											label="Peran"
											name="role"
											onChange={(v) =>
												field.onInput(v == null ? "" : String(v))
											}
											options={ROLE_OPTIONS}
											placeholder="Pilih peran"
											value={field.input}
										/>
									</div>
								)}
							</Field>

							<div class="flex items-center justify-between rounded-xl border p-3">
								<div>
									<p class="font-medium text-sm">Status Aktif</p>
									<p class="text-muted-foreground text-xs">
										Nonaktifkan untuk menyembunyikan dari layar login
									</p>
								</div>
								<button
									class={cn(
										"relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isActive() ? "bg-primary" : "bg-muted",
									)}
									onClick={() => {
										if (isActive()) {
											setDeactivateOpen(true);
										} else {
											setIsActive(true);
										}
									}}
									type="button"
								>
									<span
										class={cn(
											"pointer-events-none block size-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
											isActive() ? "translate-x-5" : "translate-x-0",
										)}
									/>
								</button>
							</div>

							<button
								class="text-primary text-sm hover:underline"
								onClick={() =>
									navigate(`/users/${params.id}/reset-pin`)
								}
								type="button"
							>
								Ubah PIN
							</button>

							<div class="mt-auto pt-4">
								<Button
									class="w-full"
									disabled={!canSubmitEdit()}
									size="lg"
									type="submit"
								>
									{editFormInstance.isSubmitting ? "Menyimpan..." : "Simpan"}
								</Button>
							</div>
						</Form>
					</Show>
				</Show>
			</div>

			<ConfirmDrawer
				confirmLabel="Nonaktifkan"
				message="Pengguna yang dinonaktifkan tidak bisa masuk ke aplikasi."
				onClose={() => setDeactivateOpen(false)}
				onConfirm={handleDeactivate}
				open={deactivateOpen()}
				title="Nonaktifkan Pengguna"
				variant="destructive"
			/>
		</>
	);
}
