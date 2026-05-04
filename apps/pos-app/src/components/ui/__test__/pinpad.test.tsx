import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import PinPad from "../pinpad";

const user = userEvent.setup();

describe("PinPad", () => {
	test("renders pin dots", () => {
		const { container } = render(() => <PinPad onSubmit={() => {}} />);
		const dots = container.querySelectorAll(".rounded-full");
		expect(dots.length).toBe(6);
	});

	test("fills dots as digits are entered", async () => {
		const { getByText, container } = render(() => (
			<PinPad onSubmit={() => {}} />
		));
		await user.click(getByText("1"));
		await user.click(getByText("2"));
		const filledDots = container.querySelectorAll(".rounded-full.bg-primary");
		expect(filledDots.length).toBe(2);
	});

	test("calls onSubmit with pin when OK is pressed after entering max digits", async () => {
		const onSubmit = vi.fn();
		const { getByText } = render(() => <PinPad onSubmit={onSubmit} />);
		await user.click(getByText("1"));
		await user.click(getByText("2"));
		await user.click(getByText("3"));
		await user.click(getByText("4"));
		await user.click(getByText("5"));
		await user.click(getByText("6"));
		await user.click(getByText("OK"));
		expect(onSubmit).toHaveBeenCalledWith("123456");
	});

	test("does not submit when pin is incomplete", async () => {
		const onSubmit = vi.fn();
		const { getByText } = render(() => <PinPad onSubmit={onSubmit} />);
		await user.click(getByText("1"));
		await user.click(getByText("2"));
		await user.click(getByText("OK"));
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test("delete removes last digit", async () => {
		const { getByText, container } = render(() => (
			<PinPad onSubmit={() => {}} />
		));
		await user.click(getByText("1"));
		await user.click(getByText("2"));
		expect(container.querySelectorAll(".rounded-full.bg-primary").length).toBe(
			2,
		);
		await user.click(getByText("⌫"));
		expect(container.querySelectorAll(".rounded-full.bg-primary").length).toBe(
			1,
		);
	});
});
