/** Exact unsigned DEV execution-policy preparation. All DB transactions are
 * read-only. Human policy proposal/activation happen only through control APIs. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { publicationCompilerIdentity } from "../../src/composition/shared/publication/compiler-build.js";
import { parseHumanReviewedExecutionPolicy, type HumanReviewedExecutionPolicy } from "../../src/composition/shared/publication/human-publication-policy.js";

import { assertHumanReviewedEnrollmentSource } from "../../src/composition/shared/publication/human-publication-admission.js";

const [approvalPath, outputPath, policyId, probe] = process.argv.slice(2);
if (!approvalPath || !outputPath || !policyId || (probe !== undefined && probe !== "--rollback-ddl-probe") || process.argv.length > 6)
  throw Error("Use <approval-report.json> <new-output.json> <policy-id> [--rollback-ddl-probe]");
class RollbackProbe extends Error { constructor(readonly policy: HumanReviewedExecutionPolicy) { super("ROLLBACK_DDL_PROBE"); } }
const approval = JSON.parse(readFileSync(resolve(approvalPath), "utf8"));
if (approval.schema !== "athyper.coordinated-human-approval/1" || !approval.entries?.length) throw Error("APPROVAL_REPORT_REQUIRED");
const container = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
if (!container.State.Running || container.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("DEV_DATABASE_REQUIRED");
const env = Object.fromEntries(container.Config.Env.map((s: string) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]));
const secret = container.Mounts.find((m: { Destination: string }) => m.Destination === env.POSTGRES_PASSWORD_FILE)?.Source;
if (!secret?.includes("/.athyper/instances/dev/secrets/")) throw Error("DEV_SECRET_REQUIRED");
const password = readFileSync(secret, "utf8").trim();
const host = (Object.values(container.NetworkSettings.Networks)[0] as { IPAddress: string }).IPAddress;
const databases = new Map<string, Kysely<Record<string, never>>>();
function db(plane: string) {
  if (!["studio", "neon", "mesh"].includes(plane)) throw Error("PLANE_INVALID");
  if (!databases.has(plane)) databases.set(plane, new Kysely({ dialect: new PostgresDialect({
    pool: new Pool({ host, database: `athyper_${plane}`, user: env.POSTGRES_USER, password, max: 1 }),
  }) }));
  return databases.get(plane)!;
}
try {
  const policy = await db("studio").transaction().setIsolationLevel("repeatable read").execute(async tx => {
    if (probe) {
      await sql`SET LOCAL lock_timeout='5s'`.execute(tx);
      await sql.raw(readFileSync(new URL("../../../../db/ddl/planes/studio/publication/19_human_reviewed_publication.sql", import.meta.url), "utf8")).execute(tx);
      await sql.raw(readFileSync(new URL("../../../../db/ddl/planes/studio/publication/15_system_entity_commands.sql", import.meta.url), "utf8")).execute(tx);
    } else await sql`SET TRANSACTION READ ONLY`.execute(tx);
    const owners = (await sql<{ authority_tenant_id: string }>`SELECT DISTINCT authority_tenant_id
      FROM metadata.entity_product_review_receipt WHERE change_set_id=${approval.entries[0].changeSetId}::uuid`.execute(tx)).rows;
    if (owners.length !== 1) throw Error("AUTHORITY_AMBIGUOUS");
    const tenantId = owners[0]!.authority_tenant_id;
    const actors = (await sql<{ id: string; code: string }>`SELECT id,code FROM master.principal WHERE tenant_id=${tenantId}::uuid
      AND code IN ('dev.metadata.author','dev.metadata.publisher') AND principal_type='service_account'
      AND provisioning_source='internal' AND status='active'`.execute(tx)).rows;
    if (actors.length !== 2) throw Error("WORKLOAD_IDENTITIES_REQUIRED");
    const authorPrincipalId = actors.find(p => p.code === "dev.metadata.author")!.id;
    const publisherPrincipalId = actors.find(p => p.code === "dev.metadata.publisher")!.id;
    const compiler = publicationCompilerIdentity(), members = [], predecessors = [];
    for (const e of approval.entries) {
      const cs = (await sql<{ entity_id: string; base_release_id: string | null }>`SELECT entity_id,base_release_id
        FROM metadata.entity_change_set WHERE id=${e.changeSetId}::uuid AND tenant_id IS NULL AND status='approved'
          AND lock_version=${e.revision} AND submitted_by=${e.submittedBy}::uuid AND approved_by=${e.approvedBy}::uuid`.execute(tx)).rows[0];
      if (!cs) throw Error("APPROVED_SOURCE_CHANGED");
      members.push({ changeSetId: e.changeSetId, entityId: cs.entity_id, revision: e.revision,
        contractHash: e.contractHash, descriptorHash: e.descriptorHash, sourceReleaseId: cs.base_release_id,
        authorId: e.submittedBy, reviewerId: e.approvedBy, targets: e.targets });
      if (cs.base_release_id) {
        const previous = (await sql<any>`SELECT er.id AS "authoringReleaseId",er.release_no::int AS "authoringReleaseNo",
          er.release_hash AS "authoringReleaseHash",pr.id AS "publicationReleaseId",pr.release_no::int AS "publicationReleaseNo",
          pr.release_hash AS "publicationReleaseHash",er.revision_id AS "revisionId",er.contract_hash AS "contractHash",pr.release_key
          FROM metadata.entity_release er JOIN publication.entity_release_link l ON l.entity_release_id=er.id
          JOIN publication.release pr ON pr.id=l.publication_release_id WHERE er.id=${cs.base_release_id}::uuid AND er.tenant_id IS NULL
            AND pr.tenant_id=${tenantId}::uuid AND pr.status IN ('approved','published')`.execute(tx)).rows[0];
        if (!previous) throw Error("SOURCE_PREDECESSOR_UNAVAILABLE");
        const { release_key: publicationKey, ...predecessor } = previous;
        const targets = [];
        for (const pin of e.targets) {
          const readHead = async (target: Kysely<Record<string, never>>) => {
            const head = (await sql<any>`SELECT h.applied_release_id AS "appliedReleaseId",a.source_release_id AS "sourceReleaseId",
              a.source_release_no::int AS "sourceReleaseNo",h.artifact_hash AS "artifactHash",h.row_version::int AS "headVersion"
              FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
              WHERE h.publication_key=${publicationKey} AND a.status='active'`.execute(target)).rows[0];
            if (!head) throw Error("TARGET_PREDECESSOR_UNAVAILABLE");
            return head;
          };
          const head = pin.plane === "studio" ? await readHead(tx) : await db(pin.plane).transaction().execute(async target => {
            await sql`SET TRANSACTION READ ONLY`.execute(target); return readHead(target);
          });
          targets.push({ plane: pin.plane, environment: "local", instance: "dev", publicationKey, ...head });
        }
        predecessors.push({ schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev",
          authorityTenantId: tenantId, policyId: `${policyId}.${e.entityCode}`, revision: 1,
          entityId: cs.entity_id, changeSetId: e.changeSetId, contractHash: e.contractHash, descriptorHash: e.descriptorHash,
          authorPrincipalId, publisherPrincipalId, predecessor, compiler, targets });
      }
    }
    const result = parseHumanReviewedExecutionPolicy({ schema: "athyper.dev-human-reviewed-publication/1", environment: "local", instance: "dev",
      authorityTenantId: tenantId, policyId, revision: 1, authorPrincipalId, publisherPrincipalId, compiler,
      plan: { schema: "athyper.human-reviewed-publication-plan/1", publisherId: publisherPrincipalId, members }, predecessors });
    // Exercise the exact enrollment source admission as the bounded control DB
    // role. This is read-only validation, not authenticated human acceptance.
    await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${approval.entries[0].submittedBy},true),
      set_config('app.database_plane','studio',true)`.execute(tx);
    await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
    await assertHumanReviewedEnrollmentSource(tx, result, tenantId);
    if (probe) throw new RollbackProbe(result);
    return result;
  }).catch(error => { if (error instanceof RollbackProbe) return error.policy; throw error; });
  writeFileSync(resolve(outputPath), JSON.stringify(policy, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output: resolve(outputPath), members: policy.plan.members.length, policyEnrolled: false,
    databaseMode: probe ? "ddl_probe_rolled_back" : "read_only" }));
} finally { await Promise.all([...databases.values()].map(database => database.destroy())); }
