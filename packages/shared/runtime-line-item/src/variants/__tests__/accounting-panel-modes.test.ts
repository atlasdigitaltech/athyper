import { describe, expect, it } from "vitest";
import { PROCURE_PANELS } from "../procure-panels";
import { SALES_PANELS } from "../sales-panels";

describe("existing-line accounting ownership", () => {
  it.each([
    ["procure", PROCURE_PANELS],
    ["sales", SALES_PANELS],
  ] as const)("keeps %s accounting in create mode only", (_variant, panels) => {
    const accounting = panels.find((panel) => panel.key === "accounting");
    expect(accounting?.modes).toEqual(["compose"]);
    expect(accounting?.modes).not.toContain("view");
    expect(accounting?.modes).not.toContain("edit");
  });
});
