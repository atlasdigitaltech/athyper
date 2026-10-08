import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityListCalendarDescriptor } from "@athyper/server-contract-metadata";
import { LIST_CALENDAR_DATE_FIELD_UNAVAILABLE, resolveListCalendar } from "./list-calendar.js";

const listField = (key: string, valueKind: ListFieldDescriptorV1["valueKind"], options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key, label: key === "starts_on" ? "Starts on" : key, valueKind, defaultVisible: true, defaultOrder: 0,
  filterOperators: ["eq", "ne", "in", "gt", "gte", "lt", "lte", "between", "relative", "is_null", "is_not_null"], sortable: true, groupable: false, aggregations: [], ...options,
});
const entityField = (key: string, type: EntityFieldDescriptor["type"], required: boolean): EntityFieldDescriptor => ({ key, storagePath: key, type, required, writableOn: [] });
const calendar: EntityListCalendarDescriptor = {
  defaultView: "month",
  dateFields: [{ start: "starts_on", end: "ends_on", tone: { field: "stage", choices: [{ value: "open", label: "Open", tone: "warning" }] } }],
};
const fields = [listField("starts_on", "date"), listField("ends_on", "date"), listField("stage", "enum")];
const entityFields = [entityField("starts_on", "date", false), entityField("ends_on", "date", false), entityField("stage", "enum", true)];
const resolve = (overrides: Partial<Parameters<typeof resolveListCalendar>[0]> = {}) =>
  resolveListCalendar({ calendar, fields, entityFields, masked: () => false, ...overrides });

describe("per-viewer calendar resolution", () => {
  it("offers a usable date field with its kind, tray flag and tone", () => {
    expect(resolve()).toEqual({ calendar: { defaultView: "month", dateFields: [{
      start: "starts_on", end: "ends_on", label: "Starts on", kind: "date", unscheduled: true,
      tone: { field: "stage", tones: { open: "warning" } },
    }] } });
  });

  it("degrades an unreadable tone field to neutral instead of hiding the calendar", () => {
    const result = resolve({ masked: (key) => key === "stage" });
    expect("calendar" in result && result.calendar.dateFields[0]?.tone).toBeUndefined();
  });

  it.each([
    ["the start field is masked", { masked: (key: string) => key === "starts_on" }],
    ["the start field is not sortable", { fields: [listField("starts_on", "date", { sortable: false }), fields[1]!, fields[2]!] }],
    ["the start field lacks lt", { fields: [listField("starts_on", "date", { filterOperators: ["gte", "is_null"] }), fields[1]!, fields[2]!] }],
    ["a nullable end lacks is_not_null", { fields: [fields[0]!, listField("ends_on", "date", { filterOperators: ["gte", "is_null"] }), fields[2]!] }],
    ["the end field is masked", { masked: (key: string) => key === "ends_on" }],
  ])("is unavailable when %s", (_, overrides) => {
    expect(resolve(overrides)).toEqual({ unavailable: LIST_CALENDAR_DATE_FIELD_UNAVAILABLE });
  });

  it("requires no count mode", () => {
    expect("calendar" in resolve()).toBe(true);
  });
});
