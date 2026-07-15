import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DrawerPeekShell } from "../drawer-peek-shell";

describe("drawer-peek-shell"", () => {
  it("renders read-only content with context intent", () => {
    render(
      <DrawerPeekShell
        open
        onOpenChange={() => {}}
        contextBadge="LINE"
        title="Line 12"
        subtitle="Posted"
        actions={<button type="button">Expand</button>}
      >
        peek body
      </DrawerPeekShell>,
    );
    const surface = document.querySelector('[data-interaction-surface="drawer-peek"]');
    expect(surface).toBeInTheDocument();
    expect(screen.getByText("Line 12")).toBeInTheDocument();
    expect(screen.getByText("Posted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
    expect(surface).toHaveTextContent("peek body");
  });

  it("does not render when closed", () => {
    render(
      <DrawerPeekShell open={false} onOpenChange={() => {}}>
        peek body
      </DrawerPeekShell>,
    );
    expect(screen.queryByText("peek body")).not.toBeInTheDocument();
  });
});

