import { describe, expect, it } from "vitest";

import { tenantIdsFromOrganizationAliases } from "../identity-admission.repository.js";

describe("tenantIdsFromOrganizationAliases", () => {
  it("accepts only canonical tenant UUID aliases and de-duplicates them", () => {
    expect(tenantIdsFromOrganizationAliases([
      "0194f4be-8f65-7c42-9a7a-f38dd09b8d91",
      "0194F4BE-8F65-7C42-9A7A-F38DD09B8D91",
      "tenant--company",
      "ORG-001",
    ])).toEqual(["0194f4be-8f65-7c42-9a7a-f38dd09b8d91"]);
  });
});
