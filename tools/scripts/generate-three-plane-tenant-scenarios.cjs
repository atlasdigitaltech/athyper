#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const scenarioRoot = path.join(repoRoot, "server", "db", "seed", "packs", "tenant-scenarios-v1", "neon");
const checkOnly = process.argv.includes("--check");
const readinessProfile = "finance_baseline_v1";

const athyperRegions = {
  "ORG-1000000001": "emea", "ORG-1000000002": "apac", "ORG-1000000003": "emea",
  "ORG-1000000004": "emea", "ORG-1000000005": "emea", "ORG-1000000006": "emea",
  "ORG-1000000007": "emea", "ORG-1000000008": "americas", "ORG-1000000009": "apac",
  "ORG-1000000010": "apac", "ORG-1000000011": "americas", "ORG-1000000012": "emea",
  "ORG-1000000013": "apac", "ORG-1000000014": "emea", "ORG-1000000015": "emea",
  "ORG-1000000016": "apac", "ORG-1000000017": "apac",
};
const technostatRegions = {
  "ORG-1000000018": "middle_east", "ORG-1000000019": "middle_east",
  "ORG-1000000020": "north_africa", "ORG-1000000021": "north_africa",
};

function company(company, purpose = "statutory") {
  return { ...company, companyPurpose: purpose, readinessProfile };
}

function assignments(organizations, companies) {
  return organizations.flatMap((organization) => companies.map((companyCode, index) => ({
    organizationCode: organization,
    companyCode,
    participationRole: index === 0 ? "lead" : "participant",
  })));
}

function normalizeCirrus(pack) {
  return {
    ...pack,
    packVersion: "2.0.0",
    legalEntities: pack.legalEntities.map((entity) => ({ ...entity, regionCode: "uk" })),
    companyCodes: pack.companyCodes.filter((entry) => !entry.code.endsWith(".ops")).map((entry) => company(entry)),
  };
}

function normalizeTechnostat(pack) {
  const companyCodes = pack.companyCodes.filter((entry) => !entry.code.endsWith(".ops")).map((entry) => company(entry));
  const organizations = [
    { code: "tech.procurement", name: "Technostat Shared Procurement", domain: "procurement" },
    { code: "tech.finance", name: "Technostat Shared Finance", domain: "finance" },
    { code: "tech.people", name: "Technostat Shared People", domain: "people" },
  ];
  return {
    ...pack,
    packVersion: "2.0.0",
    legalEntities: pack.legalEntities.map((entity) => ({ ...entity, regionCode: technostatRegions[entity.scopeKey] })),
    companyCodes,
    operatingOrganizations: organizations,
    operatingOrganizationCompanyAssignments: assignments(
      organizations.map((entry) => entry.code),
      companyCodes.map((entry) => entry.code),
    ),
  };
}

function normalizeAthyper(pack) {
  const primary = pack.companyCodes.filter((entry) => !entry.code.endsWith(".ops")).map((entry) => company(entry));
  const operational = primary.map((entry) => company({
    ...entry,
    code: `${entry.code}.ops`,
    name: `${entry.name} Operations`,
  }, "operations"));
  const organizations = [
    { code: "athyper.shared-services", name: "Athyper Shared Services", domain: "shared_services" },
    ...["procurement", "finance", "people"].flatMap((domain) =>
      ["apac", "emea", "americas"].map((regionCode) => ({
        code: `athyper.${domain}.${regionCode}`,
        name: `Athyper ${regionCode.toUpperCase()} ${domain[0].toUpperCase()}${domain.slice(1)}`,
        domain,
        regionCode,
        parentCode: "athyper.shared-services",
      }))),
  ];
  const companyRegions = new Map(primary.map((entry) => [entry.code, athyperRegions[entry.legalEntityScopeKey]]));
  const allCompanies = [...primary, ...operational];
  const organizationAssignments = [];
  for (const domain of ["procurement", "finance", "people"]) {
    for (const region of ["apac", "emea", "americas"]) {
      const regionCompanies = allCompanies.filter((entry) => companyRegions.get(entry.code.replace(/\.ops$/, "")) === region);
      organizationAssignments.push(...assignments([`athyper.${domain}.${region}`], regionCompanies.map((entry) => entry.code)));
    }
  }
  return {
    ...pack,
    packVersion: "2.0.0",
    legalEntities: pack.legalEntities.map((entity) => ({ ...entity, regionCode: athyperRegions[entity.scopeKey] })),
    companyCodes: allCompanies,
    operatingOrganizations: organizations,
    operatingOrganizationCompanyAssignments: organizationAssignments,
  };
}

const normalizers = { athyper: normalizeAthyper, technostat: normalizeTechnostat, cirrusatlantic: normalizeCirrus };
let stale = false;
for (const [tenant, normalize] of Object.entries(normalizers)) {
  const filePath = path.join(scenarioRoot, `${tenant}.v1.json`);
  const source = fs.readFileSync(filePath, "utf8");
  const output = `${JSON.stringify(normalize(JSON.parse(source)), null, 2)}\n`;
  if (source === output) continue;
  stale = true;
  if (!checkOnly) fs.writeFileSync(filePath, output);
}
if (checkOnly && stale) {
  console.error("Tenant scenario packs are stale. Run: pnpm iam:scenarios:generate");
  process.exit(1);
}
console.log(checkOnly ? "Tenant scenario packs are current." : "Generated three-plane tenant scenario packs.");
