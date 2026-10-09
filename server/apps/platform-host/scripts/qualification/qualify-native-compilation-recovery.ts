import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseNativeCompilationRecoveryPolicy } from "../../src/composition/shared/publication/native-compilation-recovery-policy.js";
import { validateNativeRecoverySource } from "../../src/composition/shared/publication/native-compilation-recovery-source.js";
// Actual DEV rows, application effective roles, rollback-only candidate DDL.
// This is database qualification, not authenticated policy enrollment or approval.
const args = process.argv.slice(2);
if (args.length !== 1 || !args[0]?.startsWith("--candidate="))
  throw Error("Use --candidate=<private JSON file>");
const policy = parseNativeCompilationRecoveryPolicy(
  JSON.parse(readFileSync(args[0].slice(12), "utf8")),
);
const ddl = readFileSync(
  new URL(
    "../../../../db/ddl/planes/studio/publication/39_native_compilation_recovery.sql",
    import.meta.url,
  ),
  "utf8",
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
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const literal = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const statements = [`BEGIN; SET LOCAL lock_timeout='5s'; ${ddl}`];
const negatives = [
  { ...policy, authorityTenantId: "00000000-0000-4000-8000-000000000001" },
  { ...policy, expiresAt: "2000-01-01T00:00:00.000Z" },
  {
    ...policy,
    originalPolicy: { ...policy.originalPolicy, hash: "0".repeat(64) },
  },
  { ...policy, releases: policy.releases.slice(1) },
  {
    ...policy,
    releases: policy.releases.map((r, i) =>
      i ? r : { ...r, releaseHash: "0".repeat(64) },
    ),
  },
  {
    ...policy,
    releases: policy.releases.map((r, i) =>
      i ? r : { ...r, failedJobId: "00000000-0000-4000-8000-000000000001" },
    ),
  },
];
// Control role uses the actual original human proposer; no identity is invented.
const author = q(
  `SELECT metadata#>>'{humanExecutionPolicy,plan,members,0,authorId}' FROM publication.release WHERE id='${policy.releases[0]!.releaseId}'::uuid;`,
).trim();
if (!/^[a-f0-9-]{36}$/.test(author)) throw Error("ORIGINAL_AUTHOR_REQUIRED");
for (const [role, actor] of [
  ["athyper_runtime", policy.publisherPrincipalId],
  ["athyper_control_api", author],
]) {
  statements.push(
    `SET LOCAL ROLE ${role}; SELECT set_config('app.current_tenant_id','${policy.authorityTenantId}',true),set_config('app.current_principal_id','${actor}',true); SELECT jsonb_build_object('login',session_user,'role',current_user,'source',publication.fn_native_compilation_recovery_source(${literal(policy)},true));`,
  );
  if (role === "athyper_runtime")
    statements.push(`SELECT set_config('app.current_actor_type','service_account',true);
    SELECT audit.append_event(p_event_code := 'metadata.reference.publication.review_authorized',p_operation := 'execute'::audit.operation_d,p_entity_type := 'control.policy_definition',p_entity_id := '${policy.originalPolicy.id}'::uuid,p_outcome := 'success'::audit.outcome_d,p_severity := 'critical'::audit.event_severity_d,p_context := '{"schema":"athyper.native-compilation-recovery-database-proof/1","rollbackOnly":true}'::jsonb);`);
  for (const changed of negatives)
    statements.push(`DO $test$ BEGIN
   BEGIN PERFORM publication.fn_native_compilation_recovery_source(${literal(changed)},true);
   EXCEPTION WHEN SQLSTATE '42501' OR no_data_found THEN RETURN; END;
   RAISE EXCEPTION 'NEGATIVE_RECOVERY_ACCEPTED'; END $test$;`);
  statements.push(`SELECT set_config('app.current_principal_id','00000000-0000-4000-8000-000000000001',true); DO $test$ BEGIN
 BEGIN PERFORM publication.fn_native_compilation_recovery_source(${literal(policy)},true); EXCEPTION WHEN SQLSTATE '42501' THEN RETURN; END;
 RAISE EXCEPTION 'UNKNOWN_ACTOR_ACCEPTED'; END $test$; RESET ROLE;`);
}
statements.push("ROLLBACK;");
const output = q(statements.join("\n")),
  rows = output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
if (rows.length !== 2) throw Error("ROLE_EVIDENCE_MISSING");
for (const row of rows) validateNativeRecoverySource(policy, row.source, true);
console.log(
  JSON.stringify(
    {
      schema: "athyper.native-compilation-recovery-database-proof/1",
      mode: "rollback-only",
      roles: rows.map((r) => ({ login: r.login, effectiveRole: r.role })),
      releases: policy.releases.map((r) => r.releaseId),
      positiveChecks: 2,
      rollbackOnlyAuditContractCheck: true,
      negativeChecks: 14,
      sourceAndReleaseMutation: false,
    },
    null,
    2,
  ),
);
