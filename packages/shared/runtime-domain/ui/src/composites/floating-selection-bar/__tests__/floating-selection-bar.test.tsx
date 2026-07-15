import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FloatingSelectionBar } from "..";
import type { SelectionAction } from "..";
import { Pencil, Trash2 } from "lucide-react";

/**
 * jsdom does not honour `sm:hidden` / `sm:flex` Tailwind utilities; both the
 * desktop pill and the mobile sheet render simultaneously in tests. We pass
 * `mobileLayout="pill"` to most tests so only the desktop pill is in the DOM,
 * and we test the mobile sheet specifically in its own block.
 */

function makeActions(overrides: Partial<SelectionAction>[] = []): SelectionAction[] {
  return overrides.map((o, i) => ({
    id:       o.id    ?? `act-${i}`,
    label:    o.label ?? `Action ${i}`,
    onSelect: o.onSelect ?? vi.fn(),
    ...o,
  }));
}

describe("FloatingSelectionBar", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(
      <FloatingSelectionBar count={0} actions={[]} onClear={() => {}} portalTarget={null} />,
    );
    expect(container.querySelector("[data-floating-selection-bar]")).toBeNull();
  });

  it("renders the count with default noun", () => {
    render(
      <FloatingSelectionBar
        count={3}
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(screen.getByText("3 items selected")).toBeInTheDocument();
  });

  it("uses singular noun when count is 1", () => {
    render(
      <FloatingSelectionBar
        count={1}
        noun={{ singular: "line", plural: "lines" }}
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(screen.getByText("1 line selected")).toBeInTheDocument();
  });

  it("renders primary and secondary actions with destructive styling", () => {
    render(
      <FloatingSelectionBar
        count={2}
        actions={makeActions([
          { id: "edit",   label: "Edit",   group: "primary",   icon: Pencil },
          { id: "delete", label: "Delete", group: "secondary", variant: "destructive", icon: Trash2 },
        ])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    const edit   = screen.getByRole("button", { name: /Edit/ });
    const remove = screen.getByRole("button", { name: /Delete/ });
    expect(edit).toBeInTheDocument();
    expect(remove).toBeInTheDocument();
    expect(remove.className).toMatch(/text-destructive/);
  });

  it("hides actions with hidden: true", () => {
    render(
      <FloatingSelectionBar
        count={1}
        actions={makeActions([
          { id: "edit", label: "Edit",   group: "primary" },
          { id: "x",    label: "Hidden", group: "primary", hidden: true },
        ])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(screen.queryByRole("button", { name: /Hidden/ })).toBeNull();
  });

  it("disables actions when global busy is true", () => {
    const onSelect = vi.fn();
    render(
      <FloatingSelectionBar
        count={1}
        busy={true}
        actions={makeActions([{ id: "edit", label: "Edit", onSelect }])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("disables actions individually when action.disabled is true", () => {
    const onSelect = vi.fn();
    render(
      <FloatingSelectionBar
        count={1}
        actions={makeActions([{ id: "edit", label: "Edit", disabled: true, onSelect }])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a badge with provided label", () => {
    render(
      <FloatingSelectionBar
        count={15}
        actions={makeActions([
          { id: "post", label: "Post", badge: "8 of 15", badgeTone: "warning" },
        ])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(screen.getByText("8 of 15")).toBeInTheDocument();
  });

  it("calls onClear when the Clear (X) button is clicked", () => {
    const onClear = vi.fn();
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={onClear}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it("clears selection on Escape when enableEscapeToClear is true (default)", () => {
    const onClear = vi.fn();
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={onClear}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClear).toHaveBeenCalled();
  });

  it("does NOT clear on Escape when enableEscapeToClear is false", () => {
    const onClear = vi.fn();
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={onClear}
        enableEscapeToClear={false}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClear).not.toHaveBeenCalled();
  });

  it("does NOT attach a bar-keyboard listener when both keyboard options are off", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={() => {}}
        enableEscapeToClear={false}
        enableShortcuts={false}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    // The modality tracker adds a `keydown` listener with capture=true. The
    // bar's own listener (which we want to verify is NOT attached) would be
    // a `keydown` listener with capture=false (the default).
    const barKeydown = addSpy.mock.calls.find(
      (c) => c[0] === "keydown" && c[2] !== true && !(typeof c[2] === "object" && c[2]?.capture),
    );
    expect(barKeydown).toBeUndefined();
    addSpy.mockRestore();
  });

  it("fires shortcut action when enableShortcuts is true and key matches", () => {
    const onSelect = vi.fn();
    render(
      <FloatingSelectionBar
        count={1}
        enableShortcuts={true}
        actions={makeActions([
          { id: "edit", label: "Edit", shortcut: { key: "e" }, onSelect },
        ])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    fireEvent.keyDown(document, { key: "e" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("ignores shortcut when typing into an editable element", () => {
    const onSelect = vi.fn();
    render(
      <>
        <input data-testid="search" />
        <FloatingSelectionBar
          count={1}
          enableShortcuts={true}
          actions={makeActions([
            { id: "edit", label: "Edit", shortcut: { key: "e" }, onSelect },
          ])}
          onClear={() => {}}
          portalTarget={null}
          mobileLayout="pill"
        />
      </>,
    );
    const input = screen.getByTestId("search");
    input.focus();
    fireEvent.keyDown(input, { key: "e" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("region has aria-label that reflects the count", () => {
    render(
      <FloatingSelectionBar
        count={5}
        noun={{ singular: "record", plural: "records" }}
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(
      screen.getByRole("region", { name: "5 records selected" }),
    ).toBeInTheDocument();
  });

  it("count span has aria-live='polite' for SR announcements", () => {
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    const countEl = screen.getByText("2 items selected");
    expect(countEl.getAttribute("aria-live")).toBe("polite");
  });

  it("does NOT auto-focus when autoFocus='never'", async () => {
    const focusSpy = vi.fn();
    render(
      <FloatingSelectionBar
        count={1}
        autoFocus="never"
        actions={makeActions([
          { id: "edit", label: "Edit", group: "primary", onSelect: vi.fn() },
        ])}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    const btn = screen.getByRole("button", { name: /Edit/ });
    btn.addEventListener("focus", focusSpy);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("renders mobile sheet when mobileLayout='sheet' (role=dialog)", () => {
    render(
      <FloatingSelectionBar
        count={2}
        actions={makeActions([{ id: "edit", label: "Edit" }])}
        onClear={() => {}}
        portalTarget={null}
      />,
    );
    expect(screen.getByRole("dialog", { name: /selected/ })).toBeInTheDocument();
  });

  it("does NOT render mobile sheet when mobileLayout='pill'", () => {
    render(
      <FloatingSelectionBar
        count={2}
        mobileLayout="pill"
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("respects portalTarget={null} (renders inline, no portal)", () => {
    const { container } = render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={() => {}}
        portalTarget={null}
        mobileLayout="pill"
      />,
    );
    expect(container.querySelector("[data-floating-selection-bar]")).toBeInTheDocument();
  });

  it("portals to document.body by default", () => {
    render(
      <FloatingSelectionBar
        count={2}
        actions={[]}
        onClear={() => {}}
        mobileLayout="pill"
      />,
    );
    const bar = document.body.querySelector("[data-floating-selection-bar]");
    expect(bar).toBeInTheDocument();
  });
});
