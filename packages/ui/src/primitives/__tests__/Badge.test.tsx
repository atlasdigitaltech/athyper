// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies default variant classes", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-primary");
  });

  it("applies secondary variant classes", () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText("Secondary");
    expect(badge.className).toContain("bg-secondary");
  });

  it("applies destructive variant classes", () => {
    render(<Badge variant="destructive">Danger</Badge>);
    const badge = screen.getByText("Danger");
    expect(badge.className).toContain("bg-destructive");
  });

  it("merges custom className", () => {
    render(<Badge className="my-class">Styled</Badge>);
    const badge = screen.getByText("Styled");
    expect(badge.className).toContain("my-class");
  });
});
