import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPrerequisites, assessmentExitCode, routes } from "./master-data-prerequisites.mjs";

test("inventories all six routes without treating proposed catalog entries as released authority", () => {
  const report=assessPrerequisites();
  assert.equal(report.routes.length,6);
  assert.deepEqual(new Set(report.routes.flatMap(r=>r.permissions)),new Set(["master.contact.pii.write","master.address.pii.write","master.contact.verify","master.profile.read","master.contact.pii.read","master.address.pii.read"]));
  assert.equal(report.productionQualified,false);
  assert.equal(report.phase1Complete,false);
  assert.ok(report.blockers.some(b=>b.code==="RELEASED_AUTHORITY_NOT_QUALIFIED"));
  assert.ok(!report.blockers.some(b=>b.code==="ROUTE_INVENTORY_DRIFT" || b.code==="ROUTE_PERMISSION_INVENTORY_DRIFT"));
  assert.ok(report.inputs.every(i=>/^[a-f0-9]{64}$/.test(i.sha256)));
  assert.ok(report.neonTableCoverage.some(t=>t.reviewStatus==="pending_review"));
  assert.equal(assessmentExitCode(report,true),1);
  assert.equal(assessmentExitCode(report,false),0);
});
test("confirmed launch choices do not qualify grants, live schema, or scope resolution", () => {
  const report=assessPrerequisites({scope:{schema:"athyper.master-data.launch-scope.v1",decisionStatus:"confirmed",environment:"staging",planes:["neon"],tenantIds:["11111111-1111-4111-8111-111111111111"],channels:["email"],provider:"test-provider",ownerTypes:["business_partner"],accountableOwners:{domain:"D",integration:"I",iam:"A",database:"B",release:"R"}}});
  assert.ok(!report.blockers.some(b=>b.code==="LAUNCH_DECISIONS_PENDING"));
  for(const code of ["RELEASED_AUTHORITY_NOT_QUALIFIED","LIVE_COMPATIBILITY_UNASSESSED","TRUSTED_OWNER_SCOPE_RESOLUTION_REQUIRED"]) assert.ok(report.blockers.some(b=>b.code===code));
  assert.equal(assessmentExitCode(report,true),1);
});
test("invalid or empty launch choices remain pending", () => {
  const report=assessPrerequisites({scope:{schema:"athyper.master-data.launch-scope.v1",decisionStatus:"confirmed",environment:"prod-ish",planes:["*"],tenantIds:["*"],channels:["anything"],provider:" ",ownerTypes:[],accountableOwners:{}}});
  const missing=report.blockers.find(b=>b.code==="LAUNCH_DECISIONS_PENDING");
  assert.ok(missing);
  for(const field of ["environment","planes","tenantIds","channels","provider","ownerTypes","accountableOwners.iam"]) assert.ok(missing.detail.includes(field));
  assert.equal(routes.some(r=>r.canonicalMapping),false);
});

test("accepted pilot scope keeps unselected provider, tenant IDs and owners pending", () => {
  const report=assessPrerequisites();
  assert.equal(report.launch.decisionStatus,"scope_confirmed");
  assert.equal(report.launch.environment,"staging");
  assert.deepEqual(report.launch.planes,["neon"]);
  assert.deepEqual(report.launch.ownerTypes,["business_partner"]);
  assert.deepEqual(report.launch.channels,["email"]);
  assert.equal(report.launch.pilot.dataPolicy,"synthetic_only");
  assert.equal(report.launch.pilot.deploymentAuthorized,false);
  const missing=report.blockers.find(b=>b.code==="LAUNCH_DECISIONS_PENDING");
  assert.ok(missing.detail.includes("provider"));
  assert.ok(!missing.detail.includes("decisionStatus"));
  assert.ok(!missing.detail.includes("ownerTypes"));
  assert.ok(report.blockers.some(b=>b.code==="PILOT_TENANT_ISOLATION_PENDING"));
  assert.equal(report.phase1Complete,false);
});

test("pilot tenants must be distinct and included in the fixture scope", () => {
  const scope={schema:"athyper.master-data.launch-scope.v1",decisionStatus:"scope_confirmed",environment:"staging",planes:["neon"],tenantIds:["11111111-1111-4111-8111-111111111111"],channels:["email"],provider:null,ownerTypes:["business_partner"],accountableOwners:{},pilot:{primaryTenantId:"11111111-1111-4111-8111-111111111111",negativeTestTenantId:"11111111-1111-4111-8111-111111111111"}};
  assert.ok(assessPrerequisites({scope}).blockers.some(b=>b.code==="PILOT_TENANT_ISOLATION_PENDING"));
  scope.pilot.negativeTestTenantId="22222222-2222-4222-8222-222222222222";
  assert.ok(assessPrerequisites({scope}).blockers.some(b=>b.code==="PILOT_TENANT_ISOLATION_PENDING"));
  scope.tenantIds.push(scope.pilot.negativeTestTenantId);
  const report=assessPrerequisites({scope});
  assert.ok(!report.blockers.some(b=>b.code==="PILOT_TENANT_ISOLATION_PENDING"));
  assert.equal(report.productionQualified,false);
});
