import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateMerchant = vi.fn();
const mockCreateOutlet = vi.fn();
const mockSetOutletContext = vi.fn();
const mockCreateStaffMember = vi.fn();
const mockHashPin = vi.fn((_pin: string) => Promise.resolve("hashed-pin"));
const mockLogin = vi.fn((_staffId: string, _pin: string) =>
	Promise.resolve({ id: "staff-1", name: "Test Biz", role: "owner" }),
);

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));

vi.mock("~/lib/cloud-auth", () => ({
	ApiError: class extends Error {
		status: number;
		constructor(m: string, s: number) {
			super(m);
			this.status = s;
		}
	},
	createMerchant: (name: string) => mockCreateMerchant(name),
	createOutlet: (merchantId: string, name: string, address?: string) =>
		mockCreateOutlet(merchantId, name, address),
}));

vi.mock("~/store/outlet", () => ({
	setOutletContext: (
		outletId: string,
		merchantId: string,
		registerId?: string,
	) => mockSetOutletContext(outletId, merchantId, registerId),
	currentMerchantId: () => "merchant-1",
}));

vi.mock("~/db/staff", () => ({
	createStaffMember: (data: {
		merchantId: string;
		name: string;
		role: string;
		pin: string;
	}) => mockCreateStaffMember(data),
}));

vi.mock("~/lib/auth-provider", () => ({
	hashPin: (pin: string) => mockHashPin(pin),
}));

vi.mock("~/store/auth", () => ({
	login: (staffId: string, pin: string) => mockLogin(staffId, pin),
}));

import Onboarding from "../onboarding";

const user = userEvent.setup();

describe("Onboarding", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows merchant creation step first", () => {
		render(() => <Onboarding />);
		expect(screen.getByText("Buat bisnis Anda")).toBeInTheDocument();
	});

	test("advances to PIN setup after creating outlet", async () => {
		mockCreateMerchant.mockResolvedValue({
			id: "merchant-1",
			name: "Test Biz",
		});
		mockCreateOutlet.mockResolvedValue({
			id: "outlet-1",
			merchantId: "merchant-1",
			register: { id: "register-1" },
		});
		render(() => <Onboarding />);
		await user.type(
			screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
			"Test Biz",
		);
		await user.click(screen.getByText("Lanjutkan"));
		expect(await screen.findByText("Buat outlet pertama")).toBeInTheDocument();
		await user.type(
			screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
			"Cabang Utama",
		);
		await user.click(screen.getByText("Buat Outlet"));
		expect(await screen.findByText("Buat PIN")).toBeInTheDocument();
	});

	test("creates staff and navigates to /pos after PIN setup", async () => {
		mockCreateMerchant.mockResolvedValue({
			id: "merchant-1",
			name: "Test Biz",
		});
		mockCreateOutlet.mockResolvedValue({
			id: "outlet-1",
			merchantId: "merchant-1",
			register: { id: "register-1" },
		});
		mockCreateStaffMember.mockResolvedValue({
			id: "staff-1",
			name: "Test Biz",
			role: "owner",
		});
		mockLogin.mockResolvedValue({
			id: "staff-1",
			name: "Test Biz",
			role: "owner",
		});
		render(() => <Onboarding />);
		await user.type(
			screen.getByPlaceholderText("Contoh: PT Sakti Jaya"),
			"Test Biz",
		);
		await user.click(screen.getByText("Lanjutkan"));
		await screen.findByText("Buat outlet pertama");
		await user.type(
			screen.getByPlaceholderText("Contoh: Cabang Sudirman"),
			"Cabang Utama",
		);
		await user.click(screen.getByText("Buat Outlet"));
		expect(await screen.findByText("Buat PIN")).toBeInTheDocument();

		for (const digit of "123456") {
			await user.click(screen.getByText(digit));
		}
		await user.click(screen.getByText("OK"));

		await screen.findByText("Konfirmasi PIN");
		for (const digit of "123456") {
			await user.click(screen.getByText(digit));
		}
		await user.click(screen.getByText("OK"));

		await vi.waitFor(() => {
			expect(mockCreateStaffMember).toHaveBeenCalledWith(
				expect.objectContaining({
					merchantId: "merchant-1",
					role: "owner",
					pin: "hashed-pin",
				}),
			);
		});
		await vi.waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/pos", { replace: true });
		});
	});
});
