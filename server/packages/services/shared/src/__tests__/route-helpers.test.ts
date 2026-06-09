import { describe, expect, it } from "vitest";
import { serializeJsonFields } from "../../route-helpers.js";

describe("serializeJsonFields", () => {
  it("serializes JS arrays for json/jsonb columns", () => {
    const data: Record<string, unknown> = {
      tags: ["ksa", "ict"],
      aliases: ["Al Madar"],
    };

    serializeJsonFields(data, new Map([["tags", "jsonb"]]));

    expect(data.tags).toBe("[\"ksa\",\"ict\"]");
    expect(data.aliases).toEqual(["Al Madar"]);
  });

  it("serializes objects and preserves nullish values", () => {
    const data: Record<string, unknown> = {
      metadata: { source: "erp" },
      optional: null,
      omitted: undefined,
    };

    serializeJsonFields(data, new Map([
      ["metadata", "jsonb"],
      ["optional", "jsonb"],
      ["omitted", "jsonb"],
    ]));

    expect(data.metadata).toBe("{\"source\":\"erp\"}");
    expect(data.optional).toBeNull();
    expect(data.omitted).toBeUndefined();
  });

  it("normalizes JSON strings and wraps plain strings as JSON scalars", () => {
    const data: Record<string, unknown> = {
      metadata: " { \"source\": \"erp\" } ",
      label: "preferred",
    };

    serializeJsonFields(data, new Map([
      ["metadata", "jsonb"],
      ["label", "jsonb"],
    ]));

    expect(data.metadata).toBe("{\"source\":\"erp\"}");
    expect(data.label).toBe("\"preferred\"");
  });
});
