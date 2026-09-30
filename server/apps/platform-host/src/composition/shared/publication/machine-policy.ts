import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { calculateDefinitionHash, createKyselyPolicyRepository, createJsonRuleEvaluator } from "@athyper/server-platform-policy";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseEnrollablePublicationPolicy, type EnrollablePublicationPolicy } from "./enrollment-contract.js";
import { assertPublicationCompilerIdentity } from "./compiler-build.js";
import { assertCompilationRecoveryWindow } from "@athyper/server-contract-publication";

export const MACHINE_PUBLICATION_PERMISSION = "studio.metadata.contract.publish_automated";
export interface MachinePublicationPolicyPin { readonly id: string; readonly version: number; readonly hash: string }
const digest = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** A distinct machine permission plus an independently enrolled exact policy.
 * Never overrides the human publish permission, fabricates MFA or grants roles.
 * Reads the existing policy store; revocation/active-head changes deny retries.
 */
export function createMachinePublicationPolicy(options: {
  database: Kysely<Record<string, never>>; tenantId: string;
  environment: string; instance: string; domainSuffix: string;
  pin: MachinePublicationPolicyPin;
}) {
  const { database } = options;
  const config = structuredClone({ ...options, database: undefined });
  if (config.environment !== "local" || config.instance !== "dev" || config.domainSuffix !== "dev.athyper.test") throw Error("MACHINE_PUBLICATION_DEV_ONLY");
  if (!uuid.test(config.tenantId) || !uuid.test(config.pin.id) || !Number.isSafeInteger(config.pin.version) || config.pin.version < 1 || !/^[a-f0-9]{64}$/.test(config.pin.hash)) throw Error("MACHINE_PUBLICATION_PIN_INVALID");
  const assertAuthorized = async (policyHash: string, input: EnrollablePublicationPolicy) => {
    const policy = parseEnrollablePublicationPolicy(input);
    if (policy.schema === "athyper.dev-compilation-recovery-policy/1") assertCompilationRecoveryWindow(policy);
    if ("compiler" in policy) assertPublicationCompilerIdentity(policy.compiler);
    if (digest(policy) !== policyHash || ("authorityTenantId" in policy && policy.authorityTenantId !== config.tenantId)) throw Error("MACHINE_PUBLICATION_POLICY_MISMATCH");
    await database.transaction().setIsolationLevel("repeatable read").execute(async tx => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${policy.publisherPrincipalId},true)`.execute(tx);
      const definition = await createKyselyPolicyRepository().findExact!({ planeKey: "studio", tenantId: config.tenantId,
        entityType: "metadata.publication", effectiveOn: new Date().toISOString().slice(0, 10), revision: config.pin }, tx);
      if (!definition || calculateDefinitionHash(definition) !== config.pin.hash || definition.rules.length !== 1) throw Error("MACHINE_PUBLICATION_POLICY_UNAVAILABLE");
      const rule = definition.rules[0]!;
      const enrolled = rule.actionConfig;
      if (rule.action !== "allow" || enrolled.schema !== "athyper.machine-publication-enrollment/1" || enrolled.environment !== "dev"
        || enrolled.permissionCode !== MACHINE_PUBLICATION_PERMISSION || enrolled.tenantId !== config.tenantId || digest(enrolled.policy) !== policyHash)
        throw Error("MACHINE_PUBLICATION_ENROLLMENT_MISMATCH");
      // Existing policy authoring activates by setting status=active and stamping
      // updated_by after maker/checker validation; it does not write a publication head.
      const active = (await sql<{ active: boolean }>`SELECT control.publication_policy_enrollment_is_active(
        ${config.pin.id}::uuid,${config.pin.hash},${policy.authorPrincipalId}::uuid,${policy.publisherPrincipalId}::uuid) AS active`.execute(tx)).rows;
      if (active.length !== 1 || active[0]?.active !== true) throw Error("MACHINE_PUBLICATION_ENROLLMENT_NOT_ACTIVE");
      const matched = createJsonRuleEvaluator().evaluate(rule.condition, { environment: "dev", tenantId: config.tenantId, policyHash, policy });
      if (matched !== true) throw Error("MACHINE_PUBLICATION_POLICY_DENIED");
    });
  };
  return {
    assertAuthorized,
    authorizer(policyHash: string, policy: EnrollablePublicationPolicy) {
      return createPermissionAuthorizer({ policyGate: { async evaluate(input) {
        if (policy.schema === "athyper.dev-compilation-recovery-policy/1" && input.permissionCode !== MACHINE_PUBLICATION_PERMISSION)
          return { allowed: false, reason: "machine_publication_scope_denied" };
        const authoring = ["studio.metadata.contract.edit", "studio.metadata.contract.submit"].includes(input.permissionCode);
        const reviewing = input.permissionCode === "studio.metadata.contract.review";
        if ((!authoring && !reviewing && input.permissionCode !== MACHINE_PUBLICATION_PERMISSION) || input.context.planeKey !== "studio" || input.context.tenantId !== config.tenantId
          || input.context.principalId !== (authoring ? policy.authorPrincipalId : policy.publisherPrincipalId) || input.resource?.changeSetId !== policy.changeSetId || input.resource?.entityId !== policy.entityId)
          return { allowed: false, reason: "machine_publication_scope_denied" };
        await assertAuthorized(policyHash, policy);
        const reviewed = await database.transaction().execute(async tx => {
          await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${input.context.principalId},true)`.execute(tx);
          // Trusted importers retain their real maker identity. Submission and
          // approval belong to the enrolled workloads; the reviewer must still
          // differ from BOTH the original maker and the submitting workload.
          const rows = (await sql<{ created_by: string; submitted_by: string; approved_by: string }>`SELECT created_by,submitted_by,approved_by
            FROM metadata.entity_change_set WHERE id=${policy.changeSetId}::uuid AND entity_id=${policy.entityId}::uuid
            AND tenant_id IS NULL ${policy.schema === "athyper.dev-compilation-recovery-policy/1" ? sql`AND status='published'` : authoring ? sql`AND status IN ('draft','in_review','approved')` : reviewing ? sql`AND status IN ('in_review','approved')` : sql`AND status='approved'`}`.execute(tx)).rows;
          const source = rows.length === 1 ? rows[0] : undefined;
          if (authoring) return !!source?.created_by && source.created_by !== policy.publisherPrincipalId
            && (!source.submitted_by || source.submitted_by === policy.authorPrincipalId)
            && (!source.approved_by || source.approved_by === policy.publisherPrincipalId);
          if (reviewing) return !!source?.created_by && source.created_by !== policy.publisherPrincipalId
            && source.submitted_by === policy.authorPrincipalId && (!source.approved_by || source.approved_by === policy.publisherPrincipalId);
          return !!source?.created_by && source.submitted_by === policy.authorPrincipalId
            && source.approved_by === policy.publisherPrincipalId
            && source.approved_by !== source.created_by && source.approved_by !== source.submitted_by;
        });
        if (!reviewed) return { allowed: false, reason: "machine_publication_review_required" };
        return { allowed: true, sodSatisfied: true };
      } } });
    },
  };
}
