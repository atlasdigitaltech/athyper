import assert from "node:assert/strict";
import test from "node:test";

import { buildDevelopmentBusinessPartnerFixtures } from "../../provisioning/provision-development-business-partner-fixtures.js";

test("development business-partner fixtures are deterministic and tenant isolated", () => {
  const first = buildDevelopmentBusinessPartnerFixtures();
  const second = buildDevelopmentBusinessPartnerFixtures();
  assert.deepEqual(first, second);
  assert.equal(first.partners.length, 73);
  assert.equal(
    new Set(first.partners.map((item) => item.id)).size,
    first.partners.length,
  );
  assert.equal(
    new Set(first.partners.map((item) => `${item.tenantCode}:${item.code}`))
      .size,
    first.partners.length,
  );
  assert.deepEqual(
    first.expectations.map((item) => [
      item.tenantCode,
      item.organizationCode,
      item.codes.length,
    ]),
    [
      ["cirrusatlantic", "catl.operations", 31],
      ["athyper", "athyper.procurement.apac", 20],
      ["athyper", "athyper.procurement.emea", 21],
      ["athyper", "athyper.people.apac", 0],
      ["athyper", "athyper.finance.apac", 0],
    ],
  );
  assert(
    first.partners
      .filter((item) => item.code.endsWith("HIDDEN"))
      .every((item) => item.assignments.length === 0),
  );
  assert(
    first.partners.every((item) =>
      item.code.startsWith(item.tenantCode === "athyper" ? "ATH-" : "CATL-"),
    ),
  );
});

test("country profiles cover both Saudi fixtures and generate isolated synthetic details", async () => {
  const { buildDevelopmentBusinessPartnerProfile } =
    await import("../../provisioning/development-business-partner-profiles.js");
  const { partners } = buildDevelopmentBusinessPartnerFixtures();
  const profiles = partners.map(buildDevelopmentBusinessPartnerProfile);
  assert.deepEqual(
    new Set(partners.map((p) => p.countryCode)),
    new Set(["SA", "MY", "SG", "DE", "GB"]),
  );
  assert.deepEqual(
    partners
      .filter((p) => p.countryCode === "SA")
      .map((p) => p.tenantCode)
      .sort(),
    ["athyper", "cirrusatlantic"],
  );
  assert.equal(
    new Set(profiles.map((p) => p.accountNumber)).size,
    partners.length,
  );
  assert.equal(
    new Set(profiles.map((p) => p.registrationNumber)).size,
    partners.length,
  );
  assert.equal(new Set(profiles.map((p) => p.taxNumber)).size, partners.length);
  for (const [index, profile] of profiles.entries()) {
    const fixture = partners[index]!;
    assert.deepEqual(profile, buildDevelopmentBusinessPartnerProfile(fixture));
    assert.match(profile.website, /^https:\/\/[^/]+\.example\.test$/);
    assert.equal(profile.accountLast4, profile.accountNumber.slice(-4));
    assert.ok(profile.formattedAddress.includes(profile.countryName));
    if (profile.accountType === "iban") {
      assert.equal(profile.accountNumber.slice(0, 2), fixture.countryCode);
      assert.equal(
        profile.accountNumber.length,
        fixture.countryCode === "SA" ? 24 : 22,
      );
      const rotated =
        profile.accountNumber.slice(4) + profile.accountNumber.slice(0, 4);
      assert.equal(
        BigInt(rotated.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))) %
          97n,
        1n,
      );
    }
    if (fixture.countryCode === "SA") {
      assert.equal(profile.currency, "SAR");
      assert.equal(profile.jurisdictionCode, "SA-ZATCA");
      assert.equal(profile.taxType, "vat");
      assert.match(profile.phone, /^\+966/);
    }
  }
  assert.throws(
    () =>
      buildDevelopmentBusinessPartnerProfile({
        ...partners[0]!,
        countryCode: "XX",
      }),
    /Unsupported/,
  );
});

test("fixture names keep legal names separate from trading and search aliases", () => {
  const { partners } = buildDevelopmentBusinessPartnerFixtures();
  const northwind = partners.find(item => item.code === "CATL-BP-001")!;
  assert.equal(northwind.name, "Northwind Industrial Supplies Ltd");
  assert.deepEqual(northwind.aliases, ["Northwind Industrial Supplies", "Northwind Supplies"]);
  const generated = partners.find(item => item.code === "CATL-BP-003")!;
  assert.equal(generated.name, "Alder Engineering Limited");
  assert.deepEqual(generated.aliases, ["Alder Engineering", "Alder Engineering"]);
});
