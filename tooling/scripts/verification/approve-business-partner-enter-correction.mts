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
  "governance/policy/reviews/business-partner-enter-correction.proposal.dev.json",
);
const { proposalRevision, ...body } = proposal;
const expected =
  "18a0e7588915ff3809c4d4bbb23a4277ec12a93b8df5f5f5179f60c3806213d9";
const id = "3d68c639-df7e-4683-8c26-93b87bab21eb",
  tenant = "44444444-4444-4444-8444-444444444444",
  owner = "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
  author = "81cd1978-2df5-5c9a-938a-2f8c291aea13";
const path =
  "governance/policy/reports/business-partner-enter-correction-approval.dev.json";
if (
  proposalRevision !== expected ||
  hash(body) !== expected ||
  fs.existsSync(path)
)
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
      Number(r.lock_version) !== (approved ? 3 : 2) ||
      r.created_by !== author ||
      r.submitted_by !== author ||
      r.approved_by !== (approved ? owner : null) ||
      r.validation_status !== "valid"
    )
      throw Error("Persisted review coordinate mismatch");
    const sourceGraph = read(
      "governance/policy/reviews/business-partner-enter-correction.graph.dev.json",
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
const auth = "tests/e2e/.auth/catl.owner-bp-combined-review.json",
  origin = "https://studio.dev.athyper.test";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: auth,
});
try {
  const session = await (await client.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.assurance !== "elevated" ||
    session.principalId !== owner ||
    session.tenantId !== tenant
  )
    throw Error("Elevated independent reviewer required");
  const ir = await client.get("/api/relay/iam/me"),
    identity = await ir.json();
  if (
    !ir.ok() ||
    identity.principalId !== owner ||
    identity.tenantId !== tenant ||
    !identity.permissions?.includes("metadata.entity.review")
  )
    throw Error("Current review authority required");
  const before = await inspect();
  const csrf = (await client.storageState()).cookies.find(
    (c) => c.name === "__Host-athyper-csrf",
  );
  if (!csrf) throw Error("CSRF required");
  const response = await client.post(
    `/api/relay/meta-entity-authoring/change-sets/${id}/approve`,
    {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "if-match": "2",
      },
      data: { expectedRevision: 2 },
    },
  );
  const result = await response.json();
  const receipt: any = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    proposalRevision,
    changeSetId: id,
    account: "catl.owner",
    principalId: owner,
    tenantId: tenant,
    before,
    status: response.status(),
    response: result,
    approved: false,
    published: false,
    grantsChanged: false,
    activationChanged: false,
  };
  fs.writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  if (
    !response.ok() ||
    result.status !== "approved" ||
    result.revision !== 3 ||
    result.approvedBy !== owner
  )
    throw Error("Authenticated review not recorded");
  receipt.after = await inspect(true);
  receipt.approved = true;
  fs.writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log({
    approved: true,
    revision: 3,
    changeSetId: id,
    published: false,
  });
} finally {
  await client.storageState({ path: auth });
  fs.chmodSync(auth, 0o600);
  await client.dispose();
  await db.destroy();
}
