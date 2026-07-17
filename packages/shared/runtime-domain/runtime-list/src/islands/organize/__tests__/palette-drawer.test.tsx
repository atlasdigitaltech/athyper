import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteDrawer } from "../palette-drawer";

function setDesktop(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function Harness({ workspace = false }: { workspace?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>Open filters</button>
      {open && (
        <PaletteDrawer
          anchorRef={anchorRef}
          title="Filter"
          onClose={() => setOpen(false)}
          workspace={workspace}
        >
          <button type="button">Drawer action</button>
        </PaletteDrawer>
      )}
    </>
  );
}

describe("PaletteDrawer overlay behavior", () => {
  beforeEach(() => setDesktop(true));

  it("uses the shared desktop drawer geometry for a workspace", async () => {
    render(<Harness workspace />);
    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));

    const drawer = await screen.findByRole("dialog", { name: "Filter" });
    expect(drawer).toHaveAttribute("data-drawer-shell-content", "true");
    expect(drawer).toHaveStyle({ width: "640px", maxWidth: "85vw" });
  });

  it("closes on Escape and restores focus to the external trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open filters" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Filter" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses a full-height Sheet workspace below the desktop breakpoint", async () => {
    setDesktop(false);
    render(<Harness workspace />);
    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));

    const sheet = await screen.findByRole("dialog", { name: "Filter" });
    expect(sheet).not.toHaveAttribute("data-drawer-shell-content");
    expect(sheet).toHaveClass("h-full", "w-full");
    expect(screen.getByRole("button", { name: "Close Filter" })).toBeVisible();
  });
});
