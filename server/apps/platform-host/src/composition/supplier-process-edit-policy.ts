import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { BusinessPartnerRequest, BusinessPartnerRequestRepository, PatchBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import type { ProcessExecutionManifest } from "@athyper/server-contract-control-admin";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { createPolicyService, createKyselyPolicyRepository } from "@athyper/server-platform-policy";
import { taskFieldChanges, evaluateTaskEditOutcomes } from "@athyper/server-platform-workflow";
import { processSelectionCanonical } from "@athyper/server-platform-governance";
import { HttpError } from "@athyper/server-runtime-http";
type Tx = Transaction<Record<string, never>>;

/** Invoked inside the request patch transaction, after owning scope/field validation. */
export function createSupplierProcessEditPolicy(options: {
  authorizer: Authorizer; repository: BusinessPartnerRequestRepository<Tx>;
  transactions: PlaneTransactionCoordinator<Tx>; audit: AuditRecorder<Tx>;
}) {
  const policy = createPolicyService({ repository: createKyselyPolicyRepository(), transactions: options.transactions, audit: options.audit });
  async function evaluate(command: PatchBusinessPartnerRequestCommand, current: BusinessPartnerRequest, tx: Tx) {
    if (command.context.planeKey !== "neon") throw new HttpError(403, "TASK_EDIT_FORBIDDEN", "Edit policies belong to the owning plane");
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${command.context.tenantId}:entity-case:${command.requestId}`},0))`.execute(tx);
    const saved = (await sql<{ row_version: string; manifest: ProcessExecutionManifest; attempt_id: string }>`SELECT c.row_version,e.evidence->'executionManifest' manifest,a.id attempt_id
      FROM document.entity_case c JOIN governance.process_attempt a ON a.tenant_id=c.tenant_id AND a.case_id=c.id
      JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id
      WHERE c.tenant_id=${command.context.tenantId}::uuid AND c.id=${command.requestId}::uuid ORDER BY a.attempt_number DESC LIMIT 1`.execute(tx)).rows[0];
    if (!saved?.manifest.editPolicy) return undefined;
    if (Number(saved.row_version) !== command.expectedVersion || current.rowVersion !== command.expectedVersion)
      throw new HttpError(409, "TASK_EDIT_VERSION_CONFLICT", "Reload the current request before evaluating changes");
    const before = {
      proposedPayload: current.proposedPayload, operatingOrganizationId: current.operatingOrganizationId ?? null,
      companyCodeId: current.companyCodeId ?? null, requestedRole: current.requestedRole ?? null,
    };
    const after = { proposedPayload: { ...current.proposedPayload, ...command.proposedPayload,
      ...(command.extensions !== undefined ? { relationshipProposals: command.extensions } : {}) },
      operatingOrganizationId: command.operatingOrganizationId ?? before.operatingOrganizationId,
      companyCodeId: command.companyCodeId === undefined ? before.companyCodeId : command.companyCodeId,
      requestedRole: command.requestedRole === undefined ? before.requestedRole : command.requestedRole };
    const changes = taskFieldChanges(before, after), pin = saved.manifest.editPolicy;
    const evaluated = await policy.evaluateExact({ context: command.context, entityType: "workflow.task_edit", entityId: command.requestId,
      revision: { id: pin.definitionId, version: pin.version, hash: pin.hash }, effectiveOn: pin.effectiveOn,
      facts: { request: { before, after, changedPaths: changes.map(c => c.path), state: current.status },
        scope: saved.manifest.scope, actor: { principalId: command.context.principalId, isRequester: current.createdBy === command.context.principalId } } }, tx);
    const decision = evaluateTaskEditOutcomes({ revision: { definitionId: pin.definitionId, version: pin.version, hash: pin.hash },
      evaluatedHash: evaluated.definition.definitionHash!, evaluationMode: evaluated.definition.evaluationMode,
      decision: evaluated.decision, changes, metadataPaths: [] });
    return { ...decision, attemptId: saved.attempt_id, manifest: saved.manifest.revision,
      changedPaths: changes.map(c => c.path), factHash: createHash("sha256").update(processSelectionCanonical({ before, after })).digest("hex"),
      evaluatorVersion: evaluated.evaluatorVersion, trace: evaluated.trace };
  }
  return {
    async guard(command: PatchBusinessPartnerRequestCommand, current: BusinessPartnerRequest, tx: Tx) {
      const result = await evaluate(command, current, tx);
      if (result && !result.permitted) throw new HttpError(403, "TASK_EDIT_POLICY_DENIED", "The published edit rules do not permit these changes");
      if (result?.effect === "full_reapproval") await sql`SELECT document.command_record_process_contribution(
        ${command.context.tenantId}::uuid,${command.requestId}::uuid,${result.attemptId}::uuid,${command.expectedVersion},${command.context.principalId}::uuid,${result.factHash},${JSON.stringify(result.changedPaths)}::jsonb)`.execute(tx);
      return result;
    },
    async preview(command: PatchBusinessPartnerRequestCommand, tx: Tx) {
      const current = await options.repository.get(command.context.tenantId, command.requestId, tx);
      if (!current) throw new HttpError(404, "TASK_EDIT_NOT_FOUND", "Request not found");
      const access = await options.authorizer.authorize({ context: command.context, permissionCode: "neon.relationship.entity_case.update",
        resource: { tenantId: command.context.tenantId, entityCode: "entity_case", resourceCode: "entity_case", recordId: current.id, requestId: current.id,
          authorizationTarget: "existing", operatingOrganizationId: current.operatingOrganizationId,
          ...(current.companyCodeId ? { companyCodeId: current.companyCodeId } : {}) } });
      if (!access.allowed) throw new HttpError(403, "TASK_EDIT_FORBIDDEN", "Request edit permission is required");
      const result = await evaluate(command, current, tx);
      return result ? { status: "evaluated", result, editableNow: ["draft", "returned", "validation_failed"].includes(current.status) }
        : { status: "legacy", message: "No edit policy is pinned. Submitted business data remains locked; returned corrections require full re-review." };
    },
  };
}
