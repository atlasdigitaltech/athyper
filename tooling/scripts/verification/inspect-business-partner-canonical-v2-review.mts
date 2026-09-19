/** Verify the persisted review snapshot after authenticated submission. */
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect, sql } = require("kysely");
const { Pool } = require("pg");
const inspection = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const host = (Object.values(inspection.NetworkSettings.Networks)[0] as any)
  .IPAddress;
const password = readFileSync(
  `${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,
  "utf8",
).trim();
const database = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "athyper_runtime",
      password,
      database: "athyper_studio",
      connectionTimeoutMillis: 4000,
      ssl: false,
    }),
  }),
});

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const receipt = read(
  "governance/policy/reports/business-partner-canonical-v2-authoring.dev.json",
);
const approvedMode = process.argv.includes("--approved");
const proposal = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.proposal.dev.json",
);
try {
  await database.transaction().execute(async (tx: any) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','81cd1978-2df5-5c9a-938a-2f8c291aea13',true)`.execute(
      tx,
    );
    const row = (
      await sql`SELECT cs.id::text,cs.status,cs.lock_version,cs.created_by::text,cs.submitted_by::text,cs.approved_by::text,
 revision.id::text revision_id,revision.revision_no,revision.contract_json,revision.contract_hash,snapshot.fn_compute_entity_contract_hash(revision.contract_json) computed_storage_hash,revision.validation_status
 FROM metadata.entity_change_set cs JOIN snapshot.entity_contract_revision revision ON revision.change_set_id=cs.id
 WHERE cs.id=${receipt.changeSetId}::uuid AND cs.tenant_id='44444444-4444-4444-8444-444444444444'::uuid
 ORDER BY revision.revision_no DESC LIMIT 1`.execute(tx)
    ).rows[0];
    if (
      !row ||
      row.validation_status !== "valid" ||
      row.created_by !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
      row.submitted_by !== row.created_by
    )
      throw Error("V2_REVIEW_STATE_CHANGED");
    if (approvedMode) {
      const approval = read(
        "governance/policy/reports/business-partner-canonical-v2-approval.dev.json",
      );
      if (
        !approval.approved ||
        approval.changeSetId !== row.id ||
        approval.reviewRevision !== proposal.proposalRevision ||
        approval.persistedNativeContractHash !==
          proposal.nativeCompilerContractHash ||
        row.status !== "approved" ||
        Number(row.lock_version) !== 3 ||
        row.approved_by !== "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d"
      )
        throw Error("V2_INDEPENDENT_APPROVAL_CHANGED");
    } else if (
      row.status !== "in_review" ||
      row.approved_by !== null ||
      Number(row.lock_version) !== receipt.revision
    )
      throw Error("V2_REVIEW_STATE_CHANGED");

    const { validateGraph, compileGraph, canonicalJson } =
      await import("../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js");
    const { combinedHash } =
      await import("./entity-authorization/combined-successor.mjs");
    const { parseEntityAuthorizationRuntime } =
      await import("../../../server/packages/contracts/metadata/src/entity-authorization-runtime.js");
    const { proposalRevision, ...body } = proposal;
    const graph = row.contract_json,
      compiled = compileGraph(graph),
      validation = validateGraph(graph);
    const runtime = parseEntityAuthorizationRuntime(
      proposal.descriptor.authorizationRuntime,
      proposal.descriptor.authorization,
    );
    const original = read(
      "governance/policy/reviews/business-partner-canonical-v2-native-graph.dev.json",
    );
    const checks = {
      proposal: combinedHash(body) === proposalRevision,
      receipt: proposalRevision === receipt.reviewRevision,
      validation: validation.issues.length === 0,
      graph:
        combinedHash(original) === proposal.nativeGraphHash &&
        canonicalJson(graph) === canonicalJson(original),
      compiled: compiled.contractHash === proposal.nativeCompilerContractHash,
      storedContract: row.computed_storage_hash === row.contract_hash,
      atlas:
        combinedHash(compiled.descriptor.ai) ===
        combinedHash(proposal.descriptor.ai),
      authorization:
        combinedHash(compiled.descriptor.authorization) ===
        combinedHash(proposal.descriptor.authorization),
      runtime:
        combinedHash(compiled.descriptor.authorizationRuntime) ===
        combinedHash(runtime),
    };
    if (Object.values(checks).some((v) => !v)) {
      console.log({ checks });
      throw Error("V2_PERSISTED_CONTENT_CHANGED");
    }
    const evidence = {
      schemaVersion: 1,
      kind: approvedMode
        ? "bp_canonical_v2_persisted_approval"
        : "bp_canonical_v2_persisted_review",
      capturedAt: new Date().toISOString(),
      proposalRevision,
      changeSetId: row.id,
      status: row.status,
      changeSetRevision: Number(row.lock_version),
      snapshotRevisionId: row.revision_id,
      persistedNativeContractHash: compiled.contractHash,
      nativeRuntimeHash: combinedHash(runtime),
      sourceGraphHash: proposal.nativeGraphHash,
      persistedGraphHash: combinedHash(graph),
      storageContractHash: row.contract_hash,
      orderIndependentArraysNormalized: true,
      atlasPreserved: true,
      authorizationMatched: true,
      approvalRecorded: approvedMode,
      approvedBy: row.approved_by,
      published: false,
      grantsChanged: false,
      activationAuthorized: false,
    };
    writeFileSync(
      approvedMode
        ? "governance/policy/reports/business-partner-canonical-v2-persisted-approval.dev.json"
        : "governance/policy/reports/business-partner-canonical-v2-persisted-review.dev.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(evidence);
  });
} finally {
  await database.destroy();
}
