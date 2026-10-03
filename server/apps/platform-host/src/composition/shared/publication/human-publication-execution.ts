import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { sql, type Transaction } from "kysely";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import { createKyselyPermissionResolver, createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { createKyselyPolicyRepository, calculateDefinitionHash, createJsonRuleEvaluator } from "@athyper/server-platform-policy";
import { canonicalJson, publishHumanReviewedProducts, type HumanReviewedPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseHumanReviewedExecutionPolicy, type HumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";
import { MACHINE_PUBLICATION_PERMISSION, type MachinePublicationPolicyPin } from "./machine-policy.js";
import { qualifyReferencePublicationTarget } from "./target-qualification.js";
import { assertSuccessorTargetHeads } from "./successor-targets.js";
import type { DevelopmentPublicationWorkloadConfiguration, DevelopmentPublicationWorkloadDependencies } from "../../../development/publication-workload.js";

type Configuration = Omit<DevelopmentPublicationWorkloadConfiguration, "policy" | "policyHash" | "machinePolicy">;
type Database = Transaction<Record<string, never>>;
const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
function requireExecution(condition: unknown, code: string): asserts condition {
  if (!condition) throw Error(`HUMAN_PUBLICATION_${code}`);
}

/** Existing authenticated workload transport, policy store, IAM, native source
 * service and job adapter. Workloads never adopt/submit/approve human drafts. */
export async function executeHumanReviewedPublication(configuration: Configuration, credentials: { author: string; publisher: string },
  input: HumanReviewedExecutionPolicy, pin: MachinePublicationPolicyPin, dependencies: DevelopmentPublicationWorkloadDependencies) {
  const config = structuredClone(configuration), policy = parseHumanReviewedExecutionPolicy(input), policyHash = digest(policy);
  requireExecution(config.environment === "local" && config.instance === "dev" && config.domainSuffix === "dev.athyper.test"
    && config.tenantId === policy.authorityTenantId && config.author.principalId === policy.authorPrincipalId
    && config.publisher.principalId === policy.publisherPrincipalId, "EXECUTION_SCOPE_DENIED");
  for (const role of ["author", "publisher"] as const) {
    requireExecution(/^[A-Za-z0-9_-]{43}$/.test(credentials[role]) && /^[a-f0-9]{64}$/.test(config[role].credentialSha256)
      && timingSafeEqual(createHash("sha256").update(credentials[role]).digest(), Buffer.from(config[role].credentialSha256, "hex")), "WORKLOAD_AUTHENTICATION_FAILED");
  }
  requireExecution(config.author.credentialSha256 !== config.publisher.credentialSha256, "DISTINCT_CREDENTIALS_REQUIRED");
  const requestId = randomUUID();
  const inDatabase = <T>(principalId: string, work: (tx: Database) => Promise<T>) => dependencies.database.transaction().execute(async tx => {
    await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${principalId},true),
      set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true)`.execute(tx);
    return work(tx);
  });
  const asPublisher = <T>(work: (tx: Database) => Promise<T>) => inDatabase(config.publisher.principalId, work);
  async function enrolled() {
    assertPublicationCompilerIdentity(policy.compiler);
    for (const role of ["author", "publisher"] as const) await inDatabase(config[role].principalId, async tx => {
      const rows = (await sql`SELECT id FROM master.principal WHERE id=${config[role].principalId}::uuid AND tenant_id=${config.tenantId}::uuid
        AND code=${config[role].code} AND principal_type='service_account' AND provisioning_source='internal'
        AND status='active' AND auth_epoch=${config[role].authEpoch}`.execute(tx)).rows;
      requireExecution(rows.length === 1, "WORKLOAD_REVOKED");
    });
    await asPublisher(async tx => {
      const definition = await createKyselyPolicyRepository().findExact!({ planeKey: "studio", tenantId: config.tenantId,
        entityType: "metadata.publication", effectiveOn: new Date().toISOString().slice(0, 10), revision: pin }, tx);
      requireExecution(definition && calculateDefinitionHash(definition) === pin.hash && definition.rules.length === 1, "ENROLLMENT_UNAVAILABLE");
      const rule = definition.rules[0]!, enrolled = rule.actionConfig;
      requireExecution(rule.action === "allow" && enrolled.schema === "athyper.machine-publication-enrollment/1"
        && enrolled.environment === "dev" && enrolled.tenantId === config.tenantId && enrolled.permissionCode === MACHINE_PUBLICATION_PERMISSION
        && digest(enrolled.policy) === policyHash && createJsonRuleEvaluator().evaluate(rule.condition,
          { environment: "dev", tenantId: config.tenantId, policyHash }) === true, "ENROLLMENT_CHANGED");
      const active = (await sql<{ active: boolean }>`SELECT control.publication_policy_enrollment_is_active(${pin.id}::uuid,${pin.hash},
        ${config.author.principalId}::uuid,${config.publisher.principalId}::uuid) active`.execute(tx)).rows[0]?.active;
      requireExecution(active === true, "ENROLLMENT_REVOKED");
    });
  }
  const completed = new Set<string>();
  const ports: HumanReviewedPublicationPorts = {
    service: dependencies.service,
    async authorize(plan) {
      requireExecution(digest(plan) === digest(policy.plan), "PLAN_CHANGED");
      await enrolled();
      const identity = { planeKey: "studio" as const, realmKey: config.realmKey, tenantId: config.tenantId,
        principalId: config.publisher.principalId, authEpoch: config.publisher.authEpoch };
      const permissions = await createKyselyPermissionResolver({ run: (_identity, work) => asPublisher(work) }).resolve(identity);
      const authorizer = createPermissionAuthorizer({ policyGate: { async evaluate(input) {
        if (input.permissionCode !== MACHINE_PUBLICATION_PERMISSION || input.context.principalId !== policy.publisherPrincipalId
          || input.context.tenantId !== config.tenantId || input.context.planeKey !== "studio"
          || !policy.plan.members.some(m => m.changeSetId === input.resource?.changeSetId && m.entityId === input.resource?.entityId))
          return { allowed: false, reason: "human_publication_scope_denied" };
        await enrolled(); return { allowed: true, sodSatisfied: true };
      } } });
      for (const member of plan.members) {
        const decision = await authorizer.authorize({ context: { ...identity, permissions, profileHash: permissions.profileHash,
          requestId, correlationId: requestId }, permissionCode: MACHINE_PUBLICATION_PERMISSION,
        resource: { tenantId: config.tenantId, changeSetId: member.changeSetId, entityId: member.entityId,
          resourceCode: "metadata.entity_change_set", recordId: member.changeSetId } });
        requireExecution(decision.allowed, "IAM_DENIED");
      }
    },
    locked: (ids, work) => asPublisher(async tx => {
      for (const id of ids) {
        const locked = (await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`reference-publication:${id}`},0)) locked`.execute(tx)).rows[0]?.locked;
        requireExecution(locked, "ALREADY_RUNNING");
      }
      return work();
    }),
    reviews: member => asPublisher(async tx => {
      const value = (await sql<{ value: Awaited<ReturnType<HumanReviewedPublicationPorts["reviews"]>> }>`SELECT
        publication.fn_human_publication_review_evidence(${member.changeSetId}::uuid) value`.execute(tx)).rows[0]?.value;
      requireExecution(value && Array.isArray(value.receipts), "HUMAN_RECEIPTS_REQUIRED"); return value;
    }),
    completed: member => asPublisher(async tx => {
      const rows = (await sql<{ id: string; release_no: number; execution: { policyHash: string; coordinationHash: string } }>`SELECT er.id,er.release_no::int,
        publication.fn_human_execution_context(pr.id) execution FROM metadata.entity_release er
        JOIN publication.entity_release_link link ON link.entity_release_id=er.id JOIN publication.release pr ON pr.id=link.publication_release_id
        WHERE er.change_set_id=${member.changeSetId}::uuid AND er.entity_id=${member.entityId}::uuid AND er.tenant_id IS NULL
          AND er.published_by=${config.publisher.principalId}::uuid
          AND pr.metadata->>'sourceDescriptorHash'=${member.descriptorHash} AND pr.metadata->>'sourceContractHash'=${member.contractHash}
          AND er.supersedes_release_id IS NOT DISTINCT FROM ${member.sourceReleaseId}::uuid
          AND pr.tenant_id=${config.tenantId}::uuid AND pr.metadata->>'executionPolicyId'=${pin.id}`.execute(tx)).rows;
      requireExecution(rows.length <= 1, "RECOVERY_AMBIGUOUS");
      if (!rows.length) return null;
      const row = rows[0]!;
      requireExecution(row.execution?.policyHash === pin.hash && row.execution.coordinationHash === digest(policy.plan), "RECOVERY_POLICY_CHANGED");
      completed.add(member.changeSetId); return { id: row.id, releaseNo: row.release_no };
    }),
    redispatch: async (member, release) => {
      await enrolled();
      requireExecution(dependencies.service.redispatch, "REDISPATCH_UNAVAILABLE");
      await dependencies.service.redispatch({ releaseId: release.id, targetPlanes: member.targets.map(t => t.plane) });
    },
    qualify: async targets => {
      await assertSuccessorTargetHeads(policy.predecessors.filter(p => !completed.has(p.changeSetId)).flatMap(p => [...p.targets]), dependencies.targets.databases);
      for (const target of targets) await qualifyReferencePublicationTarget(target, dependencies.targets,
        targets.filter(t => t.targetPlane === target.targetPlane));
    },
    record: event => asPublisher(async tx => {
      const result = await dependencies.audit.record({ eventCode: "metadata.entity.product.publication", action: "human_reviewed_publication",
        actor: { kind: "service", principalId: config.publisher.principalId }, tenantId: config.tenantId,
        outcome: "success", severity: "critical", requestId, correlationId: requestId,
        entityType: "control.policy_definition", entityId: pin.id, metadata: { ...event, policyId: pin.id, policyHash: pin.hash,
          humanApprovalPreserved: true } }, tx);
      requireExecution(result.id && result.actor.principalId === config.publisher.principalId && result.tenantId === config.tenantId, "AUDIT_REQUIRED");
    }),
  };
  return runWithRequestContext({ requestId, correlationId: requestId, planeKey: "studio", tenantId: config.tenantId,
    principalId: config.publisher.principalId }, () => publishHumanReviewedProducts(policy.plan, ports));
}
