// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "../Card";

describe("Card", () => {
  it("renders children content", () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("uses token-based border class", () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-border");
    expect(card.className).toContain("bg-card");
  });

  it("does not use hardcoded color classes", () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain("bg-white");
    expect(card.className).not.toContain("border-black");
  });

  it("merges custom className", () => {
    const { container } = render(<Card className="custom">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("custom");
  });
});
