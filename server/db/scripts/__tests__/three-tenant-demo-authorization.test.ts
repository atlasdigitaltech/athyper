import assert from "node:assert/strict";
import test from "node:test";

import { buildThreeTenantDemoAuthorization, DEMO_PLANE_PERMISSIONS } from "../provision-three-tenant-demo-authorization.js";

test("builds explicit cross-plane demo scopes without member-company propagation", async () => {
  const model = await buildThreeTenantDemoAuthorization();
  assert.equal(model.studio.length, 4);
  assert.deepEqual(model.studio.map((grant) => grant.username).sort(), ["athq.admin", "athyper.admin", "catl.admin", "tksa.admin"]);
  assert.equal(model.studio.every((grant) => grant.scopes.length === 1 && grant.scopes[0]?.kind === "tenant"), true);
  assert.equal(model.studio.find((grant) => grant.username === "athq.admin")?.tenantCode, "athyper");
  assert.deepEqual(DEMO_PLANE_PERMISSIONS.studio, [
    "studio.platform.catalog.view",
    "studio.platform.catalog.manage",
    "studio.metadata.contract.view",
    "studio.metadata.contract.import",
  ]);

  const catlFinance = model.neon.find((grant) => grant.username === "catl.finance")!;
  assert.deepEqual(new Set(catlFinance.scopes.map((scope) => scope.kind)), new Set(["legal_entity", "company_code"]));
  const apacFinance = model.neon.find((grant) => grant.username === "athyper.apac.finance")!;
  assert.equal(apacFinance.scopes.filter((scope) => scope.kind === "operating_organization").length, 1);
  assert.equal(apacFinance.scopes.filter((scope) => scope.kind === "company_code").length, 12);
  assert.equal(apacFinance.scopes.filter((scope) => scope.kind === "legal_entity").length, 6);
  const techProcurement = model.neon.find((grant) => grant.username === "tech.procurement")!;
  assert.equal(techProcurement.scopes.filter((scope) => scope.kind === "company_code").length, 4);

  const catlAdminMesh = model.mesh.find((grant) => grant.username === "catl.admin")!;
  assert.deepEqual(catlAdminMesh.scopes.map((scope) => scope.key).sort(), ["bna-1000000022", "sna-1000000022"]);
  assert.deepEqual(DEMO_PLANE_PERMISSIONS.mesh, [
    "mesh.catalog.network_account.read",
    "mesh.catalog.network_relationship.read",
    "mesh.catalog.network_relationship.request",
  ]);
  assert.equal(Object.values(model).flatMap((grants) => grants).flatMap((grant) => grant.scopes)
    .some((scope) => scope.propagation === ("member_companies" as string)), false);
});
