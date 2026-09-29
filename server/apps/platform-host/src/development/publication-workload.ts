import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedIdentity } from "@athyper/server-contract-auth";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import { runWithRequestContext, tryGetRequestContext } from "@athyper/server-foundation/context";
import { ReferenceFirstPublicationWorkflow, EntitySuccessorPublicationWorkflow, assertEntitySuccessorSource, canonicalJson, type ReferenceFirstPublicationPorts } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseEnrollablePublicationPolicy, type EnrollablePublicationPolicy } from "../composition/shared/publication/enrollment-contract.js";
import { assertSuccessorTargetHeads } from "../composition/shared/publication/successor-targets.js";
import { qualifyReferencePublicationTarget } from "../composition/shared/publication/target-qualification.js";
import { createMachinePublicationPolicy, MACHINE_PUBLICATION_PERMISSION, type MachinePublicationPolicyPin } from "../composition/shared/publication/machine-policy.js";
import type { JobPublisher } from "@athyper/server-contract-jobs";

type Database = Kysely<Record<string, never>>;
type Service = Parameters<Parameters<ReferenceFirstPublicationPorts["asWorkload"]>[1]>[0]["service"];
interface WorkloadCredential {
  readonly principalId: string;
  readonly code: string;
  readonly authEpoch: number;
  readonly credentialSha256: string;
}
export interface DevelopmentPublicationWorkloadConfiguration {
  readonly environment: string;
  readonly instance: string;
  readonly domainSuffix: string;
  readonly tenantId: string;
  readonly realmKey: string;
  readonly policyHash: string;
  readonly machinePolicy?: MachinePublicationPolicyPin;
  readonly policy: EnrollablePublicationPolicy;
  readonly author: WorkloadCredential;
  readonly publisher: WorkloadCredential;
}
export interface DevelopmentPublicationWorkloadDependencies {
  readonly jobs?: JobPublisher;
  readonly database: Database;
  /** Scoped authoring service with the global-source preparation adapter. */
  readonly service: Service;
  readonly audit: AuditRecorder<Database>;
  /** A reviewed policy authority, separate from artifact signature verification. */
  readonly policyAuthority: { assertAuthorized(policyHash: string, policy: EnrollablePublicationPolicy): Promise<void> };
  /** Existing platform authorizer; effective grants are loaded from Studio below. */
  readonly authorizer: Authorizer;
  readonly targets: Parameters<typeof qualifyReferencePublicationTarget>[1];
}
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
// Workflow verbs are not IAM catalog codes. Resolve through this closed host
// mapping; never authorize a caller-selected replacement permission.
const authoringPermissions: Readonly<Record<string, string>> = Object.freeze({
  "metadata.entity.author": "studio.metadata.contract.edit",
  "metadata.entity.submit": "studio.metadata.contract.submit",
  "metadata.entity.review": "studio.metadata.contract.review",
  "metadata.entity.publish": "studio.metadata.contract.publish",
});
function requireCondition(value: unknown, code: string): asserts value { if (!value) throw Error(code); }

/** Host adapter only: authenticates real workloads, stamps their request/DB
 * context and writes through the existing audit recorder. No identity creation,
 * permission grants, MFA fabrication, direct activation or product-name branches. */
