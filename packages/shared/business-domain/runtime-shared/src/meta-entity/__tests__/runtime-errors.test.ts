import { describe, expect, it } from "vitest";
import { parseRuntimeWriteError } from "../runtime-errors";

describe("parseRuntimeWriteError", () => {
  it("normalizes string-array field errors", () => {
    const parsed = parseRuntimeWriteError({
      message: "Validation failed.",
      fieldErrors: {
        name: ["Name is required.", "Name must be unique."],
        status: "Status is invalid.",
      },
    }, 422);

    expect(parsed.kind).toBe("semantic_constraint");
    expect(parsed.message).toBe("Validation failed.");
    expect(parsed.fieldErrors).toEqual({
      name: "Name is required. Name must be unique.",
      status: "Status is invalid.",
    });
  });

  it("parses structured and top-level conflict payloads", () => {
    expect(parseRuntimeWriteError({
      message: "Record changed.",
      conflict: {
        versionField: "row_version",
        expected: "4",
        actual: "5",
        message: "Refresh required.",
      },
    }, 409).conflict).toEqual({
      versionField: "row_version",
      expected: "4",
      actual: "5",
      message: "Refresh required.",
    });

    expect(parseRuntimeWriteError({
      message: "Record changed.",
      version_field: "row_version",
      expected: "4",
      actual: "5",
    }, 409).conflict).toEqual({
      versionField: "row_version",
      expected: "4",
      actual: "5",
      message: "Record changed.",
    });
  });
});
