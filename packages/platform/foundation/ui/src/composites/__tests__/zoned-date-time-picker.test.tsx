/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZonedDateTimePicker } from "../zoned-date-time-picker";

describe("zoned-date-time-picker"", () => {
  it("renders the bound zone (never silently converts to viewer TZ)", () => {
    render(
      <ZonedDateTimePicker
        value={{ localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" }}
        locale="en-GB"
      />,
    );
    const btn = screen.getByRole("button", { expanded: false });
    expect(btn.textContent ?? "").toMatch(/Asia\/Riyadh/);
    expect(btn.textContent ?? "").toMatch(/18:00/);
  });

  it("shows the placeholder when value is null", () => {
    render(<ZonedDateTimePicker value={null} placeholder="Pick a moment" />);
    expect(screen.getByText("Pick a moment")).toBeTruthy();
  });

  it("falls back to default placeholder when none provided", () => {
    render(<ZonedDateTimePicker value={null} />);
    expect(screen.getByText(/Pick date, time & zone/i)).toBeTruthy();
  });

  it("clearable=false hides the X button", () => {
    render(
      <ZonedDateTimePicker
        value={{ localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" }}
        clearable={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /clear date/i })).toBeNull();
  });

  it("displays a Tokyo zone the same way as Riyadh — no implicit conversion", () => {
    render(
      <ZonedDateTimePicker
        value={{ localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Tokyo" }}
        locale="en-GB"
      />,
    );
    const btn = screen.getByRole("button", { expanded: false });
    expect(btn.textContent ?? "").toMatch(/Asia\/Tokyo/);
    expect(btn.textContent ?? "").toMatch(/18:00/);
  });

  it("aria-describedby wired when error is set", () => {
    render(
      <ZonedDateTimePicker
        id="scheduled-at"
        value={null}
        error="Required"
      />,
    );
    const btn = screen.getByRole("button", { expanded: false });
    expect(btn.getAttribute("aria-describedby")).toBe("scheduled-at-error");
    expect(btn.getAttribute("aria-invalid")).toBe("true");
  });
});