export function createDevelopmentPublicationWorkload(
  configuration: DevelopmentPublicationWorkloadConfiguration,
  credentials: { author: string; publisher: string },
  dependencies: DevelopmentPublicationWorkloadDependencies,
) {
  const config = structuredClone(configuration), tokens = { ...credentials };
  if (config.policy.schema === "athyper.dev-compilation-recovery-policy/1") throw Error("COMPILATION_RECOVERY_EXECUTOR_REQUIRED");
  parseEnrollablePublicationPolicy(config.policy);
  const machinePolicy = config.machinePolicy ? createMachinePublicationPolicy({ database: dependencies.database,
    tenantId: config.tenantId, environment: config.environment, instance: config.instance, domainSuffix: config.domainSuffix, pin: config.machinePolicy }) : undefined;
  requireCondition(config.environment === "local" && config.instance === "dev" && config.domainSuffix === "dev.athyper.test", "REFERENCE_WORKLOAD_DEV_ONLY");
  requireCondition(uuid.test(config.tenantId) && /^[a-f0-9]{64}$/.test(config.policyHash) && hash(config.policy) === config.policyHash, "REFERENCE_WORKLOAD_POLICY_PIN_INVALID");
  requireCondition(typeof config.realmKey === "string" && /^[a-z][a-z0-9_.-]{0,127}$/.test(config.realmKey), "REFERENCE_WORKLOAD_REALM_REQUIRED");
  for (const role of ["author", "publisher"] as const) {
    const c = config[role];
    requireCondition(c && uuid.test(c.principalId) && typeof c.code === "string" && /^[a-z][a-z0-9_.-]+$/.test(c.code)
      && Number.isSafeInteger(c.authEpoch) && c.authEpoch >= 0 && /^[a-f0-9]{64}$/.test(c.credentialSha256), "REFERENCE_WORKLOAD_CONFIG_INVALID");
    requireCondition(c.principalId === (role === "author" ? config.policy.authorPrincipalId : config.policy.publisherPrincipalId), "REFERENCE_WORKLOAD_POLICY_ACTOR_MISMATCH");
    requireCondition(typeof tokens[role] === "string" && /^[A-Za-z0-9_-]{43}$/.test(tokens[role]), "REFERENCE_WORKLOAD_CREDENTIAL_INVALID");
    const digest = createHash("sha256").update(tokens[role]).digest();
    requireCondition(timingSafeEqual(digest, Buffer.from(c.credentialSha256, "hex")), "REFERENCE_WORKLOAD_AUTHENTICATION_FAILED");
  }
  requireCondition(config.author.principalId !== config.publisher.principalId && config.author.credentialSha256 !== config.publisher.credentialSha256, "REFERENCE_WORKLOAD_DISTINCT_IDENTITIES_REQUIRED");
  const requestId = randomUUID();
  const context = (principalId: string) => ({ requestId, correlationId: requestId, planeKey: "studio" as const, tenantId: config.tenantId, principalId });
  const inDatabase = <T>(principalId: string, work: (db: Database) => Promise<T>) => dependencies.database.transaction().execute(async db => {
    await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_actor_type','service_account',true),
      set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${principalId},true)`.execute(db);
    return work(db);
  });
  const roleFor = (principalId: string): "author" | "publisher" => {
    if (principalId === config.author.principalId) return "author";
    if (principalId === config.publisher.principalId) return "publisher";
    throw Error("REFERENCE_WORKLOAD_ACTOR_UNKNOWN");
  };
  async function checkPrincipal(role: "author" | "publisher") {
    const c = config[role];
    const rows = await inDatabase(c.principalId, async db => (await sql<{ auth_epoch: number }>`SELECT auth_epoch FROM master.principal
      WHERE tenant_id=${config.tenantId}::uuid AND id=${c.principalId}::uuid AND code=${c.code}
        AND principal_type='service_account' AND provisioning_source='internal' AND status='active'`.execute(db)).rows);
    requireCondition(rows.length === 1 && rows[0]!.auth_epoch === c.authEpoch, "REFERENCE_WORKLOAD_REVOKED");
  }
  async function assertPolicy() {
    await (machinePolicy ?? dependencies.policyAuthority).assertAuthorized(config.policyHash, structuredClone(config.policy));
  }
  const assertPolicyAuthorized = async (policy: EnrollablePublicationPolicy) => {
    requireCondition(hash(policy) === config.policyHash, "REFERENCE_WORKLOAD_POLICY_CHANGED");
    await assertPolicy(); await checkPrincipal("author"); await checkPrincipal("publisher");
  };
  const withPublication = <T>(entityId: string, work: () => Promise<T>) => {
    requireCondition(entityId === config.policy.entityId, "REFERENCE_WORKLOAD_ENTITY_MISMATCH");
    return inDatabase(config.author.principalId, async db => {
      const locked = (await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`reference-publication:${entityId}`},0)) AS locked`.execute(db)).rows[0]?.locked;
      requireCondition(locked, "REFERENCE_PUBLICATION_ALREADY_RUNNING");
      if (config.policy.schema === "athyper.dev-entity-successor-policy/1") {
        // Release the source allocation lock before invoking services using
        // independent connections. The outer workflow lock remains held.
        await inDatabase(config.publisher.principalId, tx => assertEntitySuccessorSource(tx, config.policy as Extract<EnrollablePublicationPolicy, { schema: "athyper.dev-entity-successor-policy/1" }>, config.tenantId));
        await assertSuccessorTargetHeads(config.policy.targets, dependencies.targets.databases);
      } else {
        const heads = (await sql`SELECT id FROM metadata.entity_release WHERE entity_id=${entityId}::uuid AND tenant_id IS NULL LIMIT 1`.execute(db)).rows;
        requireCondition(!heads.length, "REFERENCE_PUBLICATION_FIRST_RELEASE_REQUIRED");
      }
      return work();
    });
  };
  const ports: Omit<ReferenceFirstPublicationPorts, "assertPolicyAuthorized" | "withFirstPublication"> = {
    asWorkload: async (principalId, work) => {
      const role = roleFor(principalId); await checkPrincipal(role);
      return runWithRequestContext(context(principalId), () => work({ principalId, service: dependencies.service,
        authorize: async (permission, changeSetId) => {
          const allowed = role === "author" ? ["metadata.entity.author", "metadata.entity.submit"] : ["metadata.entity.review", "metadata.entity.publish"];
          requireCondition(allowed.includes(permission) && changeSetId === config.policy.changeSetId, "REFERENCE_WORKLOAD_SCOPE_DENIED");
          await assertPolicy(); await checkPrincipal(role);
          const source = await dependencies.service.readGraph(changeSetId);
          requireCondition(source.changeSet.tenantId === null && source.changeSet.entityId === config.policy.entityId, "REFERENCE_WORKLOAD_SOURCE_SCOPE_MISMATCH");
          const identity: VerifiedIdentity = { planeKey: "studio", realmKey: config.realmKey, tenantId: config.tenantId, principalId, authEpoch: config[role].authEpoch };
          const permissions = await createKyselyPermissionResolver({
            run: (_identity, work) => inDatabase(principalId, work),
          }).resolve(identity);
          const machinePublish = permission === "metadata.entity.publish" && machinePolicy;
          const decision = await (machinePolicy ? machinePolicy.authorizer(config.policyHash, config.policy) : dependencies.authorizer).authorize({
            context: { ...identity, permissions, profileHash: permissions.profileHash, requestId, correlationId: requestId },
            permissionCode: machinePublish ? MACHINE_PUBLICATION_PERMISSION : authoringPermissions[permission]!,
            resource: { tenantId: config.tenantId, resourceCode: "metadata.entity_change_set", recordId: changeSetId, changeSetId, entityId: config.policy.entityId },
          });
          if (!decision.allowed) console.warn(JSON.stringify({ event: "publication.workload.iam_denied", permission,
            reason: /^[a-z_]{1,100}$/.test(decision.reason ?? "") ? decision.reason : "denied" }));
          requireCondition(decision.allowed, "REFERENCE_WORKLOAD_IAM_DENIED");
        } }));
    },
    qualify: target => qualifyReferencePublicationTarget(target, dependencies.targets),
    record: async event => {
      const ctx = tryGetRequestContext();
      requireCondition(ctx?.principalId && ctx.tenantId === config.tenantId && ctx.planeKey === "studio", "REFERENCE_WORKLOAD_EVIDENCE_CONTEXT_REQUIRED");
      const role = roleFor(ctx.principalId);
      requireCondition(event.schema === (config.policy.schema === "athyper.dev-entity-successor-policy/1" ? "athyper.dev-entity-successor-evidence/1" : "athyper.dev-reference-publication-evidence/1") && hash(event.policy) === config.policyHash
        && (role === "author" ? event.event === "qualified" : ["review_authorized", "dispatched"].includes(String(event.event))), "REFERENCE_WORKLOAD_EVIDENCE_SCOPE_INVALID");
      await assertPolicy(); await checkPrincipal(role);
      const evidence = structuredClone(event);
      await inDatabase(ctx.principalId, async db => {
        const stored = await dependencies.audit.record({ eventCode: `metadata.reference.publication.${event.event}`, action: "reference_metadata_publication",
          outcome: "success", severity: "critical", actor: { kind: "service", principalId: ctx.principalId! }, tenantId: config.tenantId,
          entityType: "metadata.entity_change_set", entityId: config.policy.changeSetId, requestId, correlationId: requestId,
          metadata: { ...evidence, policyHash: config.policyHash, evidenceHash: hash(evidence), sourceTenantId: null, mode: "development_auto_approval" },
        }, db);
        requireCondition(stored.id && stored.actor.principalId === ctx.principalId && stored.tenantId === config.tenantId, "REFERENCE_WORKLOAD_EVIDENCE_NOT_RECORDED");
      });
    },
  };
  return config.policy.schema === "athyper.dev-entity-successor-policy/1"
    ? new EntitySuccessorPublicationWorkflow(config.policy, { ...ports, assertPolicyAuthorized,
      withSuccessorPublication: (policy, work) => withPublication(policy.entityId, work) })
    : new ReferenceFirstPublicationWorkflow(config.policy as Exclude<EnrollablePublicationPolicy, { schema: "athyper.dev-entity-successor-policy/1" | "athyper.dev-compilation-recovery-policy/1" }>, { ...ports, assertPolicyAuthorized, withFirstPublication: withPublication });
}
