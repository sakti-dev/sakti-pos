import { render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockUsers = [
	{
		id: 1,
		name: "Admin",
		role: "owner",
		isActive: true,
		pin: "$2b$",
		createdAt: "",
		updatedAt: "",
	},
	{
		id: 2,
		name: "Kasir 1",
		role: "cashier",
		isActive: true,
		pin: "$2b$",
		createdAt: "",
		updatedAt: "",
	},
	{
		id: 3,
		name: "Kasir 2",
		role: "cashier",
		isActive: false,
		pin: "$2b$",
		createdAt: "",
		updatedAt: "",
	},
];

const mockNavigate = vi.fn();

vi.mock("@solidjs/router", () => ({
	A: (props: { children: JSX.Element; href: string }) => (
		<a data-testid="link" href={props.href}>
			{props.children}
		</a>
	),
	useNavigate: () => mockNavigate,
}));

vi.mock("~/db/users", () => ({
	getUsers: vi.fn(() => Promise.resolve(mockUsers)),
}));

vi.mock("~/components/layout", () => ({
	AppShell: (props: { children: JSX.Element; title: string }) => (
		<div>
			<h1>{props.title}</h1>
			{props.children}
		</div>
	),
}));

vi.mock("~/components/ui/button", () => ({
	Button: (props: { children: JSX.Element; size?: string }) => (
		<button data-testid="btn-add" type="button">
			{props.children}
		</button>
	),
}));

vi.mock("~/components/ui/skeleton", () => ({
	Skeleton: (props: { class?: string }) => (
		<div class={props.class} data-testid="skeleton" />
	),
}));

import UserList from "../user-list";

describe("UserList", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("renders user list with role badges", async () => {
		render(() => <UserList />);
		await screen.findByText("Pengguna");
		expect(screen.getByText("Admin")).toBeInTheDocument();
		expect(screen.getByText("Kasir 1")).toBeInTheDocument();
		expect(screen.getByText("Kasir 2")).toBeInTheDocument();
		expect(screen.getByText("Owner")).toBeInTheDocument();
		expect(screen.getAllByText("Kasir").length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText("Nonaktif")).toBeInTheDocument();
	});

	test("shows user count", async () => {
		render(() => <UserList />);
		await screen.findByText("Pengguna");
		expect(screen.getByText("3 pengguna")).toBeInTheDocument();
	});

	test("shows empty state when no users", async () => {
		const { getUsers } = await import("~/db/users");
		vi.mocked(getUsers).mockResolvedValueOnce([]);
		render(() => <UserList />);
		await screen.findByText("Pengguna");
		expect(screen.getByText("Belum ada pengguna")).toBeInTheDocument();
	});

	test("shows '+ Tambah' link", async () => {
		render(() => <UserList />);
		await screen.findByText("Pengguna");
		expect(screen.getByText("+ Tambah")).toBeInTheDocument();
		expect(screen.getByTestId("link")).toHaveAttribute("href", "/users/add");
	});
});
