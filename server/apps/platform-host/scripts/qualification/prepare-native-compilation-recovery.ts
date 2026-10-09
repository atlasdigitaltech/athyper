import { execFileSync } from "node:child_process";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { publicationCompilerIdentity } from "../../src/composition/shared/publication/compiler-build.js";
import { parseNativeCompilationRecoveryPolicy } from "../../src/composition/shared/publication/native-compilation-recovery-policy.js";
import { parseHumanReviewedExecutionPolicy } from "../../src/composition/shared/publication/human-publication-policy.js";
// Read-only preparation, never approval. Explicit failed jobs must cover the original group.
const args = process.argv.slice(2),
  original = args.find((a) => a.startsWith("--original-policy="))?.slice(18),
  jobs = args
    .filter((a) => a.startsWith("--failed-job="))
    .map((a) => a.slice(13));
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
if (
  !original ||
  !uuid.test(original) ||
  !jobs.length ||
  jobs.some((j) => !uuid.test(j)) ||
  args.length !== jobs.length + 1
)
  throw Error(
    "Use --original-policy=<UUID> --failed-job=<UUID> (one per release)",
  );
const q = (input: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "sh",
      "-c",
      'exec psql -XqAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1',
    ],
    { input, encoding: "utf8" },
  );
const rows = JSON.parse(
  q(`BEGIN READ ONLY; SELECT jsonb_build_object('id',d.id,'version',d.version_no,'hash',d.definition_hash,'policy',rule.action_config->'policy','releases',(
 SELECT jsonb_agg(jsonb_build_object('releaseId',r.id,'releaseHash',r.release_hash,'changeSetId',er.change_set_id,'failedJobId',j.id))
 FROM publication.release r JOIN publication.entity_release_link l ON l.publication_release_id=r.id JOIN metadata.entity_release er ON er.id=l.entity_release_id
 JOIN ops.job_execution j ON j.tenant_id=r.tenant_id AND j.input_payload->>'releaseId'=r.id::text
 WHERE r.metadata->>'executionPolicyId'=d.id::text AND j.id IN (${jobs.map((j) => `'${j}'::uuid`).join(",")})
 AND j.job_code='publication.compile-artifact' AND j.status IN ('failed','dead_letter') AND j.completed_at IS NOT NULL AND j.error_code IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=r.id)))
 FROM control.policy_definition d JOIN control.policy_rule rule ON rule.policy_definition_id=d.id
 WHERE d.id='${original}' AND d.status='active'; ROLLBACK;`).trim(),
);
const source = parseHumanReviewedExecutionPolicy(rows.policy),
  compiler = publicationCompilerIdentity();
if (
  rows.releases?.length !== source.plan.members.length ||
  rows.releases.length !== jobs.length ||
  rows.releases.some(
    (r: { changeSetId: string }) =>
      !source.plan.members.some((m) => m.changeSetId === r.changeSetId),
  )
)
  throw Error("NATIVE_COMPILATION_RECOVERY_GROUP_REQUIRED");
console.log(
  JSON.stringify(
    parseNativeCompilationRecoveryPolicy({
      schema: "athyper.dev-native-compilation-recovery/1",
      policyId: `native.recovery.${original}.${compiler.buildHash.slice(0, 12)}`,
      revision: 1,
      environment: "local",
      instance: "dev",
      authorityTenantId: source.authorityTenantId,
      authorPrincipalId: source.authorPrincipalId,
      publisherPrincipalId: source.publisherPrincipalId,
      compiler,
      originalPolicy: {
        id: rows.id,
        version: rows.version,
        hash: rows.hash,
        compilerHash: source.compiler.buildHash,
        coordinationHash: sha256(source.plan),
      },
      expiresAt: new Date(Date.now() + 4 * 3600000).toISOString(),
      releases: rows.releases,
    }),
    null,
    2,
  ),
);
