import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ConfirmDrawer } from "../confirm-drawer";

const user = userEvent.setup();

describe("ConfirmDrawer", () => {
	test("renders title and message when open", () => {
		render(() => (
			<ConfirmDrawer
				message="Are you sure?"
				onClose={() => {}}
				onConfirm={() => {}}
				open={true}
				title="Confirm"
			/>
		));
		expect(screen.getByText("Confirm")).toBeInTheDocument();
		expect(screen.getByText("Are you sure?")).toBeInTheDocument();
	});

	test("calls onClose when cancel button is clicked", async () => {
		const onClose = vi.fn();
		render(() => (
			<ConfirmDrawer
				message="Are you sure?"
				onClose={onClose}
				onConfirm={() => {}}
				open={true}
				title="Confirm"
			/>
		));
		await user.click(screen.getByText("Batal"));
		expect(onClose).toHaveBeenCalled();
	});

	test("calls onConfirm and onClose when confirm button is clicked", async () => {
		const onClose = vi.fn();
		const onConfirm = vi.fn();
		render(() => (
			<ConfirmDrawer
				message="Are you sure?"
				onClose={onClose}
				onConfirm={onConfirm}
				open={true}
				title="Confirm"
			/>
		));
		await user.click(screen.getByText("Hapus"));
		expect(onConfirm).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	test("renders custom confirm label", () => {
		render(() => (
			<ConfirmDrawer
				confirmLabel="Delete All"
				message="Are you sure?"
				onClose={() => {}}
				onConfirm={() => {}}
				open={true}
				title="Confirm"
			/>
		));
		expect(screen.getByText("Delete All")).toBeInTheDocument();
	});
});
