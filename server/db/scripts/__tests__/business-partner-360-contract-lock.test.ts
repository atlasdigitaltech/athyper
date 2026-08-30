import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("BS360-00 locks the permission catalog and DDL manifest", () => {
  const seed = read("ddl/planes/neon/authz/22_business_partner_360_permission_reference_seed.sql");
  const manifest = read("ddl/planes/neon/_manifest.txt");
  const codes = [...seed.matchAll(/'((?:neon\.)[^']+)'/g)].map(match => match[1]!).filter(code => code.startsWith("neon.relationship.business_partner_"));
  const declared = new Set(codes.filter(code => !code.endsWith("person.read") && !code.endsWith("person_sensitive.read") && !code.endsWith("workforce.read")));
  for (const code of codes) assert.equal(code.split(".").length, 4, code);
  assert.match(seed, /seed-expected-row-count: exact:17/);
  assert.match(seed, /business_partner_tax\.reveal','high',true,false/);
  assert.match(seed, /business_partner_bank\.reveal','high',true,false/);
  assert.match(seed, /business_partner_person_sensitive\.read','high',true,false/);
  assert.ok(declared.size >= 14);
  assert.match(manifest, /^planes\/neon\/authz\/22_business_partner_360_permission_reference_seed\.sql$/m);
});

test("BS360-00 stages a v1 STUDIO descriptor and removes the legacy risk-band presentation", () => {
  const definition = read("../packages/services/publication/src/business-partner-foundation-definition.ts");
  const legacyUi = read("../../packages/planes/neon/business-partner/src/index.tsx");
  assert.match(definition, /neonPartner360:\{version:"1\.0\.0",schemaVersion:1/);
  assert.match(definition, /excludedCapabilities:\["risk"\]/);
  assert.doesNotMatch(legacyUi, /\["Risk band"/);
});
