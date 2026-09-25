import { describe, expect, it } from "vitest";
import { stringArray } from "./string-array.js";

describe("database string arrays", () => {
  it("handles native and JSON-encoded values identically", () => {
    expect(stringArray(["one", null, 2, "two"])).toEqual(["one", "two"]);
    expect(stringArray('["one",null,2,"two"]')).toEqual(["one", "two"]);
  });
  it.each([undefined, null, "invalid json", '"scalar"', '{}', 0])("rejects non-arrays: %s", value => {
    expect(stringArray(value)).toEqual([]);
  });
});
