import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { NumberFieldInput } from "../number-field";

/** Simulate typing a character at the end of the input. */
const typeAtEnd = (input: HTMLInputElement, char: string) => {
  const prev = input.value;
  input.value = prev + char;
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.input(input, {
    inputType: "insertText",
    data: char,
    target: input,
  });
};

/** Simulate backspace at the end of the input. */
const backspaceAtEnd = (input: HTMLInputElement) => {
  const prev = input.value;
  input.value = prev.slice(0, -1);
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.input(input, {
    inputType: "deleteContentBackward",
    target: input,
  });
};

describe("NumberFieldInput", () => {
  it("formats value prop with thousand separators on render", () => {
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput placeholder="Price" value={25_000} />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;
    expect(input.value).toBe("25.000");
  });

  it("renders empty when value is 0", () => {
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput placeholder="Price" value={0} />
    ));
    expect((getByPlaceholderText("Price") as HTMLInputElement).value).toBe("");
  });

  it("renders empty when value is undefined", () => {
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput placeholder="Price" value={undefined} />
    ));
    expect((getByPlaceholderText("Price") as HTMLInputElement).value).toBe("");
  });

  it("formats on type — typing 25000 produces 25.000", () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput onChange={onChange} placeholder="Price" />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;

    for (const ch of ["2", "5", "0", "0", "0"]) {
      typeAtEnd(input, ch);
    }

    expect(input.value).toBe("25.000");
    expect(onChange).toHaveBeenLastCalledWith(25_000);
  });

  it("calls onChange with numeric value, not formatted string", () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput onChange={onChange} placeholder="Price" />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;

    typeAtEnd(input, "5");
    typeAtEnd(input, "0");
    typeAtEnd(input, "0");
    typeAtEnd(input, "0");

    expect(onChange).toHaveBeenLastCalledWith(5000);
    expect(typeof onChange.mock.lastCall?.[0]).toBe("number");
  });

  it("strips non-digit characters", () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput onChange={onChange} placeholder="Price" />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;

    // Simulate pasting "abc123def456"
    input.value = "abc123def456";
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.input(input, { target: input });

    expect(input.value).toBe("123.456");
    expect(onChange).toHaveBeenLastCalledWith(123_456);
  });

  it("backspace removes last digit and reformats", () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput
        onChange={onChange}
        placeholder="Price"
        value={25_000}
      />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;

    expect(input.value).toBe("25.000");

    backspaceAtEnd(input);

    expect(input.value).toBe("2.500");
    expect(onChange).toHaveBeenLastCalledWith(2500);
  });

  it("handles large numbers", () => {
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput placeholder="Price" value={1_500_000_000} />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;
    expect(input.value).toBe("1.500.000.000");
  });

  it("maintains cursor position after formatting", () => {
    const { getByPlaceholderText } = render(() => (
      <NumberFieldInput placeholder="Price" value={5000} />
    ));
    const input = getByPlaceholderText("Price") as HTMLInputElement;

    // value is "5.000" — cursor at end after a digit
    // Simulate inserting "0" after the "5" (position 1, after "5")
    input.value = "50.000";
    input.setSelectionRange(2, 2); // cursor after "50"
    fireEvent.input(input, {
      inputType: "insertText",
      data: "0",
      target: input,
    });

    // "50000" → formatted "50.000", cursor should be after "50" (position 2)
    expect(input.value).toBe("50.000");
    // Cursor should be at digit position 2 → index 2 in "50.000"
    expect(input.selectionStart).toBe(2);
  });
});
