import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCloudRegister = vi.fn();
const mockGetMerchants = vi.fn();

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
	login: vi.fn(),
	register: (...a: unknown[]) => mockCloudRegister(...a),
	getGoogleOAuthUrl: () => "http://localhost:3001/api/auth/google",
	getMerchants: () => mockGetMerchants(),
	getOutlets: vi.fn(),
	getCurrentCloudStaff: vi.fn(),
	Merchant: undefined,
	Outlet: undefined,
}));

vi.mock("~/store/outlet", () => ({
	setOutletContext: vi.fn(),
	currentOutletId: () => null,
}));

vi.mock("~/store/sync", () => ({
	syncNow: vi.fn(),
}));

vi.mock("~/store/auth", () => ({
	getActiveStaff: vi.fn(),
	loginWithCloudStaff: vi.fn(),
}));

import CloudRegister from "../cloud-register";

const user = userEvent.setup();

describe("CloudRegister", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("submits the register payload and navigates onboarding", async () => {
		mockGetMerchants.mockResolvedValueOnce([]);
		render(() => <CloudRegister />);
		await user.type(screen.getByPlaceholderText("Nama lengkap"), "Nama Baru");
		await user.type(
			screen.getByPlaceholderText("email@contoh.com"),
			"new@test.com",
		);
		await user.type(
			screen.getByPlaceholderText("Minimal 8 karakter"),
			"password1234",
		);
		await user.click(screen.getByText("Daftar"));
		await vi.waitFor(() => {
			expect(mockCloudRegister).toHaveBeenCalledWith(
				"new@test.com",
				"password1234",
				"Nama Baru",
			);
		});
		await vi.waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/onboarding", {
				replace: true,
			});
		});
	});

	test("navigates back to cloud login", async () => {
		render(() => <CloudRegister />);
		await user.click(screen.getByText("Sudah punya akun? Masuk"));
		expect(mockNavigate).toHaveBeenCalledWith("/cloud-login");
	});
});
