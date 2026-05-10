import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockSetTheme = vi.fn();
const mockChangeCurrentUserPin = vi.fn();

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(() =>
		Promise.resolve({ db_path: "/data/sakti.db", size_formatted: "2.4 MB" }),
	),
}));

vi.mock("~/store/auth", () => ({
	currentUser: vi.fn(() => ({ id: 1, name: "Admin", role: "owner" })),
	currentUserRole: vi.fn(() => "owner"),
	logout: (...args: unknown[]) => mockLogout(...args),
	changeCurrentUserPin: (...args: unknown[]) =>
		mockChangeCurrentUserPin(...args),
}));

vi.mock("~/store/theme", () => ({
	theme: vi.fn(() => "system"),
	setTheme: (...args: unknown[]) => mockSetTheme(...args),
}));

vi.mock("~/lib/auth/cloud", () => ({
	getSession: vi.fn(() => Promise.resolve({ user: null })),
	logout: vi.fn(),
}));

vi.mock("~/lib/shop", () => ({
	currentShopId: vi.fn(() => null),
	setShopId: vi.fn(),
}));

vi.mock("~/components/layout", () => ({
	AppShell: (props: { children: JSX.Element; title: string }) => (
		<div>
			<h1>{props.title}</h1>
			{props.children}
		</div>
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

vi.mock("~/components/ui/button", () => ({
	Button: (props: {
		children: JSX.Element;
		class?: string;
		onClick?: () => void;
		variant?: string;
		disabled?: boolean;
	}) => (
		<button
			class={props.class}
			data-testid={props.variant === "outline" ? "outline-btn" : "primary-btn"}
			disabled={props.disabled}
			onClick={props.onClick}
			type="button"
		>
			{props.children}
		</button>
	),
}));

vi.mock("~/components/ui/drawer", () => ({
	Drawer: (props: {
		children: JSX.Element;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) => (
		<Show when={props.open}>
			<div data-testid="drawer">{props.children}</div>
		</Show>
	),
	DrawerContent: (props: { children: JSX.Element; class?: string }) => (
		<div data-testid="drawer-content">{props.children}</div>
	),
	DrawerOverlay: () => <div data-testid="drawer-overlay" />,
	DrawerPortal: (props: { children: JSX.Element }) => <>{props.children}</>,
	DrawerTitle: (props: { children: JSX.Element }) => (
		<h2 data-testid="drawer-title">{props.children}</h2>
	),
}));

vi.mock("solid-sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

import Settings, { formatSyncSuccessMessage } from "../settings";

const user = userEvent.setup();

describe("Settings", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("renders user profile with name and role", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		expect(screen.getByText("Admin")).toBeInTheDocument();
		expect(screen.getByText("owner")).toBeInTheDocument();
	});

	test("shows theme toggle buttons", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		expect(screen.getByText("Terang")).toBeInTheDocument();
		expect(screen.getByText("Sistem")).toBeInTheDocument();
		expect(screen.getByText("Gelap")).toBeInTheDocument();
	});

	test("calls setTheme when theme button is clicked", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		await user.click(screen.getByText("Gelap"));
		expect(mockSetTheme).toHaveBeenCalledWith("dark");
	});

	test("shows 'Keluar' logout button", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		expect(screen.getByText("Keluar")).toBeInTheDocument();
	});

	test("opens logout confirm drawer", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		await user.click(screen.getByText("Keluar"));
		expect(screen.getByTestId("confirm-drawer")).toBeInTheDocument();
	});

	test("opens change PIN drawer when 'Ubah PIN' is clicked", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		await user.click(screen.getByText("Ubah PIN"));
		expect(screen.getByTestId("drawer-title")).toHaveTextContent("Ubah PIN");
	});

	test("shows DB info size", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		expect(screen.getByText("2.4 MB")).toBeInTheDocument();
	});

	test("shows version info", async () => {
		render(() => <Settings />);
		await screen.findByText("Pengaturan");
		expect(screen.getByText("0.1.0")).toBeInTheDocument();
	});
});

describe("formatSyncSuccessMessage", () => {
	test("shows data already current for skipped sync", () => {
		expect(
			formatSyncSuccessMessage({
				mode: "skipped",
				pull: { rows_received: 0, server_time: "" },
				purged: 0,
				push: { server_time: "", server_wins_count: 0, tables_synced: [] },
			}),
		).toBe("Data sudah terbaru");
	});

	test("shows received rows for pull only sync", () => {
		expect(
			formatSyncSuccessMessage({
				mode: "pull_only",
				pull: { rows_received: 4, server_time: "2026-05-09T12:00:00.000Z" },
				purged: 0,
				push: { server_time: "", server_wins_count: 0, tables_synced: [] },
			}),
		).toBe("Sinkronisasi berhasil (4 diterima)");
	});

	test("shows sent table count for push only sync", () => {
		expect(
			formatSyncSuccessMessage({
				mode: "push_only",
				pull: { rows_received: 0, server_time: "" },
				purged: 0,
				push: {
					server_time: "2026-05-09T12:00:00.000Z",
					server_wins_count: 0,
					tables_synced: ["products", "categories"],
				},
			}),
		).toBe("Sinkronisasi berhasil (2 tabel dikirim)");
	});

	test("shows received sent and purged counts for full sync", () => {
		expect(
			formatSyncSuccessMessage({
				mode: "full",
				pull: { rows_received: 4, server_time: "2026-05-09T12:00:00.000Z" },
				purged: 1,
				push: {
					server_time: "2026-05-09T12:00:00.000Z",
					server_wins_count: 0,
					tables_synced: ["products", "categories"],
				},
			}),
		).toBe(
			"Sinkronisasi berhasil (4 diterima, 2 tabel dikirim, 1 dibersihkan)",
		);
	});
});
