import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type {
  EntityFieldDescriptor,
  EntityListGanttDescriptor,
} from "@athyper/server-contract-metadata";
import {
  LIST_GANTT_DATE_FIELD_UNAVAILABLE,
  resolveListGantt,
} from "./list-gantt.js";

const listField = (
  key: string,
  valueKind: ListFieldDescriptorV1["valueKind"],
  options: Partial<ListFieldDescriptorV1> = {},
): ListFieldDescriptorV1 => ({
  key,
  label: key === "starts_on" ? "Starts on" : key,
  valueKind,
  defaultVisible: true,
  defaultOrder: 0,
  filterOperators: [
    "eq",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "is_null",
    "is_not_null",
  ],
  sortable: true,
  groupable: false,
  aggregations: [],
  ...options,
});
const entityField = (
  key: string,
  type: EntityFieldDescriptor["type"],
  required: boolean,
): EntityFieldDescriptor => ({
  key,
  storagePath: key,
  type,
  required,
  writableOn: [],
});
const gantt: EntityListGanttDescriptor = {
  defaultZoom: "quarter",
  dateFields: [{ start: "starts_on", end: "ends_on" }],
  group: { field: "phase" },
  progress: { field: "done" },
};
const fields = [
  listField("starts_on", "date"),
  listField("ends_on", "date"),
  listField("phase", "enum", {
    groupable: true,
    filterOptions: [
      { value: "plan", label: "Plan" },
      { value: "build", label: "Build" },
    ],
    statusTones: { build: "warning" },
  }),
  listField("done", "decimal"),
];
const entityFields = [
  entityField("starts_on", "date", false),
  entityField("ends_on", "date", true),
  entityField("phase", "enum", false),
  entityField("done", "decimal", false),
];
const resolve = (
  overrides: Partial<Parameters<typeof resolveListGantt>[0]> = {},
) =>
  resolveListGantt({
    gantt,
    fields,
    entityFields,
    masked: () => false,
    ...overrides,
  });

describe("per-viewer Gantt resolution", () => {
  it("offers date ranges, the group with its authorized choices in order, and progress", () => {
    expect(resolve()).toEqual({
      gantt: {
        defaultZoom: "quarter",
        dateFields: [
          {
            start: "starts_on",
            end: "ends_on",
            endNullable: false,
            label: "Starts on",
            kind: "date",
            unscheduled: true,
          },
        ],
        group: {
          field: "phase",
          label: "phase",
          choices: [
            { value: "plan", label: "Plan" },
            { value: "build", label: "Build", tone: "warning" },
          ],
        },
        progress: { field: "done", label: "done" },
      },
    });
  });

  it("is unavailable when no date range is usable", () => {
    expect(resolve({ masked: (key) => key === "starts_on" })).toEqual({
      unavailable: LIST_GANTT_DATE_FIELD_UNAVAILABLE,
    });
  });

  it.each([
    ["masked", { masked: (key: string) => key === "phase" }],
    [
      "not groupable",
      {
        fields: fields.map((field) =>
          field.key === "phase" ? { ...field, groupable: false } : field,
        ),
      },
    ],
    [
      "without its choice projection",
      {
        fields: fields.map((field) =>
          field.key === "phase"
            ? { ...field, filterOptions: undefined }
            : field,
        ),
      },
    ],
  ])("omits a group field that is %s, keeping the Gantt", (_, overrides) => {
    const result = resolve(overrides);
    expect("gantt" in result && result.gantt.group).toBeUndefined();
    expect("gantt" in result && result.gantt.progress).toBeDefined();
  });

  it("omits a masked progress field and needs no count mode", () => {
    const result = resolve({ masked: (key) => key === "done" });
    expect("gantt" in result && result.gantt.progress).toBeUndefined();
  });
});
