import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("BS360-02 keeps summary reads bounded, masked, tenant-bound, and owner-aware", async () => {
  const repository = await read(
    "packages/services/master-data/src/business-partner/record/repository.ts",
  );
  assert.match(repository, /tenant_id=\$\{input\.tenantId\}::uuid/);
  assert.match(repository, /operating_organization_company_assignment/);
  assert.match(repository, /company\.legal_entity_id=\$\{input\.legalEntityId/);
  assert.match(repository, /link\.owner_type_id=\$\{contactOwnerType\}::uuid/);
  assert.match(repository, /metadata->>'maskedValue'/);
  assert.doesNotMatch(
    repository,
    /SELECT[^`]*(?:identifier_value|registration_number|protected_value)/i,
  );
  assert.match(repository, /LIMIT 5/);
});

test("BS360-02 routes records to the shared runtime with cancellation-safe state", async () => {
  const [shell, client, entry, page, resource, url, location] = await Promise.all([
    read(
      "../packages/platform/entity/runtime/form-detail/src/record/entity-record-page.tsx",
    ),
    read(
      "../packages/planes/neon/entity-extensions/src/business-partner/clients/business-partner-360-client.ts",
    ),
    read("../apps/neon/lib/entity-record-adapters.tsx"),
    read("../apps/neon/app/(shell)/mdg/business-partner/[recordId]/page.tsx"),
    read("../packages/platform/entity/runtime/form-detail/src/use-section-resource.ts"),
    read("../packages/platform/entity/runtime/form-detail/src/record/record-url-state.ts"),
    read("../packages/platform/entity/runtime/form-detail/src/record/write-record-location.ts"),
  ]);
  assert.match(resource, /AbortController/);
  assert.match(shell, /popstate/);
  assert.match(location, /pushState/);
  assert.match(location, /replaceState/);
  for (const coordinate of [
    "section",
    "roleLens",
    "operatingOrganizationId",
    "companyCodeId",
    "legalEntityId",
    "asOf",
  ])
    assert.match(url, new RegExp(coordinate));
  assert.match(client, /authEpoch/);
  assert.match(client, /75\s*\*\s*1024/);
  assert.match(client, /bootstrap contains a restricted field/);
  assert.match(shell, /EntityRuntimeWorkspace/);
  assert.match(entry, /resolveEntityRecordAdapter/);
  assert.match(entry, /<EntityRecordPage/);
  assert.match(page, /redirectEntityRecord/);
  assert.doesNotMatch(entry + page, /BusinessPartner360Shell/);
});

test("BS360-00 locks the permission catalog and DDL manifest", async () => {
  const consolidated = await read(
    "db/ddl/planes/neon/authz/14_permission_reference_seed.sql",
  );
  const sectionStart = consolidated.indexOf("-- business_partner_360");
  const seed = consolidated.slice(
    sectionStart,
    consolidated.indexOf("-- workforce_request", sectionStart),
  );
  const manifest = await read("db/ddl/planes/neon/_manifest.txt");
  const codes = [...seed.matchAll(/'((?:neon\.)[^']+)'/g)]
    .map((match) => match[1]!)
    .filter((code) => code.startsWith("neon.relationship.business_partner_"));
  const declared = new Set(
    codes.filter(
      (code) =>
        !code.endsWith("person.read") &&
        !code.endsWith("person_sensitive.read") &&
        !code.endsWith("workforce.read"),
    ),
  );
  for (const code of codes) assert.equal(code.split(".").length, 4, code);
  assert.match(seed, /<> 17 THEN/);
  assert.match(seed, /Business Partner 360 permission count mismatch/);
  assert.match(seed, /business_partner_tax\.reveal','high',true,false/);
  assert.match(seed, /business_partner_bank\.reveal','high',true,false/);
  assert.match(
    seed,
    /business_partner_person_sensitive\.read','high',true,false/,
  );
  assert.ok(declared.size >= 14);
  assert.match(
    manifest,
    /^planes\/neon\/authz\/14_permission_reference_seed\.sql$/m,
  );
});

test("BS360-00 stages a v1 STUDIO descriptor and removes the legacy risk-band presentation", async () => {
  const definition = await read(
    "packages/services/publication/src/entity-foundation-definition.ts",
  );
  const legacyUi = await read(
    "../packages/planes/neon/business-partner/src/index.tsx",
  );
  assert.match(
    definition,
    /neonPartner360:\s*\{\s*version:\s*"1\.0\.0",\s*schemaVersion:\s*1/,
  );
  assert.match(definition, /excludedCapabilities:\s*\["risk"\]/);
  assert.doesNotMatch(legacyUi, /\["Risk band"/);
});
