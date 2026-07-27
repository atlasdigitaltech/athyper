import { describe, expect, it } from "vitest";

import { resolveSingleContextActivation } from "./context-select-client";
import { soleAutoSelectableCandidate } from "./login-gate-client";
import type { OrgEntry } from "./org";

function context(alias: string, workbenches: string[]): OrgEntry {
  return {
    alias,
    name: alias,
    workbenches,
    tenant: "tenant",
    entity: alias,
    entityName: alias,
  };
}

describe("single-context activation", () => {
  it.each([
    ["Neon organization", "tenant--legal-entity", "user"],
    ["Admin organization", "tenant--admin", "admin"],
    ["Mesh buyer account", "tenant--buyer", "user"],
    ["Mesh supplier account", "tenant--partner", "partner"],
  ])("auto-activates one valid %s", (_label, alias, workbench) => {
    const org = context(alias, [workbench]);

    expect(resolveSingleContextActivation([org])).toEqual({ org, workbench });
  });

  it("does not auto-activate when buyer and supplier accounts are both valid", () => {
    const buyer = context("tenant--buyer", ["user"]);
    const supplier = context("tenant--partner", ["partner"]);

    expect(resolveSingleContextActivation([buyer, supplier])).toBeNull();
  });

  it("does not auto-activate one organization with multiple valid workbenches", () => {
    expect(resolveSingleContextActivation([
      context("tenant--dual-role", ["user", "partner"]),
    ])).toBeNull();
  });

  it("does not auto-activate when no valid context exists", () => {
    expect(resolveSingleContextActivation([])).toBeNull();
  });
});

describe("single discovery candidate", () => {
  it("auto-selects the only candidate during normal sign-in", () => {
    const candidate = { id: "buyer" };
    expect(soleAutoSelectableCandidate([candidate])).toBe(candidate);
  });

  it("does not auto-select when several candidates are valid", () => {
    expect(soleAutoSelectableCandidate([{ id: "buyer" }, { id: "supplier" }])).toBeNull();
  });

  it("auto-selects a sole candidate after a change-user sign-in", () => {
    const candidate = { id: "admin" };
    expect(soleAutoSelectableCandidate([candidate])).toBe(candidate);
  });
});
