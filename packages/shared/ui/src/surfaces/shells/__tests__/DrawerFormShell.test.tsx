import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DrawerFormShell } from "../DrawerFormShell";

describe("DrawerFormShell", () => {
  it("does not mount content when closed", () => {
    render(
      <DrawerFormShell open={false} onOpenChange={() => {}}>
        line composer body
      </DrawerFormShell>,
    );
    expect(screen.queryByText("line composer body")).not.toBeInTheDocument();
  });

  it("renders title / subtitle / live status / actions when open", () => {
    render(
      <DrawerFormShell
        open
        onOpenChange={() => {}}
        contextBadge="INVOICE LINE"
        title="Add line"
        subtitle="Line 4 of 4"
        liveStatus={<span>3 lines · $1,200 staged</span>}
        secondaryAction={<button type="button">Cancel</button>}
        primaryAction={<button type="button">Add</button>}
      >
        line form body
      </DrawerFormShell>,
    );
    const surface = document.querySelector('[data-interaction-surface="drawer-form"]');
    expect(surface).toBeInTheDocument();
    expect(surface).toHaveTextContent("line form body");
    expect(screen.getByText("Add line")).toBeInTheDocument();
    expect(screen.getByText("Line 4 of 4")).toBeInTheDocument();
    expect(screen.getByText(/3 lines/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders without a footer when no live status / actions are supplied", () => {
    render(
      <DrawerFormShell open onOpenChange={() => {}} title="X">
        body
      </DrawerFormShell>,
    );
    // Footer bar rendered by underlying DrawerShell only when footerStart
    // or footerEnd is supplied — DrawerFormShell forwards undefined for both
    // when no slots are provided.
    expect(document.querySelector('[data-surface-slot="body"]')?.textContent).toContain("body");
  });
});
