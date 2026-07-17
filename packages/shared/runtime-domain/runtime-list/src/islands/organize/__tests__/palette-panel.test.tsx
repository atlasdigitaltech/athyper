import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PalettePanel } from "../palette-panel";

describe("PalettePanel scrolling", () => {
  it("constrains the panel and gives its body an independent wheel-scroll region", () => {
    function TestPanel() {
      const [open, setOpen] = useState(false);
      return (
        <PalettePanel
          open={open}
          onOpenChange={setOpen}
          title="Organize"
          width={404}
          trigger={<button type="button">Organize</button>}
        >
          <div>Panel content</div>
        </PalettePanel>
      );
    }

    render(
      <TestPanel />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Organize" }));

    const panel = screen.getByRole("dialog", { name: "Organize" });
    expect(panel).toHaveStyle({
      maxHeight: "min(34rem, var(--radix-popover-content-available-height, calc(100dvh - 1rem)))",
    });
    expect(panel.querySelector("[data-runtime-palette-scroll]")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
    );
  });

  it("closes on Escape and restores focus to its trigger", async () => {
    function TestPanel() {
      const [open, setOpen] = useState(false);
      return (
        <PalettePanel
          open={open}
          onOpenChange={setOpen}
          title="Organize"
          trigger={<button type="button">Organize</button>}
        >
          <button type="button">Panel action</button>
        </PalettePanel>
      );
    }

    render(<TestPanel />);
    const trigger = screen.getByRole("button", { name: "Organize" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Organize" });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Organize" })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("dismisses when the user interacts outside the anchored panel", async () => {
    function TestPanel() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <PalettePanel
            open={open}
            onOpenChange={setOpen}
            title="Organize"
            trigger={<button type="button">Organize</button>}
          >
            <div>Panel content</div>
          </PalettePanel>
          <button type="button">Outside action</button>
        </div>
      );
    }

    render(<TestPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Organize" }));
    await screen.findByRole("dialog", { name: "Organize" });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside action" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Organize" })).toBeNull());
  });

  it("keeps drag movement controlled and resets the offset after close", async () => {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    function TestPanel() {
      const [open, setOpen] = useState(false);
      return (
        <PalettePanel
          open={open}
          onOpenChange={setOpen}
          title="Organize"
          trigger={<button type="button">Organize</button>}
        >
          <div>Panel content</div>
        </PalettePanel>
      );
    }

    render(<TestPanel />);
    const trigger = screen.getByRole("button", { name: "Organize" });
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Organize" });
    const dragHandle = screen.getByRole("heading", { name: "Organize" }).parentElement!;
    const pointerEvent = (
      type: string,
      init: MouseEventInit & { pointerId: number },
    ) => {
      const event = new MouseEvent(type, { bubbles: true, ...init });
      Object.defineProperty(event, "pointerId", { value: init.pointerId });
      return event;
    };
    fireEvent(dragHandle, pointerEvent("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }));
    fireEvent(dragHandle, pointerEvent("pointermove", {
      pointerId: 1,
      clientX: 130,
      clientY: 120,
    }));
    expect(panel).toHaveStyle({ translate: "30px 20px" });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Organize" })).toBeNull());
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Organize" })).toHaveStyle({ translate: "0px 0px" });
  });
});
