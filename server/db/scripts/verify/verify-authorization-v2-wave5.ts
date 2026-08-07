#!/usr/bin/env tsx
/**
 * Static Wave 5 runtime-foundation gate. Production cutover remains governed
 * by the database release/consumer ledgers and is intentionally not implied.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../../../..");
let failures = 0;

function expect(condition: unknown, message: string): void {
  if (condition) process.stdout.write(`PASS ${message}\n`);
  else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}

async function text(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

const contract = JSON.parse(await text(
  "config/governance/authorization-wave5-runtime-contract.v1.json",
)) as {
  contractVersion: string;
  sessionContractVersion: string;
  rules: Record<string, boolean>;
};
const consumerInventory = JSON.parse(await text(
  "config/governance/authorization-wave5-consumer-inventory.v1.json",
)) as {
  consumers: Array<{
    family: string;
    entryPoints: string[];
    status: string;
  }>;
};
const decision = await text(
  "server/packages/services/iam/authorization-runtime/decision.service.ts",
);
const repository = await text(
  "server/packages/services/iam/authorization-runtime/sql-repository.ts",
);
const factory = await text(
  "server/packages/services/iam/authorization-runtime/runtime-factory.ts",
);
const session = await text(
  "server/packages/services/iam/authorization-runtime/session-v2.ts",
);
const consumers = await text(
  "server/packages/services/iam/authorization-runtime/consumer-enforcement.ts",
);
const audit = await text(
  "server/packages/services/iam/authorization-runtime/sql-audit-sink.ts",
);
const invalidation = await text(
  "server/packages/services/iam/authorization-runtime/invalidation-worker.ts",
);
const tests = await text(
  "server/packages/services/iam/authorization-runtime/__tests__/canonical-runtime.test.ts",
);
const neonDdl = await text(
  "server/db/ddl/planes/neon/authz/03_tables.sql",
);
const meshDdl = await text(
  "server/db/ddl/planes/mesh/authz/03_tables.sql",
);
const neonPublicationGuard = await text(
  "server/db/ddl/planes/neon/authz/07_functions.sql",
);
const meshPublicationGuard = await text(
  "server/db/ddl/planes/mesh/authz/07_functions.sql",
);

expect(
  contract.contractVersion === "wave5.canonical-runtime.v1"
    && contract.sessionContractVersion === "wave5.authorization-session.v2",
  "runtime and session contract versions are sealed",
);
expect(
  decision.includes("const batch = await this.decideBatch([request])")
    && decision.includes("await this.audit.append(auditRows)"),
  "single, batch, materialization, and durable evidence share one engine",
);
expect(
  factory.includes("readonly meshDb: AnyDb")
    && !factory.includes("meshDb ??")
    && !factory.includes("readonly db: AnyDb;\n    readonly meshDb"),
  "Mesh runtime has a mandatory local DB and no Neon fallback input",
);
expect(
  repository.includes("authorization_runtime_release_v2")
    && repository.includes('requiredReleaseState: "shadow" | "active"')
    && factory.includes('requiredReleaseState: "active"'),
  "production repository requires an active published runtime release",
);
expect(
  session.includes("session and evaluator catalog versions diverged")
    && session.includes("acl_record_only")
    && session.includes("AUTHORIZATION_SESSION_CONTRACT_VERSION"),
  "session v2 locks catalog versions and does not globalize ACL access",
);
expect(
  [
    '"list"', '"count"', '"export"', '"batch"', '"session"',
    '"detail"', '"download"', '"share"', '"update"', '"delete"',
    '"workflow"', '"document"', '"metadata"', '"admin"', '"mesh"', '"ai"',
  ].every((token) => consumers.includes(token)),
  "one exact-ID adapter covers collection and resource consumer paths",
);
expect(
  !/(?:split|endsWith|startsWith|includes)\s*\([^)]*permission/i
    .test(consumers)
    && !/\b(?:persona|access_grant|principal_feature_grant|group_feature_grant)\b/i
      .test(consumers),
  "new consumer boundary has no permission token/suffix or legacy authority inference",
);
expect(
  audit.includes("authorizationFingerprint")
    && audit.includes('allowByKind("delegation")')
    && audit.includes("auth_decision_evidence_v2"),
  "decision evidence contains fingerprints and delegation proof classification",
);
expect(
  invalidation.includes("fn_authorization_claim_invalidations_v2")
    && invalidation.includes("fn_authorization_complete_invalidation_v2")
    && invalidation.includes("fn_authorization_fail_invalidation_v2"),
  "runtime consumes the durable leased invalidation outbox",
);
expect(
  neonDdl.includes("DEFAULT 'shadow'")
    && meshDdl.includes("DEFAULT 'shadow'")
    && neonDdl.includes("authorization_consumer_migration_v2")
    && meshDdl.includes("authorization_consumer_migration_v2"),
  "plane-local publication and consumer ledgers start fail-closed",
);
expect(
  neonPublicationGuard.includes("v_total <> 7")
    && meshPublicationGuard.includes("v_total <> 6")
    && neonPublicationGuard.includes("observation_window_until")
    && meshPublicationGuard.includes("observation_window_until")
    && neonPublicationGuard.includes("cannot downgrade consumer")
    && meshPublicationGuard.includes("cannot downgrade consumer"),
  "database guards block activation or downgrade without complete verification and observation windows",
);
expect(
  !/\b(?:master|control|event|log)\./.test(meshDdl),
  "Mesh Wave 5 DDL contains zero Neon schema references",
);
for (const label of [
  "keeps collection and resource semantics identical across consumers",
  "enforces content and attachment ACLs only on the exact record",
  "rejects delegated authority without ordinary provenance/subset",
  "builds session v2 from the evaluator catalog version",
  "fails closed on missing Mesh configuration",
  "evaluates Mesh while Neon is unavailable",
]) {
  expect(tests.includes(label), `runtime tests cover: ${label}`);
}
expect(
  contract.rules["exactCatalogIdsOnly"] === true
    && contract.rules["permissionTextInferenceAllowed"] === false
    && contract.rules["aclRecordOnly"] === true
    && contract.rules["aclAdvertisedAsGlobalCapability"] === false
    && contract.rules["delegationRequiresOrdinaryProvenanceAndScopeSubset"]
      === true
    && contract.rules["durableDecisionEvidenceRequired"] === true
    && contract.rules["outboxInvalidationRequired"] === true
    && contract.rules["missingPlaneDatabaseOrReleaseFailsClosed"] === true
    && contract.rules["sessionAndDecisionCatalogVersionMustMatch"] === true,
  "all Wave 5 allow/deny contract rules have their exact required values",
);
const expectedFamilies = [
  "metadata", "records", "workflow", "documents",
  "admin", "mesh", "session", "ai",
];
expect(
  expectedFamilies.every((family) =>
    consumerInventory.consumers.some((row) =>
      row.family === family
      && row.entryPoints.length > 0
      && row.status.length > 0
    )
  ),
  "every Wave 5 consumer family has an explicit migration disposition",
);

if (failures > 0) {
  process.stderr.write(`Wave 5 static verification failed: ${failures} gate(s)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Wave 5 static runtime verification passed\n");
}
