import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverlayShell } from "../overlay-shell";

describe("overlay-shell"", () => {
  it("does not render content when open=false", () => {
    render(
      <OverlayShell
        open={false}
        onOpenChange={() => {}}
        bindingBar={<span>Invoice INV-0042 · Edit Mode</span>}
      >
        catalog body
      </OverlayShell>,
    );
    expect(screen.queryByText("catalog body")).not.toBeInTheDocument();
  });

  it("renders bindingBar / body / footer slots when open", () => {
    render(
      <OverlayShell
        open
        onOpenChange={() => {}}
        ariaLabel="Catalog overlay"
        bindingBar={<span>Invoice INV-0042 · Edit Mode</span>}
        footer={<button type="button">Done</button>}
      >
        catalog body
      </OverlayShell>,
    );
    const surface = document.querySelector('[data-interaction-surface="overlay"]');
    expect(surface).toBeInTheDocument();
    expect(surface?.querySelector('[data-surface-slot="bindingBar"]')).toHaveTextContent(
      "Invoice INV-0042",
    );
    expect(surface?.querySelector('[data-surface-slot="body"]')).toHaveTextContent("catalog body");
    expect(surface?.querySelector('[data-surface-slot="footer"]')).toHaveTextContent("Done");
  });

  it("omits the footer slot when footer prop is absent", () => {
    render(
      <OverlayShell open onOpenChange={() => {}} bindingBar={<span>Bound</span>}>
        body
      </OverlayShell>,
    );
    expect(document.querySelector('[data-surface-slot="footer"]')).not.toBeInTheDocument();
  });

  it("has no scrim overlay element (overlay is full-viewport)", () => {
    render(
      <OverlayShell open onOpenChange={() => {}} bindingBar={<span>Bound</span>}>
        body
      </OverlayShell>,
    );
    // The shell must not portal a backdrop scrim — overlay covers the
    // viewport itself, so any extra layer adds no contrast and would
    // visually conflict with the parent stack underneath.
    expect(document.querySelector('[class*="scrim-"]')).not.toBeInTheDocument();
  });
});

