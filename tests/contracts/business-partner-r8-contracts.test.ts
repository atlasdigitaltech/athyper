import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { STUDIO_BP_DEFINITION_RELAY_OPERATIONS } from "../../packages/platform/gateway/bff-relay/src/index";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const fixture = JSON.parse(
  read(
    "packages/contracts/platform/fixtures/business-partner-r8-studio-operations.v1.json",
  ),
);

test("R8 freezes the applicable WS8/WS9 cross-cutting scenarios honestly", () => {
  assert.equal(fixture.$schema, "athyper.business-partner-r8-fixture/1");
  assert.deepEqual(
    fixture.scenarios.map((item: { id: string }) => item.id),
    [
      "BP-X-004",
      "BP-X-006",
      "BP-X-007",
      "BP-X-008",
      "BP-X-009",
      "BP-X-010",
      "BP-X-012",
      "BP-X-013",
      "BP-X-014",
    ],
  );
  assert.equal(fixture.invariants.simulationWritesRevision, false);
  assert.equal(fixture.invariants.simulationAuthorizesPublication, false);
  assert.equal(
    fixture.invariants.localEvidenceClaimsProductionQualification,
    false,
  );
  assert.equal(
    fixture.invariants.qualificationRequiresAllFiveProductionReceipts,
    true,
  );
  assert.equal(
    fixture.invariants.manualAccessibilityCanBeSatisfiedByAutomationOnly,
    false,
  );
});

test("R8 exposes read-only simulation separately from author and publish", () => {
  const operations = STUDIO_BP_DEFINITION_RELAY_OPERATIONS.map(
    (item) => `${item.method} ${item.path}:${item.idempotency}`,
  );
  assert.ok(
    operations.includes(
      "POST /api/studio/business-partner-definitions/simulations:none",
    ),
  );
  const service = read(
    "server/packages/services/publication/src/business-partner-definition-service.ts",
  );
  const simulation = service.slice(
    service.indexOf("export function simulateBusinessPartnerDefinition"),
    service.indexOf("export function parseBusinessPartnerDefinitionBundle"),
  );
  assert.match(simulation, /readOnly:true/);
  assert.match(simulation, /publicationAuthorized:false/);
  assert.doesNotMatch(simulation, /INSERT|UPDATE|DELETE|transitionRelease/);
});

test("R8 Studio renders proof coordinates and preserves blocked qualification", () => {
  const surface = read(
    "packages/planes/studio/business-partner/src/operations.tsx",
  );
  const manifest = JSON.parse(
    read(
      "governance/config/governance/business-partner-v1-qualification.v1.json",
    ),
  );
  assert.match(surface, /View coordinates/);
  assert.match(surface, /Production qualification remains blocked/);
  assert.equal(manifest.productionQualified, false);
  assert.equal(manifest.productionQualification, "blocked");
  assert.ok(manifest.environmentBlockers.length > 0);
});

test("R8 recovery guidance keeps proof inspection separate from mutation", () => {
  const runbook = read("docs/runbooks/business-partner-release-operations.md");
  assert.match(runbook, /proof workspace is read-only/i);
  assert.match(runbook, /does\s+not authorize publication/i);
  assert.match(runbook, /no direct table update/i);
  assert.match(runbook, /Production qualification remains blocked/);
});

test("R8 exposes all five fail-closed production qualification gates", () => {
  const manifest = JSON.parse(
    read(
      "governance/config/governance/business-partner-r8-qualification.v1.json",
    ),
  );
  assert.equal(manifest.productionQualified, false);
  assert.equal(manifest.productionQualification, "blocked");
  assert.deepEqual(
    manifest.gates.map((gate: { id: string }) => gate.id),
    [
      "target_evidence_lifecycle",
      "manual_accessibility",
      "clean_upgrade_parity",
      "production_canary_rollback",
      "named_owner_certification",
    ],
  );
  assert.ok(
    manifest.gates.every(
      (gate: { status: string; receipt: unknown }) =>
        gate.status === "pending" && gate.receipt === null,
    ),
  );
  const surface = read(
    "packages/planes/studio/business-partner/src/operations.tsx",
  );
  assert.match(surface, /R8 production gates/);
  assert.match(surface, /Required before certification/);
  const verifier = read(
    "tooling/scripts/verification/verify-business-partner-r8-qualification.mjs",
  );
  for (const token of [
    "minimumRetentionDays",
    "manual_accessibility",
    "clean_upgrade_parity",
    "production_canary_rollback",
    "named_owner_certification",
  ])
    assert.ok(verifier.includes(token), `R8 verifier is missing ${token}`);
});
