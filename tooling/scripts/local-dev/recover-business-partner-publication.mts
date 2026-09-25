/** Exact DEV backup recovery, not an authoring/approval shortcut.
 * Default rehearses both database transactions with rollback. --apply commits.
 * Historical signed publication rows are preserved; deployment events are new.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { query, head, record, document, missing, verified } from "./inspect-business-partner-recovery.mjs";

const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some(arg => arg !== "--apply")) throw Error("UNKNOWN_ARGUMENT");
if (!verified || missing.length || head.source_release_id !== "bc6cc765-4ccf-55ea-95ad-155deef86112" || head.artifact_hash !== "6b2334393845724c870c60a51067c57f3f498162d14baf7a9426e7409e399e02") throw Error("RECOVERY_PIN_MISMATCH");
const target = "athyper-dev-db-1", tenant = "44444444-4444-4444-8444-444444444444";
const [actor] = query(target, "athyper_studio", `SELECT id FROM master.principal WHERE tenant_id='${tenant}' AND code='dev.metadata.publisher' AND status='active' AND principal_type='service_account' AND metadata->'devPublication'->>'instance'='dev'`);
if (!actor) throw Error("RECOVERY_WORKLOAD_REQUIRED");
if (query(target, "athyper_neon", "SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key='metadata.compiled_entity.business_partner'").length) throw Error("TARGET_NOT_EMPTY_INSPECT_BEFORE_RETRY");
const quote = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`;
const evidence = { source: "operator-approved-backup-recovery", backup: "dev-qa-pre-rebuild-20260924-hg6ZwJ", originalReleaseId: head.source_release_id, artifactHash: head.artifact_hash, signatureVerified: true, actorId: actor.id, historicalApprovalPreserved: true, freshHumanApprovalClaimed: false };
const begin = `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SELECT set_config('app.current_tenant_id',${quote(tenant)},true),set_config('app.current_principal_id',${quote(actor.id)},true); SELECT pg_advisory_xact_lock(hashtextextended('metadata.compiled_entity.business_partner',0));`;
function run(database: string, statements: string, commit = apply) {
  return execFileSync("docker", ["exec", "-i", target, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: `${begin}\n${statements}\n${commit ? "COMMIT" : "ROLLBACK"};`, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}
const restore = Object.entries({ release: record.release, artifact_compilation: record.compilation, artifact: record.artifact }).map(([table, row]: [string, any]) => {
  if (query(target, "athyper_studio", `SELECT 1 FROM publication.${table} WHERE id=${quote(row.id)}::uuid`).length) throw Error("RECOVERY_SOURCE_ALREADY_PRESENT_INSPECT_BEFORE_RETRY");
  return `INSERT INTO publication.${table} SELECT * FROM jsonb_populate_record(NULL::publication.${table},${json(row)});`;
}).join("\n");
const commandId = randomUUID(), correlationId = randomUUID();
const studioResult = run("athyper_studio", `${restore}
SELECT 'DEPLOYMENT:'||id::text FROM publication.fn_create_deployment(${quote(commandId)}::uuid,${quote(record.artifact.id)}::uuid,'neon','development','athyper_neon',1,${quote(correlationId)}::uuid,${quote(actor.id)}::uuid);`);
const deploymentId = studioResult.match(/DEPLOYMENT:([a-f0-9-]{36})/)?.[1];
if (!deploymentId) throw Error("RECOVERY_DEPLOYMENT_NOT_CREATED");
const verification = { signature_verified: true, manifest_valid: true, runtime_compatible: true, target_plane: "neon", payload_hash: document.manifest.payloadSha256, payload_schema_version: "2.0", signature_algorithm: record.artifact.signature_algorithm, signing_key_id: record.artifact.signing_key_id };
const neonResult = run("athyper_neon", `
SELECT set_config('app.database_plane','neon',true);
DO $recovery$ DECLARE staged runtime_meta.applied_release; checked runtime_meta.applied_release; BEGIN
 IF EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key='metadata.compiled_entity.business_partner') THEN RAISE EXCEPTION 'TARGET_NOT_EMPTY'; END IF;
 staged := runtime_meta.fn_stage_release_projection(${quote(head.publication_key)},${quote(head.source_release_id)}::uuid,${Number(head.source_release_no)},${quote(deploymentId)}::uuid,${quote(head.artifact_hash)},${json(document.manifest)},${json(document.projection)});
 checked := runtime_meta.fn_verify_release(staged.id,${quote(head.artifact_hash)},${json(verification)});
 IF checked.status<>'verified' THEN RAISE EXCEPTION 'RECOVERY_VERIFICATION_FAILED'; END IF;
 PERFORM runtime_meta.fn_activate_release(staged.id,${json(evidence)});
END $recovery$;
SELECT 'APPLIED:'||applied_release_id::text FROM runtime_meta.release_activation_head WHERE publication_key='metadata.compiled_entity.business_partner';`);
const appliedId = neonResult.match(/APPLIED:([a-f0-9-]{36})/)?.[1];
if (!appliedId) throw Error("RECOVERY_ACTIVATION_NOT_CONFIRMED");
if (apply) {
  run("athyper_studio", ["dispatched", "received", "staged", "verified", "activated"].map(status => `SELECT publication.fn_transition_deployment(${quote(deploymentId)}::uuid,${quote(status)}::publication.deployment_status_d,${json(evidence)});`).join("\n") + `\nSELECT publication.fn_acknowledge_activation(${quote(deploymentId)}::uuid,'athyper_neon',${quote(head.artifact_hash)},${quote(appliedId)}::uuid,${json(evidence)});`);
}
console.log(JSON.stringify({ mode: apply ? "recovered" : "rehearsed-and-rolled-back", releaseId: head.source_release_id, releaseNo: head.source_release_no, artifactHash: head.artifact_hash, deploymentId, appliedId, businessDataRestored: false, iamChanged: false }));
