import { createMemo, createSignal, Show } from "solid-js";
import { createForm, Field, Form, getInput } from "@formisch/solid";
import { useNavigate, useParams } from "@solidjs/router";
import { toast } from "solid-sonner";
import { FormTextField } from "~/components/form/form-text-field";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { changePin } from "~/lib/auth/provider";
import { ResetPinSchema, type ResetPinFormValues } from "~/lib/schema/reset-pin-form";

export default function ResetPin() {
	const params = useParams();
	const navigate = useNavigate();

	const form = createForm({
		schema: ResetPinSchema,
		initialInput: { pin: "", confirmPin: "" },
	});
	const [error, setError] = createSignal("");

	const canSubmit = createMemo(() => {
		const input = getInput(form);
		return (
			!!input?.pin &&
			input.pin.length >= 6 &&
			input.pin === input.confirmPin &&
			!form.isSubmitting
		);
	});

	const handleSave = async (values: ResetPinFormValues) => {
		try {
			await changePin(params.id ?? "", values.pin);
			toast.success("PIN berhasil direset");
			navigate("/users", { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
		}
	};

	return (
		<>
			<PageHeader backHref={`/users/${params.id}/edit`}>Ubah PIN</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show when={error()}>
					<div
						class="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{error()}
					</div>
				</Show>
				<Form
					class="flex flex-1 flex-col gap-4"
					of={form}
					onSubmit={handleSave}
				>
					<Field of={form} path={["pin"]}>
						{(field) => (
							<FormTextField
								{...field.props}
								errors={field.errors}
								input={field.input}
								label="PIN Baru (6 digit)"
								placeholder="Minimal 6 digit"
								required
								type="password"
							/>
						)}
					</Field>
					<Field of={form} path={["confirmPin"]}>
						{(field) => (
							<FormTextField
								{...field.props}
								errors={field.errors}
								input={field.input}
								label="Konfirmasi PIN Baru"
								placeholder="Ulangi PIN baru"
								required
								type="password"
							/>
						)}
					</Field>

					<div class="mt-auto pt-4">
						<Button
							class="w-full"
							disabled={!canSubmit()}
							size="lg"
							type="submit"
						>
							{form.isSubmitting ? "Menyimpan..." : "Simpan PIN"}
						</Button>
					</div>
				</Form>
			</div>
		</>
	);
}
