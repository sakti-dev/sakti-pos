import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

const mockCurrentOutletId = vi.fn(() => "outlet-1");
vi.mock("~/store/outlet", () => ({
  currentOutletId: () => mockCurrentOutletId(),
}));

import OutletSelector from "../outlet-selector";

const user = userEvent.setup();

function renderWithProps(
  outlets: { id: string; name: string; timezone: string }[]
) {
  const onChange = vi.fn();
  const result = render(() => (
    <OutletSelector onChange={onChange} outlets={outlets} />
  ));
  return { ...result, onChange };
}

describe("OutletSelector", () => {
  test("renders current outlet name", () => {
    const { getByText } = renderWithProps([
      { id: "outlet-1", name: "Cabang Sudirman", timezone: "Asia/Jakarta" },
      { id: "outlet-2", name: "Cabang Thamrin", timezone: "Asia/Makassar" },
    ]);
    expect(getByText("Cabang Sudirman")).toBeInTheDocument();
  });

  test("is hidden when only one outlet", () => {
    const { queryByText } = renderWithProps([
      { id: "outlet-1", name: "Cabang Sudirman", timezone: "Asia/Jakarta" },
    ]);
    expect(queryByText("Cabang Sudirman")).toBeNull();
  });

  test("opens dropdown and shows all outlets when clicked", async () => {
    const { getByText, queryByText } = renderWithProps([
      { id: "outlet-1", name: "Cabang Sudirman", timezone: "Asia/Jakarta" },
      { id: "outlet-2", name: "Cabang Thamrin", timezone: "Asia/Makassar" },
    ]);
    expect(queryByText("Cabang Thamrin")).toBeNull();
    await user.click(getByText("Cabang Sudirman"));
    expect(getByText("Cabang Thamrin")).toBeInTheDocument();
  });

  test("calls onChange when different outlet selected", async () => {
    const { getByText, onChange } = renderWithProps([
      { id: "outlet-1", name: "Cabang Sudirman", timezone: "Asia/Jakarta" },
      { id: "outlet-2", name: "Cabang Thamrin", timezone: "Asia/Makassar" },
    ]);
    await user.click(getByText("Cabang Sudirman"));
    await user.click(getByText("Cabang Thamrin"));
    expect(onChange).toHaveBeenCalledWith({
      id: "outlet-2",
      name: "Cabang Thamrin",
      timezone: "Asia/Makassar",
    });
  });
});
