import { execFileSync } from "node:child_process";
import { parseCompilationRecoveryPolicy } from "@athyper/server-contract-publication";
import { publicationCompilerIdentity } from "../../src/composition/shared/publication/compiler-build.js";
import { captureDevPublicationBaseline } from "@athyper/server-db/tooling/capture-dev-publication-baseline";

// Read-only DEV candidate preparation. Does not enroll, approve, enqueue or edit
// release rows. A failed job is selected explicitly, never inferred from a name.
const args = process.argv.slice(2);
const release = args.find(a => a.startsWith("--release="))?.slice(10);
const failedJob = args.find(a => a.startsWith("--failed-job="))?.slice(13);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
if (args.length !== 2 || !release || !failedJob || !uuid.test(release) || !uuid.test(failedJob)) throw Error("Use --release=<UUID> --failed-job=<UUID>");
const baseline = captureDevPublicationBaseline(release);
const output = execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", 'exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'], {
  input: `BEGIN READ ONLY; SELECT jsonb_build_object('policy',r.metadata->'successorPolicy','hash',r.release_hash)
    FROM publication.release r JOIN ops.job_execution j ON j.tenant_id=r.tenant_id
    WHERE r.id='${release}' AND j.id='${failedJob}' AND j.job_code='publication.compile-artifact'
      AND j.input_payload->>'releaseId'=r.id::text AND j.status IN ('failed','dead_letter') AND j.completed_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM publication.artifact a WHERE a.publication_release_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM publication.artifact_compilation c WHERE c.publication_release_id=r.id); ROLLBACK;`, encoding: "utf8",
});
if (!output.trim()) throw Error("COMPILATION_RECOVERY_EMPTY_FAILED_RELEASE_REQUIRED");
const source = JSON.parse(output.trim()), original = source.policy;
if (original?.schema !== "athyper.dev-entity-successor-policy/1") throw Error("COMPILATION_RECOVERY_SUCCESSOR_REQUIRED");
for (const target of original.targets) {
  const actual = baseline.targets.find((t: { plane: string }) => t.plane === target.plane);
  if (!actual || actual.head.applied_release_id !== target.appliedReleaseId || actual.head.artifact_hash !== target.artifactHash
    || Number(actual.head.row_version) !== target.headVersion) throw Error("COMPILATION_RECOVERY_HEAD_CHANGED");
}
const compiler = publicationCompilerIdentity();
const candidate = parseCompilationRecoveryPolicy({ ...original, schema: "athyper.dev-compilation-recovery-policy/1",
  policyId: `compilation.recovery.${release}.${compiler.buildHash.slice(0, 12)}`, revision: 1,
  failedReleaseId: release, failedReleaseHash: source.hash, failedJobId: failedJob,
  originalCompilerHash: original.compiler.buildHash, compiler, expiresAt: new Date(Date.now() + 4 * 3600000).toISOString() });
console.log(JSON.stringify(candidate, null, 2));
