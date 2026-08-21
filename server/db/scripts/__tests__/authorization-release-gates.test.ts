import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "node:test";

import { buildAuthorizationReleaseGate } from "../checks/seeds/authorization-release-gates.js";

it("reports every required authorization release gate without hiding unexecuted evidence", async () => {
  const report = await buildAuthorizationReleaseGate();
  assert.deepEqual(Object.keys(report.gates), [
    "noPublishedLegacyPermissions",
    "noGenericCanonicalActionPermissions",
    "explicitScopeCompatibility",
    "activeRolesUsePublishedCanonicalPermissions",
    "operationBindingCardinality",
    "applicationPermissionDemandCoverage",
    "neonPhysicalTableAuthorizationCoverage",
    "meshPhysicalTableAuthorizationCoverage",
    "inventoryPermissionPromotionQualification",
    "productionSeedsDoNotWriteRuntimeEvidence",
    "projectionRowsAreReconcilerOwned",
    "planePackDoubleApplyIsNoOp",
    "deterministicPlanePackHashes",
    "cleanSlateQuarantineBaseline",
    "failClosedEvaluatorCorpus",
  ]);
  assert.equal(report.gates.planePackDoubleApplyIsNoOp?.status, "not_run");
  assert.equal(report.ready, false);
});

it("publishes a legacy-free, zero-grant clean-slate baseline", async () => {
  const report = await buildAuthorizationReleaseGate();
  assert.equal(report.gates.noPublishedLegacyPermissions?.status, "pass");
  assert.equal((report.gates.noPublishedLegacyPermissions?.evidence as { legacySeedRepublishRisk: boolean }).legacySeedRepublishRisk, false);
  assert.equal(report.gates.cleanSlateQuarantineBaseline?.status, "pass");
  assert.equal(report.gates.operationBindingCardinality?.status, "fail");
  assert.equal(report.gates.applicationPermissionDemandCoverage?.status, "fail");
  assert.equal(report.gates.neonPhysicalTableAuthorizationCoverage?.status, "fail");
  assert.equal(report.gates.meshPhysicalTableAuthorizationCoverage?.status, "fail");
  assert.equal(report.gates.inventoryPermissionPromotionQualification?.status, "fail");
});

it("covers the required fail-closed evaluator boundaries", async () => {
  const report = await buildAuthorizationReleaseGate();
  assert.equal(report.gates.failClosedEvaluatorCorpus?.status, "pass");
});

it("keeps three-plane snapshot parity authoritative and excludes operational receipts", async () => {
  const dbRoot = resolve(import.meta.dirname, "../..");
  const gate = await readFile(resolve(dbRoot, "scripts/checks/seeds/authorization-release-gates.ts"), "utf8");
  const applicator = await readFile(resolve(dbRoot, "scripts/provisioning/authorization-pack-applicator.ts"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(dbRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const command = packageJson.scripts["db:verify:authorization:release:idempotency"] ?? "";
  assert.match(command, /--apply-twice/);
  assert.doesNotMatch(command, /--plane/);
  assert.match(gate, /assertDistinctPlaneDatabases/);
  assert.match(gate, /databaseNames\.size !== planes\.length/);
  assert.match(gate, /first\.sha256 !== second\.sha256/);
  assert.match(gate, /AUTHORITY_SNAPSHOT_RELATIONS/);
  assert.match(gate, /relationSnapshots/);
  assert.match(gate, /public\.seed_pack_execution_v2/);
  assert.doesNotMatch(gate, /ON CONFLICT fired|conflict(?:_| )count/i);
  assert.match(applicator, /current\.rows\[0\]\.exact\) return current\.rows\[0\]\.id/);
  assert.match(applicator, /authz\.permission\.permission_kind[\s\S]*IS DISTINCT FROM[\s\S]*'published'::authz\.catalog_status_d/);
  assert.match(applicator, /authz\.plane_membership[\s\S]*metadata IS DISTINCT FROM \$5::jsonb/);
  assert.match(applicator, /master\.legal_entity\.metadata[\s\S]*IS DISTINCT FROM/);
  assert.match(applicator, /mesh\.network_account\.metadata[\s\S]*IS DISTINCT FROM/);
});

it("runs one mandatory idempotency command for compiler, contract, and pack changes", async () => {
  const repositoryRoot = resolve(import.meta.dirname, "../../../..");
  const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/authorization-idempotency.yml"), "utf8");
  assert.match(workflow, /server\/db\/scripts\/seed\/\*\*/);
  assert.match(workflow, /server\/db\/seed\/contracts\/authorization\/\*\*/);
  assert.match(workflow, /server\/db\/seed\/packs\/authorization-v2\/\*\*/);
  assert.match(workflow, /Create separate plane databases[\s\S]*athyper_studio[\s\S]*athyper_neon[\s\S]*athyper_mesh/);
  assert.equal((workflow.match(/-AuthorizationIdempotency/g) ?? []).length, 3);
  const invocations = workflow.match(/db:verify:authorization:release:idempotency/g) ?? [];
  assert.equal(invocations.length, 1);
});
