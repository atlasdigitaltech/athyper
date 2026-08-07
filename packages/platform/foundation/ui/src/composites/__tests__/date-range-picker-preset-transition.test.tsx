/**
 * @vitest-environment jsdom
 */

import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateRangePicker, FISCAL_PRESETS, type DateRangeValue } from "../date-range-picker";

function ControlledPicker() {
  const [value, setValue] = useState<DateRangeValue | null>(null);
  return <DateRangePicker value={value} onChange={setValue} presets={FISCAL_PRESETS} locale="en" months={1} />;
}

describe("DateRangePicker preset to custom range", () => {
  it("allows a calendar date to replace an active preset without an intermediate clear", () => {
    render(<ControlledPicker />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("option", { name: /^This year$/ }));
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent("This year");

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const grid = screen.getAllByRole("grid")[0]!;
    const date = within(grid).getAllByRole("gridcell").find((cell) => cell.textContent === "1");
    expect(date).toBeTruthy();
    fireEvent.click(date!);

    expect(screen.getByRole("button", { expanded: true })).not.toHaveTextContent("This year");
  });

  it("uses the calendar header pager in the controlled one-month layout", () => {
    render(<ControlledPicker />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getAllByRole("grid")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Previous month" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    const monthLabel = screen.getByTitle("Pick a year");
    const before = monthLabel.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByTitle("Pick a year").textContent).not.toBe(before);
  });
});
