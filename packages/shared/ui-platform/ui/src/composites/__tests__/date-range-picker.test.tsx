/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DateRangePicker, DEFAULT_PRESETS, FISCAL_PRESETS } from "../date-range-picker";

describe("DateRangePicker — trigger label", () => {
  it("renders placeholder when value is null", () => {
    render(<DateRangePicker value={null} placeholder="Any date" />);
    expect(screen.getByText("Any date")).toBeTruthy();
  });

  it("renders formatted range when both endpoints set", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-06-01", to: "2026-06-30", preset: null }}
        locale="en-GB"
        dateFormat="%d/%m/%Y"
      />,
    );
    const btn = screen.getByRole("button", { expanded: false });
    expect(btn.textContent ?? "").toContain("01/06/2026");
    expect(btn.textContent ?? "").toContain("30/06/2026");
  });

  it("collapses same-day range to a single formatted date", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-06-30", to: "2026-06-30", preset: null }}
        locale="en-GB"
        dateFormat="%d/%m/%Y"
      />,
    );
    const text = screen.getByRole("button", { expanded: false }).textContent ?? ";
    expect(text.match(/30\/06\/2026/g)?.length).toBe(1);
    expect(text).not.toContain("–");
  });

  it("shows preset label when a preset is active", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-06-01", to: "2026-06-30", preset: "last_30_days" }}
        locale="en"
      />,
    );
    expect(screen.getByRole("button", { expanded: false }).textContent).toContain("Last 30 days");
  });

  it("shows locale-driven preset label (Arabic)", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-06-01", to: "2026-06-30", preset: "last_30_days" }}
        locale="ar-SA"
      />,
    );
    expect(screen.getByRole("button", { expanded: false }).textContent).toContain("آخر ٣٠ يوماً");
  });
});

describe("DateRangePicker — presets", () => {
  it("applying a preset emits both endpoints + preset key", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={null}
        onChange={onChange}
        locale="en"
        // Freeze the anchor via timeZone; picker resolves today from Intl.
        presets={[{ key: "today" }, { key: "yesterday" }]}
      />,
    );
    // Open the popover
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    // Click "Today" preset chip
    const todayChip = screen.getByRole("option", { name: /Today/ });
    fireEvent.click(todayChip);

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0];
    expect(arg.preset).toBe("today");
    expect(arg.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.from).toBe(arg.to);
  });

  it("presets sidebar hidden when preset list is empty", () => {
    render(<DateRangePicker value={null} presets={[]} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.queryByRole("listbox", { name: /presets/i })).toBeNull();
  });

  it("FISCAL_PRESETS surfaces fiscal-aware chips", () => {
    render(<DateRangePicker value={null} presets={FISCAL_PRESETS} locale="en" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const list = screen.getByRole("listbox", { name: /presets/i });
    expect(within(list).getByRole("option", { name: /This quarter/ })).toBeTruthy();
    expect(within(list).getByRole("option", { name: /Year to date/ })).toBeTruthy();
  });

  it("FISCAL_PRESETS distinguishes calendar-year from fiscal-year chips (both present)", () => {
    render(<DateRangePicker value={null} presets={FISCAL_PRESETS} locale="en" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const list = screen.getByRole("listbox", { name: /presets/i });
    // Calendar-year chip: "This year" (Jan-Dec)
    expect(within(list).getByRole("option", { name: /^This year$/ })).toBeTruthy();
    // Fiscal-year chip: "This fiscal year" (respects fyStart)
    expect(within(list).getByRole("option", { name: /This fiscal year/ })).toBeTruthy();
  });

  it("FISCAL_PRESETS renders section dividers between calendar and fiscal groups", () => {
    const { container } = render(
      <DateRangePicker value={null} presets={FISCAL_PRESETS} locale="en" />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    // Popover renders in a portal — query the document body via container's ownerDocument.
    const dividers = container.ownerDocument.querySelectorAll("[data-section-divider]");
    // FISCAL_PRESETS has three sections (recent → calendar → fiscal), so we expect
    // two dividers between them.
    expect(dividers.length).toBe(2);
    // Verify the section labels on the dividers so a re-ordering doesn't silently
    // drop grouping.
    const sections = Array.from(dividers).map((el) => el.getAttribute("data-section-divider"));
    expect(sections).toEqual(["calendar", "fiscal"]);
  });

  it("DEFAULT_PRESETS is calendar-only (no fiscal chips)", () => {
    render(<DateRangePicker value={null} presets={DEFAULT_PRESETS} locale="en" />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const list = screen.getByRole("listbox", { name: /presets/i });
    expect(within(list).queryByRole("option", { name: /quarter/i })).toBeNull();
    expect(within(list).queryByRole("option", { name: /Year to date/i })).toBeNull();
  });

  it("presets without any `section` field render zero dividers (back-compat)", () => {
    const { container } = render(
      <DateRangePicker
        value={null}
        presets={[{ key: "today" }, { key: "yesterday" }, { key: "last_7_days" }]}
        locale="en"
      />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const dividers = container.ownerDocument.querySelectorAll("[data-section-divider]");
    expect(dividers.length).toBe(0);
  });
});

describe("DateRangePicker — clear + accessibility", () => {
  it("clearable X button emits null", () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        value={{ from: "2026-06-01", to: "2026-06-30", preset: null }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /clear date range/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clearable=false hides the X button", () => {
    render(
      <DateRangePicker
        value={{ from: "2026-06-01", to: "2026-06-30", preset: null }}
        clearable={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /clear date range/i })).toBeNull();
  });

  it("aria-describedby wired to error id", () => {
    render(<DateRangePicker id="my-range" value={null} error="Required" />);
    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger.getAttribute("aria-describedby")).toBe("my-range-error");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
  });
});

