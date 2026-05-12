import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, type JSX } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import { PhotoSourceDrawer } from "../photo-source-drawer";

vi.mock("~/components/ui/button", () => ({
  Button: (props: {
    children: JSX.Element;
    onClick?: () => void;
    type?: "button" | "submit";
  }) => (
    <button onClick={props.onClick} type={props.type ?? "button"}>
      {props.children}
    </button>
  ),
}));

describe("PhotoSourceDrawer", () => {
  test("shows only camera and gallery actions", async () => {
    const user = userEvent.setup();
    const [open] = createSignal(true);
    const onOpenChange = vi.fn();
    const onPickCamera = vi.fn();
    const onPickGallery = vi.fn();

    render(() => (
      <PhotoSourceDrawer
        onOpenChange={onOpenChange}
        onPickCamera={onPickCamera}
        onPickGallery={onPickGallery}
        open={open()}
      />
    ));

    expect(screen.getByText("Pilih Foto")).toBeInTheDocument();
    expect(screen.getByText("Ambil Foto")).toBeInTheDocument();
    expect(screen.getByText("Pilih dari Galeri")).toBeInTheDocument();
    expect(screen.queryByText("Batal")).not.toBeInTheDocument();

    await user.click(screen.getByText("Ambil Foto"));
    expect(onPickCamera).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByText("Pilih dari Galeri"));
    expect(onPickGallery).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
