import type {
  ProcessRevision,
  ProcessScope,
} from "@athyper/server-contract-control-admin";
import type { CompiledWorkflowDefinition } from "@athyper/server-contract-workflow";
import { processCatalogContentHash } from "@athyper/server-platform-control-admin";
import { workflowDefinitionHash } from "@athyper/server-platform-workflow";
import { sql, type Transaction } from "kysely";

/** A reviewer-policy publication contains the workflow owner's compiled artifact.
 * Resolve immutable task revisions, never the case-wide active workflow head.
 * P3 can consume the returned definition when creating task-owned work items.
 */
export async function readSupplierProcessWorkflow(
  revision: ProcessRevision,
  scope: ProcessScope,
  tx: Transaction<Record<string, never>>,
): Promise<CompiledWorkflowDefinition | undefined> {
  if (
    scope.planeKey !== "neon" ||
    scope.processFamily !== "supplier_onboarding"
  )
    return undefined;
  const pin = revision as ProcessRevision & {
    definitionId?: string;
    code?: string;
  };
  const row = (
    await sql<{
      content_hash: string;
      definition: {
        workflowDefinitionId: string;
        workflow: CompiledWorkflowDefinition;
      };
    }>`SELECT content_hash,definition FROM control.process_selection_catalog_revision
    WHERE tenant_id=${scope.tenantId}::uuid AND plane_key=${scope.planeKey}
      AND process_family=${scope.processFamily} AND operating_organization_id=${scope.operatingOrganizationId}::uuid
      AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
      AND kind='reviewer_policy' AND id=${revision.id}::uuid AND version=${revision.version}`.execute(
      tx,
    )
  ).rows[0];
  if (!row || processCatalogContentHash(row.definition) !== row.content_hash)
    return undefined;
  const compiled = row.definition.workflow;
  if (
    !compiled ||
    row.definition.workflowDefinitionId !== pin.definitionId ||
    compiled.code !== pin.code ||
    compiled.version !== revision.version ||
    compiled.artifactHash !== revision.hash
  )
    return undefined;
  const { artifactHash, compiledAt: _compiledAt, version, ...draft } = compiled;
  return workflowDefinitionHash(draft, version) === artifactHash
    ? compiled
    : undefined;
}
