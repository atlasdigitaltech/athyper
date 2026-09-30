import type {
  ProcessSelectionPublication,
  ProcessSelectionCompilerPorts,
  ProcessScope,
} from "@athyper/server-contract-control-admin";
import { calculateDefinitionHash } from "@athyper/server-platform-policy";
import { compileProcessSelection } from "./process-selection-compiler.js";
import { sql, type Transaction } from "kysely";

/** A single existing-policy definition. Caller supplies published profile revision identities. */
export function supplierRequirementPolicy(input: {
  readonly id: string;
  readonly tenantId: string;
  readonly version: number;
  readonly effectiveFrom: string;
  readonly ruleIds: Readonly<Record<"basic" | "standard" | "enhanced", string>>;
  readonly profiles: Readonly<
    Record<
      "simple" | "standard" | "enhanced",
      ProcessSelectionPublication["manifests"][number]["profile"]
    >
  >;
}): ProcessSelectionPublication["definition"] {
  const definition: ProcessSelectionPublication["definition"] = {
    id: input.id,
    tenantId: input.tenantId,
    entityType: "supplier_onboarding",
    name: "Supplier onboarding requirement",
    priority: 10,
    evaluationMode: "first_match",
    effectiveFrom: input.effectiveFrom,
    versionNo: input.version,
    rules: (["enhanced", "standard", "basic"] as const).map((level, index) => ({
      id: input.ruleIds[level],
      priority: (index + 1) * 10,
      condition: {
        "===": [{ var: "request.requestedComplianceLevel" }, level],
      },
      action: "require_workflow",
      actionConfig: {
        schema: "athyper.process-selection-result/1",
        profile: input.profiles[level === "basic" ? "simple" : level],
      },
      metadata: {},
    })),
  };
  return { ...definition, definitionHash: calculateDefinitionHash(definition) };
}
type Tx = Transaction<Record<string, never>>;
export function createKyselyProcessSelectionPublicationRepository() {
  return {
    async resolve(
      scope: ProcessScope,
      asOf: string,
      tx: Tx,
    ): Promise<readonly ProcessSelectionPublication[]> {
      const result = await sql<{
        publication: ProcessSelectionPublication;
      }>`SELECT COALESCE(release.publication,base.publication) publication FROM control.process_selection_publication base
        LEFT JOIN LATERAL (SELECT publication FROM control.process_task_rule_release r WHERE r.tenant_id=base.tenant_id AND r.base_publication_id=base.id AND r.activated_at<=${asOf}::timestamptz ORDER BY r.activated_at DESC LIMIT 1) release ON true
        WHERE tenant_id=${scope.tenantId}::uuid AND plane_key=${scope.planeKey} AND process_family=${scope.processFamily}
        AND operating_organization_id=${scope.operatingOrganizationId}::uuid AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
        AND effective_from<=${asOf}::timestamptz AND (effective_until IS NULL OR effective_until>${asOf}::timestamptz)
        ORDER BY id`.execute(tx);
      return result.rows.map((r) => r.publication);
    },
    /** Existing policy authoring/activation precedes this exact compiled binding publication. */
    async publish(
      input: {
        id: string;
        publication: ProcessSelectionPublication;
        effectiveFrom: string;
        effectiveUntil?: string;
        actorPrincipalId: string;
      },
      ports: ProcessSelectionCompilerPorts,
      tx: Tx,
    ) {
      const compiled = await compileProcessSelection(input.publication, ports);
      if (!compiled.valid)
        throw Object.assign(
          new Error("PROCESS_SELECTION_PUBLICATION_INVALID"),
          { issues: compiled.issues },
        );
      const p = compiled.publication,
        s = p.scope;
      // Serialize scope publication, including the initially empty scope, without requiring a mutable head.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([s.tenantId, s.planeKey, s.processFamily, s.operatingOrganizationId, s.companyCodeId])},0))`.execute(
        tx,
      );
      const overlap =
        await sql`SELECT id FROM control.process_selection_publication WHERE tenant_id=${s.tenantId}::uuid
        AND plane_key=${s.planeKey} AND process_family=${s.processFamily} AND operating_organization_id=${s.operatingOrganizationId}::uuid
        AND company_code_id IS NOT DISTINCT FROM ${s.companyCodeId}::uuid
        AND tstzrange(effective_from,effective_until,'[)') && tstzrange(${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,'[)')`.execute(
          tx,
        );
      if (overlap.rows.length)
        throw new Error("PROCESS_SELECTION_PUBLICATION_OVERLAP");
      await sql`INSERT INTO control.process_selection_publication(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,policy_definition_id,policy_version,policy_hash,publication,effective_from,effective_until,created_by)
        VALUES(${input.id}::uuid,${s.tenantId}::uuid,${s.planeKey},${s.processFamily},${s.operatingOrganizationId}::uuid,${s.companyCodeId}::uuid,${p.policy.id}::uuid,${p.policy.version},${p.policy.hash},${JSON.stringify(p)}::jsonb,${input.effectiveFrom}::timestamptz,${input.effectiveUntil ?? null}::timestamptz,${input.actorPrincipalId}::uuid)`.execute(
        tx,
      );
      return compiled;
    },
  };
}
