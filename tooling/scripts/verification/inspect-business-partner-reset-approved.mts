/** User-approved exact reset proposal; authenticated independent review only. */
import fs from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
import { baselineJsonHash as hash } from "../../../server/packages/planes/studio/meta-entity-authoring/src/baseline-publication.ts";
import {
  compileGraph,
  validateGraph,
  canonicalJson,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.ts";
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const proposal = read(
  "governance/policy/reviews/business-partner-reset-runtime.proposal.dev.json",
);
const { proposalRevision, ...body } = proposal;
const expected =
  "8c09c5f30249a382d43349e6cd06465c332c2c5c05e21a34f95bbda26a42e72b";
const id = "c617270b-cbc3-44ed-867e-31e55e819c3c",
  tenant = "44444444-4444-4444-8444-444444444444",
  owner = "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
  author = "81cd1978-2df5-5c9a-938a-2f8c291aea13";
const path =
  "governance/policy/reports/business-partner-reset-runtime-approval.dev.json";
if (proposalRevision !== expected || hash(body) !== expected)
  throw Error("Proposal changed or prior review attempt exists");
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect, sql } = require("kysely");
const { Pool } = require("pg");
const docker = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: (Object.values(docker.NetworkSettings.Networks)[0] as any)
        .IPAddress,
      user: "athyper_runtime",
      password: fs
        .readFileSync(
          `${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,
          "utf8",
        )
        .trim(),
      database: "athyper_studio",
      connectionTimeoutMillis: 4000,
      ssl: false,
    }),
  }),
});
async function inspect(approved = false) {
  return db.transaction().execute(async (tx: any) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${owner},true)`.execute(
      tx,
    );
    const r = (
      await sql`SELECT cs.id::text,cs.status,cs.lock_version,cs.created_by::text,cs.submitted_by::text,cs.approved_by::text,revision.id::text snapshot_id,revision.contract_json,revision.validation_status FROM metadata.entity_change_set cs JOIN snapshot.entity_contract_revision revision ON revision.change_set_id=cs.id WHERE cs.id=${id}::uuid AND cs.tenant_id=${tenant}::uuid ORDER BY revision.revision_no DESC LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    if (
      !r ||
      r.status !== (approved ? "approved" : "in_review") ||
      Number(r.lock_version) !== (approved ? 4 : 3) ||
      r.created_by !== author ||
      r.submitted_by !== author ||
      r.approved_by !== (approved ? owner : null) ||
      r.validation_status !== "valid"
    )
      throw Error("Persisted review coordinate mismatch");
    const sourceGraph = read(
      "governance/policy/reviews/business-partner-reset-runtime.graph.dev.json",
    );
    if (
      hash(sourceGraph) !== proposal.graphHash ||
      canonicalJson(r.contract_json) !== canonicalJson(sourceGraph) ||
      validateGraph(r.contract_json).issues.length ||
      compileGraph(r.contract_json).contractHash !== proposal.nativeContractHash
    )
      throw Error("Persisted proposal mismatch");
    return {
      snapshotId: r.snapshot_id,
      status: r.status,
      revision: Number(r.lock_version),
      graphHash: proposal.graphHash,
      contractHash: proposal.nativeContractHash,
      approvedBy: r.approved_by,
    };
  });
}
try {
  const result = await inspect(true);
  console.log(result);
} finally {
  await db.destroy();
}
