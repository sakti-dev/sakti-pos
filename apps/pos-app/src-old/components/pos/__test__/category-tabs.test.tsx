import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { CategoryTabs } from "../category-tabs";

const user = userEvent.setup();

describe("CategoryTabs", () => {
  const categories = ["Makanan", "Minuman", "Snack"];

  test('renders "Semua" button', () => {
    render(() => (
      <CategoryTabs
        categories={categories}
        onChange={() => {}}
        selected={null}
      />
    ));
    expect(screen.getByText("Semua")).toBeInTheDocument();
  });

  test("renders all category names", () => {
    render(() => (
      <CategoryTabs
        categories={categories}
        onChange={() => {}}
        selected={null}
      />
    ));
    expect(screen.getByText("Makanan")).toBeInTheDocument();
    expect(screen.getByText("Minuman")).toBeInTheDocument();
    expect(screen.getByText("Snack")).toBeInTheDocument();
  });

  test('calls onChange(null) when "Semua" is clicked', async () => {
    const onChange = vi.fn();
    render(() => (
      <CategoryTabs
        categories={categories}
        onChange={onChange}
        selected="Makanan"
      />
    ));
    await user.click(screen.getByText("Semua"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("calls onChange(category) when a category is clicked", async () => {
    const onChange = vi.fn();
    render(() => (
      <CategoryTabs
        categories={categories}
        onChange={onChange}
        selected={null}
      />
    ));
    await user.click(screen.getByText("Minuman"));
    expect(onChange).toHaveBeenCalledWith("Minuman");
  });

  test("shows active state for selected category", () => {
    render(() => (
      <CategoryTabs
        categories={categories}
        onChange={() => {}}
        selected="Minuman"
      />
    ));
    const button = screen.getByText("Minuman").closest("button");
    expect(button).toHaveClass("border-primary/50");
  });
});
