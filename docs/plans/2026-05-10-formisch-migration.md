# Formisch + Valibot Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the 5 highest-value forms from manual signal-based validation to Formisch + Valibot, establishing reusable patterns for the rest of the app.

**Architecture:** Install `@formisch/solid` and `valibot` as dependencies. Create a reusable `FormTextField` input component following Formisch's headless pattern. Migrate forms one at a time, starting with the simplest (Category) to establish the pattern, then progressing to the most complex (User Form). Each form gets a Valibot schema, uses `createForm`/`Form`/`Field`, and leverages `handleSubmit` for forms that can't use a `<form>` wrapper (those inside Drawers).

**Tech Stack:** `@formisch/solid`, `valibot`, SolidJS, existing `Button`, `Select`, `Drawer` components

**Forms to migrate (in order):**
1. Category Form — 1 field, simplest, establishes the pattern
2. Product Form — 4 fields, async data, number parsing
3. Cloud Login/Register — dual-mode, 2-3 fields
4. Reset PIN — 2 fields, PIN match validation
5. User Form (Create/Edit) — 4 fields, business rules, dual mode, most complex

**Forms NOT migrating (low value):**
- PinPad forms (custom numpad UI doesn't map to formisch)
- Device Pairing (1 hidden field, too custom)
- Onboarding (3 separate simple steps, PinPad-based)
- Payment Dialog (custom numpad for cash)
- Change Own PIN (in Drawer, 2 fields, very simple)
- Merchant/Outlet Pickers (button lists, not forms)

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Install formisch and valibot**

Run: `bun add @formisch/solid valibot`
Expected: Both packages added to dependencies in package.json

**Step 2: Verify installation**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/package.json bun.lock
git commit -m "chore: add @formisch/solid and valibot dependencies"
```

---

### Task 2: Create reusable FormTextField component

This component encapsulates the label + input + error display pattern used across all forms, following Formisch's input component guide.

**Files:**
- Create: `apps/pos-app/src/components/ui/form-text-field.tsx`

**Step 1: Create FormTextField component**

```tsx
import type { FieldElementProps } from "@formisch/solid";
import { splitProps } from "solid-js";
import { cn } from "~/lib/utils";

interface FormTextFieldProps extends FieldElementProps {
	class?: string;
	errors: [string, ...string[]] | null;
	input: string | undefined;
	label: string;
	placeholder?: string;
	required?: boolean;
	type?: "text" | "email" | "password" | "url" | "number";
}

export function FormTextField(props: FormTextFieldProps) {
	const [, inputProps] = splitProps(props, [
		"input",
		"label",
		"errors",
		"class",
		"required",
		"type",
	]);

	return (
		<div class="flex flex-col gap-1.5">
			<label class="font-medium text-sm" for={props.name}>
				{props.label}
				{props.required && <span class="text-error ml-0.5">*</span>}
			</label>
			<input
				{...inputProps}
				id={props.name}
				aria-invalid={!!props.errors}
				aria-errormessage={`${props.name}-error`}
				class={cn(
					"h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
					props.class,
					props.errors && "border-error focus:ring-error",
				)}
				placeholder={props.placeholder}
				value={props.input ?? ""}
			/>
			{props.errors && (
				<p id={`${props.name}-error`} class="text-error text-sm">
					{props.errors[0]}
				</p>
			)}
		</div>
	);
}
```

**Step 2: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/ui/form-text-field.tsx
git commit -m "feat: add reusable FormTextField component for formisch"
```

---

### Task 3: Migrate Category Form

Simplest form — 1 text field. Establishes the create/edit pattern.

**Files:**
- Modify: `apps/pos-app/src/pages/menu/category-form.tsx`

**Step 1: Rewrite category-form.tsx**

```tsx
import { useNavigate, useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { createForm, Field, Form } from "@formisch/solid";
import * as v from "valibot";

import { Button } from "~/components/ui/button";
import { FormTextField } from "~/components/ui/form-text-field";
import { PageHeader } from "~/components/ui/page-header";
import { createCategory, getCategory, updateCategory } from "~/db/menu";
import { currentMerchantId } from "~/store/outlet";

const CategorySchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
});

export default function CategoryForm() {
	const params = useParams();
	const navigate = useNavigate();
	const isEdit = () => !!params.id;
	const title = () => (isEdit() ? "Edit Kategori" : "Tambah Kategori");

	const [category] = createResource(
		() => (isEdit() ? params.id : undefined),
		(id) => (id === undefined ? undefined : getCategory(id)),
	);

	const form = createForm({
		schema: CategorySchema,
		initialInput: { name: "" },
	});

	const handleSave = async (values: v.InferOutput<typeof CategorySchema>) => {
		try {
			if (isEdit()) {
				await updateCategory(params.id ?? "", { name: values.name });
			} else {
				await createCategory({
					name: values.name,
					merchantId: currentMerchantId() ?? "",
				});
			}
			navigate("/menu/categories", { replace: true });
		} catch (e) {
			throw e instanceof Error ? e : new Error("Gagal menyimpan kategori");
		}
	};

	return (
		<>
			<PageHeader backHref="/menu/categories">{title()}</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show
					fallback={
						<div class="flex flex-1 items-center justify-center text-muted-foreground">
							Memuat...
						</div>
					}
					when={!isEdit() || category()}
				>
					<Form
						class="flex flex-1 flex-col gap-4"
						of={form}
						onError={() => {}}
						onSubmit={handleSave}
					>
						<Field of={form} path={["name"]}>
							{(field) => (
								<FormTextField
									{...field.props}
									errors={field.errors}
									input={field.input}
									label="Nama Kategori"
									placeholder="Contoh: Minuman"
									required
									type="text"
								/>
							)}
						</Field>

						<div class="mt-auto pt-4">
							<Button
								class="w-full"
								disabled={form.isSubmitting}
								size="lg"
								type="submit"
							>
								{form.isSubmitting ? "Menyimpan..." : "Simpan"}
							</Button>
						</div>
					</Form>
				</Show>
			</div>
		</>
	);
}
```

**Step 2: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/menu/category-form.tsx
git commit -m "feat: migrate category form to formisch + valibot"
```

---

### Task 4: Migrate Product Form

4 fields including async category select and number parsing.

**Files:**
- Modify: `apps/pos-app/src/pages/menu/product-form.tsx`

**Step 1: Rewrite product-form.tsx**

```tsx
import { useNavigate, useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { createForm, Field, Form } from "@formisch/solid";
import * as v from "valibot";

import { Button } from "~/components/ui/button";
import { FormTextField } from "~/components/ui/form-text-field";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
	createProduct,
	getCategories,
	getProduct,
	updateProduct,
} from "~/db/menu";
import { currentMerchantId } from "~/store/outlet";

const ProductSchema = v.object({
	name: v.pipe(
		v.string("Nama produk wajib diisi"),
		v.nonEmpty("Nama produk wajib diisi"),
	),
	categoryId: v.pipe(
		v.string("Kategori wajib dipilih"),
		v.nonEmpty("Kategori wajib dipilih"),
	),
	price: v.pipe(
		v.string("Harga wajib diisi"),
		v.nonEmpty("Harga wajib diisi"),
		v.transform((input) => Number.parseInt(input, 10)),
		v.number("Harga harus berupa angka"),
		v.minValue(0, "Harga tidak boleh negatif"),
	),
	imageUrl: v.optional(v.pipe(v.string(), v.url("URL gambar tidak valid"))),
});

export default function ProductForm() {
	const params = useParams();
	const navigate = useNavigate();
	const isEdit = () => !!params.id;
	const title = () => (isEdit() ? "Edit Produk" : "Tambah Produk");

	const [categories] = createResource(getCategories);
	const [product] = createResource(
		() => (isEdit() ? params.id : undefined),
		(id) => (id === undefined ? undefined : getProduct(id)),
	);

	const form = createForm({
		schema: ProductSchema,
		initialInput: {
			name: "",
			categoryId: "",
			price: "",
			imageUrl: undefined,
		},
	});

	const handleSave = async (values: v.InferOutput<typeof ProductSchema>) => {
		try {
			const data = {
				name: values.name,
				categoryId: values.categoryId,
				price: values.price,
				imageUrl: values.imageUrl?.trim() || null,
			};

			if (isEdit()) {
				await updateProduct(params.id ?? "", data);
			} else {
				await createProduct({ ...data, merchantId: currentMerchantId() ?? "" });
			}
			navigate("/menu/products", { replace: true });
		} catch (e) {
			throw e instanceof Error ? e : new Error("Gagal menyimpan produk");
		}
	};

	const categoryOptions = () =>
		categories()?.map((cat) => ({
			value: cat.id,
			label: cat.name,
		})) ?? [];

	return (
		<>
			<PageHeader backHref="/menu/products">{title()}</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show
					fallback={
						<div class="flex flex-1 items-center justify-center text-muted-foreground">
							Memuat...
						</div>
					}
					when={!isEdit() || (product() && categories())}
				>
					<Form
						class="flex flex-1 flex-col gap-4"
						of={form}
						onError={() => {}}
						onSubmit={handleSave}
					>
						<Field of={form} path={["name"]}>
							{(field) => (
								<FormTextField
									{...field.props}
									errors={field.errors}
									input={field.input}
									label="Nama Produk"
									placeholder="Contoh: Kopi Susu"
									required
									type="text"
								/>
							)}
						</Field>

						<Field of={form} path={["categoryId"]}>
							{(field) => (
								<div class="flex flex-col gap-1.5">
									<label class="font-medium text-sm" for="categoryId">
										Kategori
										<span class="text-error ml-0.5">*</span>
									</label>
									<Select
										label="Kategori"
										name="categoryId"
										onChange={(v) =>
											field.onInput(v == null ? "" : String(v))
										}
										options={categoryOptions()}
										placeholder="Pilih kategori"
										value={field.input || undefined}
									/>
									{field.errors && (
										<p id="categoryId-error" class="text-error text-sm">
											{field.errors[0]}
										</p>
									)}
								</div>
							)}
						</Field>

						<Field of={form} path={["price"]}>
							{(field) => (
								<FormTextField
									{...field.props}
									errors={field.errors}
									input={field.input}
									label="Harga (Rp)"
									placeholder="0"
									required
									type="number"
								/>
							)}
						</Field>

						<Field of={form} path={["imageUrl"]}>
							{(field) => (
								<FormTextField
									{...field.props}
									errors={field.errors}
									input={field.input}
									label="URL Gambar"
									placeholder="https://..."
									type="url"
								/>
							)}
						</Field>

						<div class="mt-auto pt-4">
							<Button
								class="w-full"
								disabled={form.isSubmitting}
								size="lg"
								type="submit"
							>
								{form.isSubmitting ? "Menyimpan..." : "Simpan"}
							</Button>
						</div>
					</Form>
				</Show>
			</div>
		</>
	);
}
```

**Step 2: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/menu/product-form.tsx
git commit -m "feat: migrate product form to formisch + valibot"
```

---

### Task 5: Migrate Reset PIN Form

2 fields with PIN match validation. Uses `handleSubmit` since it's inside a page (no `<form>` wrapper issues, but good to establish the pattern).

**Files:**
- Modify: `apps/pos-app/src/pages/users/reset-pin.tsx`

**Step 1: Rewrite reset-pin.tsx**

```tsx
import { useNavigate, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { toast } from "solid-sonner";
import { createForm, Field, Form } from "@formisch/solid";
import * as v from "valibot";

import { Button } from "~/components/ui/button";
import { FormTextField } from "~/components/ui/form-text-field";
import { PageHeader } from "~/components/ui/page-header";
import { changePin } from "~/lib/auth-provider";

const ResetPinSchema = v.object({
	pin: v.pipe(
		v.string("PIN wajib diisi"),
		v.nonEmpty("PIN wajib diisi"),
		v.minLength(6, "PIN minimal 6 digit"),
	),
	confirmPin: v.string("Konfirmasi PIN wajib diisi"),
});

export default function ResetPin() {
	const params = useParams();
	const navigate = useNavigate();

	const form = createForm({
		schema: v.pipe(
			ResetPinSchema,
			v.check(
				(input) => input.pin === input.confirmPin,
				"PIN tidak cocok",
			),
		),
		initialInput: { pin: "", confirmPin: "" },
	});

	const handleSave = async (
		values: v.InferOutput<typeof ResetPinSchema> & { confirmPin: string },
	) => {
		try {
			await changePin(params.id ?? "", values.pin);
			toast.success("PIN berhasil direset");
			navigate("/users", { replace: true });
		} catch (e) {
			throw e instanceof Error ? e : new Error("Gagal mengubah PIN");
		}
	};

	return (
		<>
			<PageHeader backHref={`/users/${params.id}/edit`}>Ubah PIN</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Form
					class="flex flex-1 flex-col gap-4"
					of={form}
					onError={() => {}}
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
							disabled={form.isSubmitting}
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
```

**Step 2: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/users/reset-pin.tsx
git commit -m "feat: migrate reset PIN form to formisch + valibot"
```

---

### Task 6: Migrate Cloud Login/Register Form

Dual-mode form with different fields per mode (login: email + password; register: name + email + password).

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`

**Step 1: Read the full cloud-login.tsx file**

Read the full file to understand all imports, signals, and the `handleSubmit` function (lines 1-53).

**Step 2: Add imports and schemas**

Add formisch + valibot imports and define two schemas:

```ts
import { createForm, Field, Form } from "@formisch/solid";
import * as v from "valibot";

const LoginSchema = v.object({
	email: v.pipe(
		v.string("Email wajib diisi"),
		v.nonEmpty("Email wajib diisi"),
		v.email("Format email tidak valid"),
	),
	password: v.pipe(
		v.string("Kata sandi wajib diisi"),
		v.nonEmpty("Kata sandi wajib diisi"),
	),
});

const RegisterSchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
	email: v.pipe(
		v.string("Email wajib diisi"),
		v.nonEmpty("Email wajib diisi"),
		v.email("Format email tidak valid"),
	),
	password: v.pipe(
		v.string("Kata sandi wajib diisi"),
		v.nonEmpty("Kata sandi wajib diisi"),
		v.minLength(8, "Kata sandi minimal 8 karakter"),
	),
});
```

**Step 3: Replace manual signals with form stores**

Replace `name`, `email`, `password` signals and the manual `handleSubmit` function with two `createForm` instances:

```ts
const loginForm = createForm({
	schema: LoginSchema,
	initialInput: { email: "", password: "" },
});

const registerForm = createForm({
	schema: RegisterSchema,
	initialInput: { name: "", email: "", password: "" },
});
```

**Step 4: Update the handleSubmit function**

```ts
const handleSubmit = async (values: v.InferOutput<typeof LoginSchema> | v.InferOutput<typeof RegisterSchema>) => {
	setLoading(true);
	setError("");

	try {
		if (step() === "login") {
			const loginValues = values as v.InferOutput<typeof LoginSchema>;
			await cloudLogin(loginValues.email, loginValues.password);
		} else {
			const registerValues = values as v.InferOutput<typeof RegisterSchema>;
			await cloudRegister(
				registerValues.email,
				registerValues.password,
				registerValues.name,
			);
		}
		// ... existing success logic
	} catch (e) {
		// ... existing error logic
	} finally {
		setLoading(false);
	}
};
```

**Step 5: Update the form JSX**

Replace the existing `<form>` JSX (lines 286-399) with two `<Form>` components (one for login, one for register), each wrapped in a `<Show when={step() === "login" | "register"}>`:

```tsx
<Show when={step() === "login"}>
	<Form
		class="flex w-full max-w-sm flex-col gap-4"
		of={loginForm}
		onSubmit={handleSubmit}
	>
		{/* error display */}
		<Field of={loginForm} path={["email"]}>
			{(field) => (
				<FormTextField
					{...field.props}
					errors={field.errors}
					input={field.input}
					label="Email"
					placeholder="email@contoh.com"
					required
					type="email"
				/>
			)}
		</Field>
		<Field of={loginForm} path={["password"]}>
			{(field) => (
				<FormTextField
					{...field.props}
					errors={field.errors}
					input={field.input}
					label="Kata Sandi"
					placeholder="Kata sandi"
					required
					type="password"
				/>
			)}
		</Field>
		<Button class="w-full" disabled={loading()} type="submit">
			{loading() ? "Memproses..." : "Masuk"}
		</Button>
		{/* toggle to register, Google button, device pair button */}
	</Form>
</Show>

<Show when={step() === "register"}>
	<Form
		class="flex w-full max-w-sm flex-col gap-4"
		of={registerForm}
		onSubmit={handleSubmit}
	>
		{/* error display */}
		<Field of={registerForm} path={["name"]}>
			{(field) => (
				<FormTextField
					{...field.props}
					errors={field.errors}
					input={field.input}
					label="Nama"
					placeholder="Nama lengkap"
					required
					type="text"
				/>
			)}
		</Field>
		<Field of={registerForm} path={["email"]}>
			{(field) => (
				<FormTextField
					{...field.props}
					errors={field.errors}
					input={field.input}
					label="Email"
					placeholder="email@contoh.com"
					required
					type="email"
				/>
			)}
		</Field>
		<Field of={registerForm} path={["password"]}>
			{(field) => (
				<FormTextField
					{...field.props}
					errors={field.errors}
					input={field.input}
					label="Kata Sandi"
					placeholder="Minimal 8 karakter"
					required
					type="password"
				/>
			)}
		</Field>
		<Button class="w-full" disabled={loading()} type="submit">
			{loading() ? "Memproses..." : "Daftar"}
		</Button>
		{/* toggle to login, Google button, device pair button */}
	</Form>
</Show>
```

Note: The Google and Device Pair buttons and the login/register toggle links must be moved into each `<Form>` as `type="button"` buttons (they already are). To avoid code duplication, extract them into a shared helper or keep them outside both forms with proper `type="button"`.

**Step 6: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 7: Commit**

```bash
git add apps/pos-app/src/pages/cloud-login.tsx
git commit -m "feat: migrate cloud login/register form to formisch + valibot"
```

---

### Task 7: Migrate User Form (Create/Edit)

Most complex form — dual mode, 4 fields, business rules, PIN confirmation, active status toggle.

**Key decisions:**
- Use two separate schemas: `CreateUserSchema` (with PIN fields) and `EditUserSchema` (without PIN fields)
- Business rules (can't deactivate self, sole manager check) stay as async checks in the submit handler since they require DB queries
- The active status toggle is NOT a form field — it remains a manual signal since it has its own confirmation drawer flow
- The "Ubah PIN" link in edit mode stays as a navigation link

**Files:**
- Modify: `apps/pos-app/src/pages/users/user-form.tsx`

**Step 1: Rewrite user-form.tsx**

```tsx
import { useNavigate, useParams } from "@solidjs/router";
import { createResource, Show } from "solid-js";
import { toast } from "solid-sonner";
import { createForm, Field, Form } from "@formisch/solid";
import * as v from "valibot";

import { ConfirmDrawer } from "~/components/confirm-drawer";
import { Button } from "~/components/ui/button";
import { FormTextField } from "~/components/ui/form-text-field";
import { PageHeader } from "~/components/ui/page-header";
import { Select } from "~/components/ui/select";
import {
	countActiveManagers,
	getStaffMember,
	updateStaffMember,
} from "~/db/staff";
import { createStaff as createStaffApi } from "~/lib/cloud-auth";
import { cn } from "~/lib/utils";
import { currentUser } from "~/store/auth";
import { currentMerchantId } from "~/store/outlet";

const ROLE_OPTIONS = [
	{ value: "cashier", label: "Kasir" },
	{ value: "manager", label: "Manajer" },
	{ value: "owner", label: "Pemilik" },
];

const CreateUserSchema = v.pipe(
	v.object({
		name: v.pipe(
			v.string("Nama wajib diisi"),
			v.nonEmpty("Nama wajib diisi"),
		),
		role: v.pipe(
			v.string("Peran wajib dipilih"),
			v.nonEmpty("Peran wajib dipilih"),
		),
		pin: v.pipe(
			v.string("PIN wajib diisi"),
			v.nonEmpty("PIN wajib diisi"),
			v.minLength(6, "PIN minimal 6 digit"),
		),
		confirmPin: v.string("Konfirmasi PIN wajib diisi"),
	}),
	v.check(
		(input) => input.pin === input.confirmPin,
		"PIN tidak cocok",
	),
);

const EditUserSchema = v.object({
	name: v.pipe(
		v.string("Nama wajib diisi"),
		v.nonEmpty("Nama wajib diisi"),
	),
	role: v.pipe(
		v.string("Peran wajib dipilih"),
		v.nonEmpty("Peran wajib dipilih"),
	),
});

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
	const [deactivateOpen, setDeactivateOpen] = createSignal(false);
	const [businessError, setBusinessError] = createSignal("");

	const createFormInstance = createForm({
		schema: CreateUserSchema,
		initialInput: { name: "", role: "", pin: "", confirmPin: "" },
	});

	const editFormInstance = createForm({
		schema: EditUserSchema,
		initialInput: { name: "", role: "" },
	});

	const activeForm = () => (isEdit() ? editFormInstance : createFormInstance);

	const checkBusinessRules = async (): Promise<string | null> => {
		const me = currentUser();
		const targetId = params.id ?? "";
		const newRole = getInput(editFormInstance, { path: ["role"] });

		if (isEdit() && me?.id === targetId) {
			if (!isActive()) {
				return "Tidak dapat menonaktifkan akun sendiri";
			}
			if (newRole !== "manager" && newRole !== "owner") {
				const managerCount = await countActiveManagers();
				if (managerCount <= 1) {
					return "Tidak dapat mengubah peran — Anda satu-satunya manajer aktif";
				}
			}
		}

		if (isEdit() && !isActive()) {
			const managerCount = await countActiveManagers();
			if (managerCount <= 1 && user()?.role === "manager") {
				return "Tidak dapat menonaktifkan — setidaknya harus ada satu manajer aktif";
			}
		}

		return null;
	};

	const handleCreate = async (values: v.InferOutput<typeof CreateUserSchema>) => {
		try {
			await createStaffApi({
				merchantId: currentMerchantId() ?? "",
				name: values.name,
				pin: values.pin,
				role: values.role as "manager" | "cashier" | "owner",
			});
			toast.success("Pengguna ditambahkan");
			navigate("/users", { replace: true });
		} catch (e) {
			throw e instanceof Error ? e : new Error("Gagal menyimpan pengguna");
		}
	};

	const handleEdit = async (values: v.InferOutput<typeof EditUserSchema>) => {
		const ruleError = await checkBusinessRules();
		if (ruleError) {
			setBusinessError(ruleError);
			return;
		}

		try {
			await updateStaffMember(params.id ?? "", {
				name: values.name,
				role: values.role as "manager" | "cashier" | "owner",
				isActive: isActive(),
			});
			toast.success("Pengguna diperbarui");
			navigate("/users", { replace: true });
		} catch (e) {
			throw e instanceof Error ? e : new Error("Gagal menyimpan pengguna");
		}
	};

	const handleToggleActive = async () => {
		setDeactivateOpen(false);
		const ruleError = await checkBusinessRules();
		if (ruleError) {
			setBusinessError(ruleError);
			return;
		}
		setIsActive(!isActive());
	};

	return (
		<>
			<PageHeader backHref="/users">{title()}</PageHeader>
			<div class="flex flex-1 flex-col p-4">
				<Show when={businessError()}>
					<div class="mb-3 rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
						{businessError()}
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
										<div class="flex flex-col gap-1.5">
											<label class="font-medium text-sm" for="role">
												Peran
												<span class="text-error ml-0.5">*</span>
											</label>
											<Select
												label="Peran"
												name="role"
												onChange={(v) =>
													field.onInput(v == null ? "" : String(v))
												}
												options={ROLE_OPTIONS}
												placeholder="Pilih peran"
												value={field.input || undefined}
											/>
											{field.errors && (
												<p id="role-error" class="text-error text-sm">
													{field.errors[0]}
												</p>
											)}
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
										disabled={createFormInstance.isSubmitting}
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
									<div class="flex flex-col gap-1.5">
										<label class="font-medium text-sm" for="role">
											Peran
											<span class="text-error ml-0.5">*</span>
										</label>
										<Select
											label="Peran"
											name="role"
											onChange={(v) =>
												field.onInput(v == null ? "" : String(v))
											}
											options={ROLE_OPTIONS}
											placeholder="Pilih peran"
											value={field.input || undefined}
										/>
										{field.errors && (
											<p id="role-error" class="text-error text-sm">
												{field.errors[0]}
											</p>
										)}
									</div>
								)}
							</Field>

							<div class="flex items-center justify-between rounded-xl border p-3">
								<div>
									<p class="font-medium text-sm">Status Aktif</p>
									<p class="text-muted-foreground text-xs">
										{isActive()
											? "Pengguna dapat login"
											: "Pengguna tidak dapat login"}
									</p>
								</div>
								<button
									class={cn(
										"shrink-0 rounded-full px-2.5 py-1 font-medium text-xs",
										isActive()
											? "bg-success text-success-foreground"
											: "bg-muted text-muted-foreground",
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
									{isActive() ? "Aktif" : "Nonaktif"}
								</button>
							</div>

							<button
								class="text-primary text-sm underline"
								onClick={() =>
									navigate(`/users/${params.id}/reset-pin`, {
										replace: true,
									})
								}
								type="button"
							>
								Ubah PIN
							</button>

							<div class="mt-auto pt-4">
								<Button
									class="w-full"
									disabled={editFormInstance.isSubmitting}
									size="lg"
									type="submit"
								>
									{editFormInstance.isSubmitting
										? "Menyimpan..."
										: "Simpan"}
								</Button>
							</div>
						</Form>
					</Show>
				</Show>
			</div>

			<ConfirmDrawer
				message="Nonaktifkan pengguna ini? Mereka tidak akan bisa login."
				onClose={() => setDeactivateOpen(false)}
				onConfirm={handleToggleActive}
				open={deactivateOpen()}
				title="Nonaktifkan Pengguna"
				variant="destructive"
			/>
		</>
	);
}
```

**Step 2: Verify with typecheck**

Run: `bun run typecheck`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/pages/users/user-form.tsx
git commit -m "feat: migrate user form to formisch + valibot"
```

---

### Task 8: Final verification and lint

**Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors across all modified files

**Step 2: Run lint**

Run: `bun x ultracite check`
Expected: No issues (or fix with `bun x ultracite fix`)

**Step 3: Run tests**

Run: `bun run test`
Expected: All tests pass

**Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: fix lint issues from formisch migration"
```
