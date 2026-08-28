import assert from "node:assert/strict";
import test from "node:test";

import { buildDevelopmentBusinessPartnerFixtures } from "../provision-development-business-partner-fixtures.js";

test("development business-partner fixtures are deterministic and tenant isolated", () => {
  const first = buildDevelopmentBusinessPartnerFixtures();
  const second = buildDevelopmentBusinessPartnerFixtures();
  assert.deepEqual(first, second);
  assert.equal(first.partners.length, 71);
  assert.equal(new Set(first.partners.map((item) => item.id)).size, first.partners.length);
  assert.equal(new Set(first.partners.map((item) => `${item.tenantCode}:${item.code}`)).size, first.partners.length);
  assert.deepEqual(first.expectations.map((item) => [item.tenantCode, item.organizationCode, item.codes.length]), [
    ["cirrusatlantic", "catl.operations", 30],
    ["athyper", "athyper.procurement.apac", 20],
    ["athyper", "athyper.procurement.emea", 20],
    ["athyper", "athyper.people.apac", 0],
    ["athyper", "athyper.finance.apac", 0],
  ]);
  assert(first.partners.filter((item) => item.code.endsWith("HIDDEN")).every((item) => item.assignments.length === 0));
  assert(first.partners.every((item) => item.code.startsWith(item.tenantCode === "athyper" ? "ATH-" : "CATL-")));
});
