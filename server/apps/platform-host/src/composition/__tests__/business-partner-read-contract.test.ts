import { expect, it } from "vitest";
import { businessPartnerReadScope } from "../entities/business-partner-read-contract.js";

it("validates BP lens vocabulary at the domain boundary", () => {
  for (const roleLens of ["all", "supplier", "customer"])
    expect(businessPartnerReadScope({roleLens})).toEqual({roleLens});
  expect(businessPartnerReadScope()).toEqual({});
  expect(() => businessPartnerReadScope({roleLens: "publisher"})).toThrow("Unsupported Business Partner role lens");
});
