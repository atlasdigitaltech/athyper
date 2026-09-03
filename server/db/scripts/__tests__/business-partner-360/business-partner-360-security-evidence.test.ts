import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("P0 security runner executes tenant, scope, collision, rollback and leakage matrices", async () => {
  const source = await read(
    "db/scripts/business-partner-360/run-business-partner-360-security-evidence.ts",
  );
  for (const value of [
    "SET LOCAL ROLE athyperapp",
    "crossTenantIdor",
    "wrongCompany",
    "wrongLegalEntity",
    "ownerCollision",
    "FAULT_STAGES",
    "snapshot.fn_capture_entity",
    "audit.audit_log",
    "event.outbox",
    "restrictedPayloadRejected",
    "meshPersonLeak",
  ])
    assert.match(source, new RegExp(value.replaceAll(".", "\\.")));
  assert.match(
    source,
    /\["master","typed_child","snapshot","audit","outbox","request_state"\]/,
  );
});

test("P0 restricted reveal is one-time, purpose-expiring and permission-epoch bound", async () => {
  const [service, repository, routes, taxClient, bankClient] =
    await Promise.all([
      read("packages/services/master-data/src/business-partner-360-service.ts"),
      read(
        "packages/services/master-data/src/kysely-business-partner-360-repository.ts",
      ),
      read("packages/services/master-data/src/business-partner-360-routes.ts"),
      read(
        "../packages/planes/neon/business-partner/src/360/business-partner-360-section-client.ts",
      ),
      read(
        "../packages/planes/neon/business-partner/src/360/business-partner-360-commercial-client.ts",
      ),
    ]);
  for (const value of [
    "BP_360_REVEAL_REPLAYED",
    "BP_360_REVEAL_PURPOSE_EXPIRED",
    "permissionEpoch",
    "claimRestrictedReveal",
  ])
    assert.match(service, new RegExp(value));
  assert.match(repository, /event\.command_execution/);
  for (const source of [routes, taxClient, bankClient])
    for (const value of ["revealId", "purposeExpiresAt"])
      assert.match(source, new RegExp(value));
});

test("P0 public and browser-adjacent surfaces remain restricted-value negative", async () => {
  const [
    routes,
    shell,
    common,
    commercial,
    workforceRequests,
    exportPrivacy,
    meshDefinition,
  ] = await Promise.all([
    read("packages/services/master-data/src/business-partner-360-routes.ts"),
    read(
      "../packages/planes/neon/business-partner/src/360/business-partner-360.tsx",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/components/common-section.tsx",
    ),
    read(
      "../packages/planes/neon/business-partner/src/360/components/commercial-controls.tsx",
    ),
    read(
      "../packages/planes/neon/workforce/src/index.tsx",
    ),
    read("packages/services/records/src/transfer/transfer-service.ts"),
    read(
      "packages/services/publication/src/business-partner-foundation-definition.ts",
    ),
  ]);
  assert.doesNotMatch(
    routes,
    /attributes\.(?:businessPartnerId|principalId|purpose)|localStorage|sessionStorage/,
  );
  for (const source of [shell, common, commercial, workforceRequests])
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(workforceRequests, /dateOfBirth|nationalId|passport|compensation|billRate/i);
  assert.match(exportPrivacy, /BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN/);
  for (const value of ["person.", "workforce."])
    assert.match(meshDefinition, new RegExp(value.replace(".", "\\.")));
});

test("P0 materialization tests cover exact replay, conflict, stale version and safe effects", async () => {
  const [serviceTest, service, repository] = await Promise.all([
    read(
      "packages/services/master-data/src/__tests__/business-partner-request-service.test.ts",
    ),
    read(
      "packages/services/master-data/src/business-partner-request-service.ts",
    ),
    read(
      "packages/services/master-data/src/kysely-business-partner-request-repository.ts",
    ),
  ]);
  assert.match(
    serviceTest,
    /materializes an approved Phase 1B supplier exactly once/,
  );
  assert.match(serviceTest, /replayed:true/);
  assert.match(service, /BUSINESS_PARTNER_REQUEST_APPLICATION_CONFLICT/);
  assert.match(repository, /BUSINESS_PARTNER_REQUEST_STALE_BASE_VERSION/);
  assert.doesNotMatch(service, /payload:\s*\{[^}]*proposedPayload/s);
});
