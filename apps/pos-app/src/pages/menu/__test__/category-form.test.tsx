import { useParams } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockNavigate = vi.fn();
const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();

vi.mock("@solidjs/router", () => ({
	useNavigate: () => mockNavigate,
	useParams: vi.fn(() => ({})),
}));

vi.mock("~/db/menu", () => ({
	getCategory: vi.fn(() =>
		Promise.resolve({
			id: 1,
			name: "Minuman",
			sortOrder: 0,
			isActive: true,
			createdAt: "",
			updatedAt: "",
		}),
	),
	createCategory: (...args: unknown[]) => mockCreateCategory(...args),
	updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
}));

vi.mock("~/components/ui/page-header", () => ({
	PageHeader: (props: { backHref?: string; children: JSX.Element }) => (
		<div data-testid="page-header">
			<span data-testid="back-href">{props.backHref ?? ""}</span>
			<h1>{props.children}</h1>
		</div>
	),
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

import CategoryForm from "../category-form";

const user = userEvent.setup();

describe("CategoryForm (create mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Tambah Kategori' title", () => {
		render(() => <CategoryForm />);
		expect(screen.getByText("Tambah Kategori")).toBeInTheDocument();
	});

	test("submit is disabled when name is empty", () => {
		render(() => <CategoryForm />);
		expect(screen.getByTestId("save-btn")).toBeDisabled();
	});

	test("submit is enabled when name is filled", async () => {
		render(() => <CategoryForm />);
		await user.type(screen.getByLabelText("Nama Kategori"), "Minuman");
		expect(screen.getByTestId("save-btn")).not.toBeDisabled();
	});
});

describe("CategoryForm (edit mode)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	test("shows 'Edit Kategori' title", async () => {
		vi.mocked(useParams).mockReturnValue({ id: "1" });
		render(() => <CategoryForm />);
		await screen.findByText("Edit Kategori");
		expect(screen.getByText("Edit Kategori")).toBeInTheDocument();
	});
});
