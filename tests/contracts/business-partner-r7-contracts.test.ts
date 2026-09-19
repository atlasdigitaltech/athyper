import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const fixture = JSON.parse(
  read(
    "packages/contracts/platform/fixtures/business-partner-r7-supplier-workforce.v1.json",
  ),
);
const tables = read("server/db/ddl/planes/neon/document/03_tables.sql");
const functions = read("server/db/ddl/planes/neon/document/07_functions.sql");
const constraints = read(
  "server/db/ddl/planes/neon/document/05_constraints.sql",
);
const requisitionService = read("server/packages/services/master-data/src/supplier-workforce-requisition-service.ts")+read("server/packages/services/master-data/src/supplier-workforce-distribution-http-adapter.ts")+read("server/packages/contracts/master-data/src/supplier-workforce.ts");
const requisitionSurface = read("packages/planes/neon/workforce/src/supplier-requisitions.tsx");
const relay = read("packages/platform/gateway/bff-relay/src/index.ts");
const commandGuard = read("server/packages/services/master-data/src/supplier-workforce-command-guard.ts");
const iamService = read("server/packages/services/master-data/src/worker-engagement-iam-service.ts");
const iamRepository = read("server/packages/services/master-data/src/worker-engagement-iam-repository.ts");
const iamRoutes = read("server/packages/services/master-data/src/worker-engagement-iam-routes.ts");
const lifecycleService = read("server/packages/services/master-data/src/worker-engagement-lifecycle-service.ts");
const lifecycleRoutes = read("server/packages/services/master-data/src/worker-engagement-lifecycle-routes.ts");
const grants = read("server/db/ddl/planes/neon/document/11_grants.sql");
const triggers = read("server/db/ddl/planes/neon/document/08_triggers.sql");
const qualification = JSON.parse(
  read("governance/config/governance/business-partner-r7-qualification.v1.json"),
);
const targetJourney = read("tests/e2e/business-partner/bp-r7.spec.ts");

test("R7 freezes BP-WRK-001 through BP-WRK-010 without claiming open policy", () => {
  assert.equal(fixture.$schema, "athyper.business-partner-r7-fixture/1");
  assert.deepEqual(
    fixture.scenarios.map((item: { id: string }) => item.id),
    Array.from(
      { length: 10 },
      (_, index) => `BP-WRK-${String(index + 1).padStart(3, "0")}`,
    ),
  );
  assert.equal(fixture.policyCoordinates["BP-Q004"], null);
  assert.equal(fixture.policyCoordinates["BP-Q006"], null);
  assert.equal(fixture.invariants.targetEnvironmentEvidenceRetained, false);
});

test("BP-WRK-007/008/010 expose effective placement and atomic termination commands",()=>{
  assert.match(lifecycleService,/boundary:\s*"placement_change"/);
  assert.match(lifecycleService,/boundary:\s*"engagement_end"/);
  assert.match(lifecycleRoutes,/engagements\/:workerEngagementId\/placements/);
  assert.match(lifecycleRoutes,/engagements\/:workerEngagementId\/termination/);
  assert.match(relay,/engagements\/:workerEngagementId\/placements/);
  assert.match(relay,/engagements\/:workerEngagementId\/termination/);
  const placement=functions.slice(functions.indexOf("document.command_worker_operational_placement_activate"),functions.indexOf("document.command_worker_engagement_terminate"));
  assert.match(placement,/status='superseded'/);assert.match(placement,/p_expected_version/);assert.match(placement,/policyEvidence/);
  const termination=functions.slice(functions.indexOf("document.command_worker_engagement_terminate"),functions.indexOf("document.trg_guard_external_revision"));
  assert.match(termination,/status='terminated'/);assert.match(termination,/command_worker_engagement_iam_projection/);assert.match(termination,/iamOutboxId/);assert.match(termination,/policyEvidence/);
  assert.match(functions,/Worker engagement lifecycle state is command-owned/);assert.match(functions,/Worker operational placement is command-owned/);
  assert.match(triggers,/trg_worker_engagement_16_lifecycle_command/);assert.match(triggers,/trg_worker_operational_placement_10_command/);
  assert.doesNotMatch(placement+termination,/INSERT INTO master\.person|INSERT INTO master\.external_worker/);
});

test("R7 keeps candidate, Person, external-worker, engagement and placement authorities distinct", () => {
  for (const aggregate of [
    "external_candidate_submission",
    "worker_engagement",
    "worker_operational_placement",
    "worker_compliance_item",
  ])
    assert.match(tables, new RegExp(`CREATE TABLE document\\.${aggregate}`));
  assert.match(tables, /Pre-selection identity may remain pseudonymous/);
  assert.match(tables, /This is not master\.work_assignment/);
  assert.match(constraints, /external_candidate_submission_person_fk/);
  assert.doesNotMatch(
    functions.slice(
      functions.indexOf("trg_guard_external_candidate_submission"),
      functions.indexOf("trg_guard_contingent_work_order"),
    ),
    /INSERT INTO master\.person|UPDATE master\.person/,
  );
});

