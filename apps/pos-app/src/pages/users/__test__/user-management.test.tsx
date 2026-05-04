import { render, screen } from "@solidjs/testing-library";
import { describe, expect, test } from "vitest";

import UserManagement from "../user-management";

describe("UserManagement", () => {
  test("renders children pass-through", () => {
    render(() => (
      <UserManagement {...({} as any)}>
        <div data-testid="child-content">Hello</div>
      </UserManagement>
    ));
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
