import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: () => ({}),
}));

vi.mock("~/store/auth", () => ({
	currentUser: vi.fn(() => ({ id: 1, name: "Admin", role: "owner" })),
	changeCurrentUserPin: vi.fn(),
	logout: (...args: unknown[]) => mockLogout(...args),
}));

vi.mock("~/store/outlet", () => ({
	clearOutletContext: vi.fn(),
	currentOutletId: () => null,
}));

vi.mock("~/store/sync", () => ({
	syncNow: vi.fn(),
	syncStatus: vi.fn(() => "idle"),
}));

vi.mock("~/store/theme", () => ({
	setTheme: vi.fn(),
	theme: vi.fn(() => "system"),
}));

vi.mock("~/lib/cloud-auth", () => ({
	getSession: vi.fn(() => Promise.resolve({ user: null })),
	logout: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

import { useSettings } from "../use-settings";

describe("useSettings", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("logs out and navigates to /login", () => {
		createRoot((dispose) => {
			const settings = useSettings();

			settings.handleLogout();

			expect(mockLogout).toHaveBeenCalledTimes(1);
			expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
			dispose();
		});
	});
});
