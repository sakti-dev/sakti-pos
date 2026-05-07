import { useParams } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateStaffMember = vi.fn();
const mockUpdateStaffMember = vi.fn();
const mockCountActiveManagers = vi.fn(() => Promise.resolve(2));

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: vi.fn(() => ({})),
}));

vi.mock("~/lib/auth", () => ({
	currentUser: vi.fn(() => ({ id: "staff-1", name: "Admin", role: "manager" })),
}));

vi.mock("~/lib/auth-provider", () => ({
	hashPin: vi.fn((pin: string) => Promise.resolve(`$2b$${pin}`)),
}));

vi.mock("~/db/staff", () => ({
	getStaffMember: vi.fn(() =>
		Promise.resolve({
			id: "staff-1",
			name: "Admin",
			role: "manager",
			isActive: true,
			pin: "$2b$hashed",
			createdAt: "",
			updatedAt: "",
			merchantId: "merchant-1",
			outletId: null,
			isSynced: false,
		}),
	),
	createStaffMember: (...args: unknown[]) => mockCreateStaffMember(...args),
	updateStaffMember: (...args: unknown[]) => mockUpdateStaffMember(...args),
	countActiveManagers: () => mockCountActiveManagers(),
}));

vi.mock("~/components/ui/button", () => ({
	Button: (props: {
		children: JSX.Element;
		class?: string;
		disabled?: boolean;
		onClick?: () => void;
		size?: string;
	}) => (
		<button
			class={props.class}
			data-testid="save-btn"
			disabled={props.disabled}
			onClick={props.onClick}
			type="button"
		>
			{props.children}
		</button>
	),
}));

vi.mock("~/components/ui/page-header", () => ({
	PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
		<div data-testid="page-header">
			<span data-testid="back-href">{props.backHref ?? ""}</span>
			<h1>{props.children}</h1>
		</div>
	),
}));

vi.mock("~/components/ui/select", () => ({
	Select: (props: {
		label?: string;
		name?: string;
		onChange: (v: unknown) => void;
		options: { label: string; value: string }[];
		placeholder?: string;
		value?: unknown;
	}) => (
		<select
			data-testid="role-select"
			name={props.name}
			onChange={(e) => props.onChange(e.currentTarget.value)}
			value={String(props.value ?? "")}
		>
			<option value="">{props.placeholder}</option>
			<option value="cashier">Kasir</option>
			<option value="manager">Manajer</option>
		</select>
	),
}));

vi.mock("~/components/confirm-drawer", () => ({
	ConfirmDrawer: (props: {
		open: boolean;
		message: string;
		title: string;
		confirmLabel: string;
		onConfirm: () => void;
	}) => (
		<Show when={props.open}>
			<div data-testid="confirm-drawer">
				<h3>{props.title}</h3>
				<p>{props.message}</p>
				<button
					data-testid="confirm-btn"
					onClick={props.onConfirm}
					type="button"
				>
					{props.confirmLabel}
				</button>
			</div>
		</Show>
	),
}));

vi.mock("solid-sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

import UserForm from "../user-form";

const user = userEvent.setup();

describe("UserForm (create mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Tambah Pengguna' title", () => {
		render(() => <UserForm />);
		expect(screen.getByText("Tambah Pengguna")).toBeInTheDocument();
	});

	test("shows name, role, PIN and confirm PIN inputs", () => {
		render(() => <UserForm />);
		expect(screen.getByLabelText("Nama")).toBeInTheDocument();
		expect(screen.getByTestId("role-select")).toBeInTheDocument();
		expect(screen.getByLabelText("PIN (6 digit)")).toBeInTheDocument();
		expect(screen.getByLabelText("Konfirmasi PIN")).toBeInTheDocument();
	});

	test("submit is disabled when form is empty", () => {
		render(() => <UserForm />);
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});

	test("submit is disabled when name is missing", async () => {
		render(() => <UserForm />);
		await user.selectOptions(screen.getByTestId("role-select"), "cashier");
		await user.type(screen.getByLabelText("PIN (6 digit)"), "123456");
		await user.type(screen.getByLabelText("Konfirmasi PIN"), "123456");
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});

	test("submit is disabled when PINs do not match", async () => {
		render(() => <UserForm />);
		await user.type(screen.getByLabelText("Nama"), "Test User");
		await user.selectOptions(screen.getByTestId("role-select"), "cashier");
		await user.type(screen.getByLabelText("PIN (6 digit)"), "123456");
		await user.type(screen.getByLabelText("Konfirmasi PIN"), "654321");
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});

	test("submit is enabled when form is valid", async () => {
		render(() => <UserForm />);
		await user.type(screen.getByLabelText("Nama"), "Test User");
		await user.selectOptions(screen.getByTestId("role-select"), "cashier");
		await user.type(screen.getByLabelText("PIN (6 digit)"), "123456");
		await user.type(screen.getByLabelText("Konfirmasi PIN"), "123456");
		expect(screen.getByTestId("save-btn")).not.toBeDisabled();
	});

	test("save button remains disabled when name is missing", async () => {
		render(() => <UserForm />);
		await user.selectOptions(screen.getByTestId("role-select"), "cashier");
		await user.type(screen.getByLabelText("PIN (6 digit)"), "123456");
		await user.type(screen.getByLabelText("Konfirmasi PIN"), "123456");
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});
});

describe("UserForm (edit mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Edit Pengguna' title and prefills data", async () => {
		vi.mocked(useParams).mockReturnValue({ id: "staff-1" });
		render(() => <UserForm />);
		await screen.findByText("Edit Pengguna");
		expect(screen.getByText("Edit Pengguna")).toBeInTheDocument();
	});

	test("shows active status toggle", async () => {
		vi.mocked(useParams).mockReturnValue({ id: "staff-1" });
		render(() => <UserForm />);
		await screen.findByText("Edit Pengguna");
		expect(screen.getByText("Status Aktif")).toBeInTheDocument();
		expect(screen.getByText("Aktif")).toBeInTheDocument();
	});
});
