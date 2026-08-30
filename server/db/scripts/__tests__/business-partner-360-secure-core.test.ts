import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(path:string)=>readFile(resolve(root,path),"utf8");

test("BS360-02 keeps summary reads bounded, masked, tenant-bound, and owner-aware",async()=>{
  const repository=await read("packages/services/master-data/src/kysely-business-partner-360-repository.ts");
  assert.match(repository,/tenant_id=\$\{input\.tenantId\}::uuid/);
  assert.match(repository,/operating_organization_company_assignment/);
  assert.match(repository,/company\.legal_entity_id=\$\{input\.legalEntityId/);
  assert.match(repository,/link\.owner_type_id=\$\{contactOwnerType\}::uuid/);
  assert.match(repository,/metadata->>'maskedValue'/);
  assert.doesNotMatch(repository,/SELECT[^`]*(?:identifier_value|registration_number|protected_value)/i);
  assert.match(repository,/LIMIT 5/);
});

test("BS360-02 wires safe routes, compatibility, and an explicit relay allowlist",async()=>{
  const [routes,legacy,relay,host]=await Promise.all([
    read("packages/services/master-data/src/business-partner-360-routes.ts"),
    read("packages/services/master-data/src/business-partner-request-routes.ts"),
    read("../packages/platform/gateway/bff-relay/src/index.ts"),
    read("apps/platform-host/src/composition/register-services.ts"),
  ]);
  assert.match(routes,/\/360\/summary/); assert.match(routes,/private, no-store/);
  assert.match(legacy,/aggregate360\?\.legacyAggregate/);
  assert.match(relay,/BUSINESS_PARTNER_360_SUMMARY_OPERATION/);
  for(const route of["identity","contacts","addresses","identifiers","roles","company-configuration","banking","qualifications","certificates","credit","workforce","requests","activity","business-activity","network"])assert.match(relay,new RegExp(`(?:\"${route}\"|\\b${route}\\b)`));
  assert.match(host,/registerBusinessPartner360Routes/); assert.match(host,/createPermissionAuthorizer/);
});

test("BS360-02 ships a dark manifest-driven shell with deterministic cancellation-safe state",async()=>{
  const [shell,client,navigation,entry,page]=await Promise.all([
    read("../packages/planes/neon/business-partner/src/360/business-partner-360.tsx"),
    read("../packages/planes/neon/business-partner/src/360/business-partner-360-client.ts"),
    read("../packages/planes/neon/business-partner/src/360/components/section-navigation.tsx"),
    read("../packages/planes/neon/business-partner/src/index.tsx"),
    read("../apps/neon/app/(shell)/mdg/business-partner/[recordId]/page.tsx"),
  ]);
  assert.match(shell,/AbortController/); assert.match(shell,/popstate/); assert.match(shell,/pushState/); assert.match(shell,/replaceState/);
  for(const coordinate of["section","roleLens","operatingOrganizationId","companyCodeId","legalEntityId","asOf"])assert.match(shell,new RegExp(coordinate));
  assert.match(client,/authEpoch/); assert.match(client,/75\*1024/); assert.match(client,/bootstrap contains a restricted field/);
  assert.match(navigation,/summary\.sections\.map/);
  assert.match(entry,/useFeature\("neon\.business_partner\.view_360"\)/);
  assert.match(page,/BusinessPartnerRecord/);
});