test("R7 IAM is command-owned, atomic, idempotent and terminal-safe", () => {
  const command = functions.slice(
    functions.indexOf("document.command_worker_engagement_iam_projection"),
    functions.indexOf("document.trg_guard_external_revision"),
  );
  assert.match(command, /p_expected_version/);
  assert.match(command, /p_idempotency_key/);
  assert.match(command, /event\.command_execution/);
  assert.match(command, /event\.outbox/);
  assert.match(
    command,
    /IN \('completed', 'terminated', 'cancelled', 'closed'\)/,
  );
  assert.match(command, /v_desired_status := 'deprovisioned'/);
  assert.match(
    functions,
    /Worker engagement IAM access state is command-owned/,
  );
  assert.doesNotMatch(
    command,
    /INSERT INTO master\.person|INSERT INTO master\.external_worker/,
  );
});

test("BP-WRK-001 publishes only approved requisitions to verified Supplier coordinates",()=>{
  assert.match(functions,/document\.command_publish_workforce_requisition/);
  assert.match(functions,/v_requisition\.status<>'approved'/);
  assert.match(functions,/workforce\.requisition\.published/);
  for(const token of ["networkRelationshipId","capabilityId","qualificationId","evidenceHash"])assert.ok(requisitionService.includes(token),`missing ${token}`);
  assert.match(requisitionSurface,/No candidate, Person, engagement, placement, or IAM record is created/);
  assert.match(relay,/supplier-workforce\/requisitions\/:requisitionId\/publications/);
  const command=functions.slice(functions.indexOf("document.command_publish_workforce_requisition"),functions.indexOf("END $$;",functions.indexOf("document.command_publish_workforce_requisition")));
  assert.doesNotMatch(command,/INSERT INTO (master\.person|document\.external_candidate_submission|document\.worker_engagement|document\.worker_operational_placement|document\.workforce_iam_projection)/);
});

test("BP-WRK-001 retains a mandatory target journey without overstating R7 qualification",()=>{
  assert.equal(qualification.$schema,"athyper.business-partner-r7-qualification/1");
  assert.equal(qualification.productionQualified,false);
  assert.equal(qualification.productionQualification,"blocked");
  assert.equal(qualification.policyCoordinates["BP-Q004"],null);
  assert.equal(qualification.policyCoordinates["BP-Q006"],null);
  assert.doesNotMatch(targetJourney,/test\.skip|\.skip\(/);
  for(const token of ["BP-WRK-001","replayed: true","bp-wrk-001-publication.json"])assert.ok(targetJourney.includes(token),`missing ${token}`);
});

test("R7 exposes ratified policy readiness without enabling unresolved commands",()=>{
  for(const token of ["approvalEvidenceId","approvedByRoles","workforce","procurement","privacy","legal"])assert.ok(requisitionService.includes(token),`missing policy activation evidence ${token}`);
  assert.match(relay,/supplier-workforce\/policy-readiness/);
  assert.match(requisitionSurface,/readiness\?\.decisions\["BP-Q006"\]/);
  assert.match(requisitionSurface,/readiness\?\.decisions\["BP-Q004"\]/);
  assert.equal(qualification.activationRequirements.candidateCommandsEnabledWithoutBPQ006,false);
  assert.equal(qualification.activationRequirements.commercialOrIamCommandsEnabledWithoutBothCoordinates,false);
});

test("R7 blocks every downstream mutation before domain persistence",()=>{
  for(const boundary of ["candidate_disclose","candidate_session","candidate_evaluate","person_resolve","commercial_approve","engagement_activate","placement_change","compliance_change","engagement_end","iam_project"])assert.ok(requisitionService.includes(`"${boundary}"`),`contract is missing ${boundary}`);
  assert.match(commandGuard,/authorizer\.authorize[\s\S]*evaluateSupplierWorkforceGate[\s\S]*return work/);
  assert.match(commandGuard,/SUPPLIER_WORKFORCE_POLICY_REQUIRED/);
  assert.match(requisitionService,/publish:"neon\.workforce\.request\.decide"/);
  assert.doesNotMatch(requisitionService,/neon\.workforce\.review/);
});

test("BP-WRK-007 and BP-WRK-010 productize IAM only through the two-policy entrypoint",()=>{
  assert.match(iamService,/boundary: "iam_project"/);
  assert.match(iamService,/permissionCode: "neon\.workforce\.request\.apply"/);
  assert.match(iamRepository,/policyEvidence/);
  assert.match(iamRoutes,/engagements\/:workerEngagementId\/iam-projections/);
  assert.match(relay,/engagements\/:workerEngagementId\/iam-projections/);
  const guarded=functions.slice(functions.indexOf("p_policy_evidence jsonb"),functions.indexOf("document.trg_guard_external_revision"));
  for(const token of ["BP-Q004","BP-Q006","policyEvidence","approvalEvidenceId"])assert.ok(guarded.includes(token),`guarded IAM command is missing ${token}`);
  assert.match(grants,/REVOKE ALL ON FUNCTION document\.command_worker_engagement_iam_projection\(uuid,uuid,bigint,text,uuid,uuid\) FROM athyperapp/);
  assert.match(grants,/GRANT EXECUTE ON FUNCTION document\.command_worker_engagement_iam_projection\(uuid,uuid,bigint,text,uuid,uuid,jsonb\) TO athyperapp/);
});
