import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockLogin = vi.fn();
const mockGetActiveStaff = vi.fn(() =>
	Promise.resolve([
		{ id: "staff-1", name: "Manager", role: "manager" },
		{ id: "staff-2", name: "Kasir", role: "cashier" },
	]),
);
const mockGetLastUserId = vi.fn<() => string | null>(() => null);
const mockNavigate = vi.fn();

vi.mock("~/lib/auth", () => ({
	getActiveStaff: () => mockGetActiveStaff(),
	getLastUserId: () => mockGetLastUserId(),
	login: () => mockLogin(),
}));

vi.mock("~/lib/responsive", () => ({
	useIsLandscape: () => () => false,
}));

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));

import Login from "../login";

const user = userEvent.setup();

describe("Login", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("renders staff list after loading", async () => {
		mockGetLastUserId.mockReturnValue(null);
		render(() => <Login />);
		expect(await screen.findByText("Manager")).toBeInTheDocument();
		expect(screen.getByText("Kasir")).toBeInTheDocument();
	});

	test("shows PinPad after selecting a staff member", async () => {
		mockGetLastUserId.mockReturnValue(null);
		render(() => <Login />);
		await screen.findByText("Manager");
		await user.click(screen.getByText("Manager"));
		expect(screen.getByText("Masukkan PIN")).toBeInTheDocument();
	});

	test("shows error when login fails", async () => {
		mockGetLastUserId.mockReturnValue("staff-1");
		mockLogin.mockRejectedValueOnce(new Error("Invalid PIN"));
		render(() => <Login />);
		await screen.findByText("Masukkan PIN");
		for (const digit of "123456") {
			await user.click(screen.getByText(digit));
		}
		await user.click(screen.getByText("OK"));
		expect(await screen.findByText("PIN salah")).toBeInTheDocument();
	});

	test("does not show error initially", async () => {
		mockGetLastUserId.mockReturnValue("staff-1");
		render(() => <Login />);
		await screen.findByText("Masukkan PIN");
		expect(screen.queryByText("PIN salah")).not.toBeInTheDocument();
	});
});
