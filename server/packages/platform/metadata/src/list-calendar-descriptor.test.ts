import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { parsePublishedListCalendar, validatePublishedListCalendar } from "./list-calendar-descriptor.js";

const field = (key: string, type: EntityFieldDescriptor["type"]): EntityFieldDescriptor => ({ key, storagePath: key, type, required: false, writableOn: [] });
const fields = new Map([["due", field("due", "date")], ["until", field("until", "date")], ["at", field("at", "datetime")], ["stage", field("stage", "enum")]]);

describe("published list calendar", () => {
  it("parses a calendar with a range and tone", () => {
    const calendar = parsePublishedListCalendar({ defaultView: "agenda", dateFields: [{ start: "due", end: "until", tone: { field: "stage", choices: [{ value: "open", label: "Open", tone: "warning" }] } }] });
    expect(calendar.dateFields[0]).toMatchObject({ start: "due", end: "until" });
  });

  it("rejects a default view this release cannot render", () => {
    expect(() => parsePublishedListCalendar({ defaultView: "week", dateFields: [{ start: "due" }] })).toThrow("listPresentation.calendar.defaultView must be a renderable view");
  });

  it("rejects unknown properties and too many date fields", () => {
    expect(() => parsePublishedListCalendar({ defaultView: "month", dateFields: [{ start: "due", recurrence: "weekly" }] })).toThrow(/not a published calendar property/);
    expect(() => parsePublishedListCalendar({ defaultView: "month", dateFields: ["a", "b", "c", "d"].map((start) => ({ start })) })).toThrow(/1 to 3/);
  });

  it("checks kinds and Calendar mode against the entity", () => {
    const calendar = parsePublishedListCalendar({ defaultView: "month", dateFields: [{ start: "due", end: "until" }] });
    expect(() => validatePublishedListCalendar({ calendar, supportedModes: ["table", "calendar"] }, fields)).not.toThrow();
    expect(() => validatePublishedListCalendar({ calendar, supportedModes: ["table"] }, fields)).toThrow(/exactly when Calendar/);
    const mixed = parsePublishedListCalendar({ defaultView: "month", dateFields: [{ start: "due", end: "at" }] });
    expect(() => validatePublishedListCalendar({ calendar: mixed, supportedModes: ["calendar"] }, fields)).toThrow(/start field's kind/);
    const toneOnDate = parsePublishedListCalendar({ defaultView: "month", dateFields: [{ start: "due", tone: { field: "until", choices: [{ value: "x", label: "X", tone: "neutral" }] } }] });
    expect(() => validatePublishedListCalendar({ calendar: toneOnDate, supportedModes: ["calendar"] }, fields)).toThrow(/must be an enum/);
  });
});
