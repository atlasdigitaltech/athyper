import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell } from "../PageShell";

describe("PageShell", () => {
  it("renders body without optional slots", () => {
    render(
      <PageShell>
        <p>Body content</p>
      </PageShell>,
    );
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(document.querySelector('[data-interaction-surface="page"]')).toBeInTheDocument();
  });

  it("renders header / toolbar / body / sidepanel slots when provided", () => {
    render(
      <PageShell
        header={<div>HEADER</div>}
        toolbar={<div>TOOLBAR</div>}
        sidepanel={<div>SIDEPANEL</div>}
      >
        BODY
      </PageShell>,
    );
    expect(screen.getByText("HEADER").closest('[data-surface-slot="header"]')).toBeInTheDocument();
    expect(screen.getByText("TOOLBAR").closest('[data-surface-slot="toolbar"]')).toBeInTheDocument();
    expect(screen.getByText("SIDEPANEL").closest('[data-surface-slot="sidepanel"]')).toBeInTheDocument();
    expect(document.querySelector('[data-surface-slot="body"]')).toHaveTextContent("BODY");
  });

  it("does not render header / toolbar / sidepanel slot wrappers when slots are omitted", () => {
    render(<PageShell>body</PageShell>);
    expect(document.querySelector('[data-surface-slot="header"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-surface-slot="toolbar"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-surface-slot="sidepanel"]')).not.toBeInTheDocument();
  });
});
