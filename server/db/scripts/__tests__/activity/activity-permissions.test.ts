import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ACTIVITY_PERMISSION_CATALOG } from "@athyper/server-contract-publication";
import { buildCanonicalCatalogV2 } from "../../seed/canonical-catalog-v2-model.js";
import { buildExactScopeCompatibility } from "../../seed/exact-scope-compatibility-model.js";
const permissions=Object.entries(ACTIVITY_PERMISSION_CATALOG).map(([canonicalCode,definition])=>({canonicalCode,permissionKind:"capability",riskTier:definition.riskTier,requiresMfa:false}));
for(const plane of ["studio","neon","mesh"] as const) test(`exact Activity catalog and tenant scope on ${plane}`,()=>{
  const {catalog}=buildCanonicalCatalogV2({plane,permissions});
  const ddl=readFileSync(new URL("../../../ddl/common/authz/19_common_activity_permissions.sql",import.meta.url),"utf8");
  for(const p of catalog.permissions) {assert.equal(p.product,"common");assert.ok(ddl.includes(p.permissionId));}
  const scope=buildExactScopeCompatibility({plane,permissionCodes:permissions.map(p=>p.canonicalCode)});
  for(const p of scope.permissions) assert.deepEqual(p.scopes,[{kind:"tenant",propagation:"exact"}]);
  assert.throws(()=>buildExactScopeCompatibility({plane,permissionCodes:permissions.map(p=>p.canonicalCode),requiredScopesByPermission:{"common.audit.event.query":[{kind:"resource",propagation:"exact"}]}}));
  for(const canonicalCode of ["audit.event.query","records.snapshot.read","common.records.snapshot.delete","common.audit.event.export"])
    assert.throws(()=>buildCanonicalCatalogV2({plane,permissions:[{...permissions[0]!,canonicalCode}]}));
  assert.throws(()=>buildCanonicalCatalogV2({plane,permissions:[{...permissions[2]!,riskTier:"low"}]}));
});
