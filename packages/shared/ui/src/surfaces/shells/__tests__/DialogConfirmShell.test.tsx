import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DialogConfirmShell } from "../DialogConfirmShell";

describe("DialogConfirmShell", () => {
  it("renders consequence + cancel + confirm slots when open", () => {
    render(
      <DialogConfirmShell
        open
        onOpenChange={() => {}}
        title="Discard changes?"
        consequence="All unsaved changes on this document will be lost."
        cancel={<button type="button">Keep editing</button>}
        confirm={<button type="button">Discard</button>}
      />,
    );
    const surface = document.querySelector('[data-interaction-surface="dialog-confirm"]');
    expect(surface).toBeInTheDocument();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(
      surface?.querySelector('[data-surface-slot="consequence"]'),
    ).toHaveTextContent("All unsaved changes on this document will be lost.");
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("renders intent='neutral' by default and 'destructive' when specified", () => {
    const { rerender } = render(
      <DialogConfirmShell
        open
        onOpenChange={() => {}}
        consequence="ok"
        cancel={<button type="button">C</button>}
        confirm={<button type="button">D</button>}
      />,
    );
    expect(
      document.querySelector('[data-interaction-surface="dialog-confirm"]')?.getAttribute("data-intent"),
    ).toBe("neutral");

    rerender(
      <DialogConfirmShell
        open
        onOpenChange={() => {}}
        consequence="ok"
        intent="destructive"
        cancel={<button type="button">C</button>}
        confirm={<button type="button">D</button>}
      />,
    );
    expect(
      document.querySelector('[data-interaction-surface="dialog-confirm"]')?.getAttribute("data-intent"),
    ).toBe("destructive");
  });

  it("destructive dialogs prevent Esc dismissal (no onOpenChange call)", () => {
    const onOpenChange = vi.fn();
    render(
      <DialogConfirmShell
        open
        onOpenChange={onOpenChange}
        consequence="Posting cannot be reversed."
        intent="destructive"
        cancel={<button type="button">Cancel</button>}
        confirm={<button type="button">Post</button>}
      />,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
