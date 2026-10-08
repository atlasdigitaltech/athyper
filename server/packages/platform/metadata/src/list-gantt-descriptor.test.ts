import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import {
  parsePublishedListGantt,
  validatePublishedListGantt,
} from "./list-gantt-descriptor.js";

const field = (
  key: string,
  type: EntityFieldDescriptor["type"],
): EntityFieldDescriptor => ({
  key,
  storagePath: key,
  type,
  required: false,
  writableOn: [],
});
const fields = new Map([
  ["from", field("from", "date")],
  ["to", field("to", "date")],
  ["phase", field("phase", "enum")],
  ["done", field("done", "integer")],
  ["name", field("name", "string")],
]);

describe("published list Gantt", () => {
  it("parses date ranges, group, progress and the default zoom", () => {
    const gantt = parsePublishedListGantt({
      defaultZoom: "quarter",
      dateFields: [{ start: "from", end: "to" }],
      group: { field: "phase" },
      progress: { field: "done" },
    });
    expect(gantt).toMatchObject({
      defaultZoom: "quarter",
      group: { field: "phase" },
      progress: { field: "done" },
    });
    expect(() =>
      validatePublishedListGantt(
        { gantt, supportedModes: ["table", "gantt"] },
        fields,
      ),
    ).not.toThrow();
  });

  it("rejects a zoom this release cannot render and unknown properties", () => {
    expect(() =>
      parsePublishedListGantt({
        defaultZoom: "week",
        dateFields: [{ start: "from" }],
      }),
    ).toThrow("listPresentation.gantt.defaultZoom must be a renderable zoom");
    expect(() =>
      parsePublishedListGantt({
        defaultZoom: "month",
        dateFields: [{ start: "from" }],
        dependencies: [],
      }),
    ).toThrow(/not a published Gantt property/);
  });

  it("checks Gantt mode, group and progress kinds against the entity", () => {
    const gantt = parsePublishedListGantt({
      defaultZoom: "year",
      dateFields: [{ start: "from" }],
      group: { field: "name" },
    });
    expect(() =>
      validatePublishedListGantt({ gantt, supportedModes: ["gantt"] }, fields),
    ).toThrow(/group field must be an enum/);
    const progress = parsePublishedListGantt({
      defaultZoom: "year",
      dateFields: [{ start: "from" }],
      progress: { field: "name" },
    });
    expect(() =>
      validatePublishedListGantt(
        { gantt: progress, supportedModes: ["gantt"] },
        fields,
      ),
    ).toThrow(/integer or decimal/);
    expect(() =>
      validatePublishedListGantt(
        { gantt: progress, supportedModes: ["table"] },
        fields,
      ),
    ).toThrow(/exactly when Gantt/);
  });

  it("allows the same field in Calendar and Gantt declarations", () => {
    const gantt = parsePublishedListGantt({
      defaultZoom: "month",
      dateFields: [{ start: "from", end: "to" }],
    });
    expect(() =>
      validatePublishedListGantt(
        { gantt, supportedModes: ["calendar", "gantt"] },
        fields,
      ),
    ).not.toThrow();
  });
});
