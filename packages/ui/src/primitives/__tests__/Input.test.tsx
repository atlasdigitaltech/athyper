// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Input } from "../Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("accepts typed input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "hello");
    expect(onChange).toHaveBeenCalled();
  });

  it("uses token-based border and background classes", () => {
    const { container } = render(<Input />);
    const input = container.querySelector("input")!;
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("bg-background");
    expect(input.className).not.toContain("bg-white");
    expect(input.className).not.toContain("border-black");
  });

  it("can be disabled", () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("merges custom className", () => {
    const { container } = render(<Input className="w-64" />);
    const input = container.querySelector("input")!;
    expect(input.className).toContain("w-64");
  });
});
