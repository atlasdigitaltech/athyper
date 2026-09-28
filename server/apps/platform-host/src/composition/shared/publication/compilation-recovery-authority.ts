import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { parseCompilationRecoveryPolicy, type CompilationRecoveryPolicy } from "@athyper/server-contract-publication";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createMachinePublicationPolicy, MACHINE_PUBLICATION_PERMISSION, type MachinePublicationPolicyPin } from "./machine-policy.js";
import { assertCompilationRecoverySource } from "./compilation-recovery-source.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";

type Database = Kysely<Record<string, never>>;
export async function authorizeCompilationRecovery(database: Database, config: PublicationWorkloadConfiguration,
  policy: CompilationRecoveryPolicy, pin: MachinePublicationPolicyPin, requireEmpty: boolean) {
  if (policy.authorityTenantId !== config.tenantId || policy.authorPrincipalId !== config.author.principalId
    || policy.publisherPrincipalId !== config.publisher.principalId) throw Error("COMPILATION_RECOVERY_ACTOR_MISMATCH");
  const digest = createHash("sha256").update(canonicalJson(policy)).digest("hex");
  const machine = createMachinePublicationPolicy({ database, ...config, pin });
  await machine.assertAuthorized(digest, policy);
  const run = <T>(work: (tx: Database) => Promise<T>) => database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${config.tenantId},true),
      set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
    return work(tx);
  });
  await run(async tx => {
    for (const actor of [config.author, config.publisher]) {
      const rows = (await sql`SELECT id FROM master.principal WHERE tenant_id=${config.tenantId}::uuid
        AND id=${actor.principalId}::uuid AND code=${actor.code} AND auth_epoch=${actor.authEpoch}
        AND principal_type='service_account' AND provisioning_source='internal' AND status='active'`.execute(tx)).rows;
      if (rows.length !== 1) throw Error("COMPILATION_RECOVERY_ACTOR_REVOKED");
    }
  });
  const identity = { planeKey: "studio" as const, realmKey: config.realmKey, tenantId: config.tenantId,
    principalId: config.publisher.principalId, authEpoch: config.publisher.authEpoch };
  const permissions = await createKyselyPermissionResolver({ run: (_identity, work) => run(work) }).resolve(identity);
  const requestId = randomUUID();
  const decision = await machine.authorizer(digest, policy).authorize({
    context: { ...identity, permissions, profileHash: permissions.profileHash, requestId, correlationId: requestId },
    permissionCode: MACHINE_PUBLICATION_PERMISSION,
    resource: { tenantId: config.tenantId, recordId: policy.changeSetId, changeSetId: policy.changeSetId, entityId: policy.entityId },
  });
  if (!decision.allowed) throw Error("COMPILATION_RECOVERY_IAM_DENIED");
  const graph = await run(tx => assertCompilationRecoverySource(tx, policy, requireEmpty));
  return { graph, evidence: { ...pin, policyHash: digest, compilerHash: policy.compiler.buildHash } };
}

/** Exact release lookup; do not select a best match or fall back after denial. */
export async function findCompilationRecovery(database: Database, config: PublicationWorkloadConfiguration, releaseId: string) {
  const candidates = await database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
    return (await sql<{ id: string; version: number; hash: string; policy: unknown }>`SELECT d.id,d.version_no version,d.definition_hash hash,r.action_config->'policy' policy
      FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
      WHERE d.tenant_id=${config.tenantId}::uuid AND d.entity_type='metadata.publication' AND d.status IN ('active','published')
        AND r.action_config#>>'{policy,schema}'='athyper.dev-compilation-recovery-policy/1'
        AND r.action_config#>>'{policy,failedReleaseId}'=${releaseId}`.execute(tx)).rows;
  });
  if (candidates.length !== 1) throw Error("COMPILATION_RECOVERY_EXACT_AUTHORITY_REQUIRED");
  const candidate = candidates[0]!;
  const policy = parseCompilationRecoveryPolicy(candidate.policy);
  return authorizeCompilationRecovery(database, config, policy,
    { id: candidate.id, version: Number(candidate.version), hash: candidate.hash }, false);
}
