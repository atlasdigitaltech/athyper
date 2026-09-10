import { sql, type Kysely } from "kysely";
import { KyselyBusinessPartnerCaseRepository } from "@athyper/server-service-master-data";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

/** Read-only workflow eligibility. Command services still recheck the supplied
 * optimistic versions, immutable evidence, payload and idempotency inside writes. */
export function createEntityCasePreflight(
  database: Kysely<Record<string, never>>,
): EntityScopeAdapter["preflight"] {
  const repository = new KyselyBusinessPartnerCaseRepository();
  return async (input) => {
    if (input.context.planeKey !== "neon") return "workflow_blocked";
    if (input.operationKey === "create") return "allowed"; // validated proposed ownership precedes preflight
    if (!input.recordId) return "workflow_blocked";
    const recordId = input.recordId;
    return database.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(
        tx,
      );
      await sql`SET LOCAL statement_timeout='1500ms'`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${input.context.tenantId},true),set_config('app.current_principal_id',${input.context.principalId},true)`.execute(
        tx,
      );
      const view = await repository.getView(
        input.context.tenantId,
        recordId,
        tx,
      );
      if (!view) return "workflow_blocked";
      const saved = view.request,
        editable = ["draft", "validation_failed", "returned"].includes(
          saved.status,
        );
      if (["update", "reassign", "validate"].includes(input.operationKey))
        return editable ? "allowed" : "workflow_blocked";
      if (input.operationKey === "submit")
        return (saved.status === "draft" && view.validationCurrent) ||
          saved.status === "pending_approval"
          ? "allowed"
          : "workflow_blocked";
      if (input.operationKey === "decide")
        return saved.status === "pending_approval" &&
          input.context.assurance === "elevated" &&
          saved.createdBy !== input.context.principalId &&
          saved.submittedBy !== input.context.principalId &&
          view.workflow?.ownerPrincipalId === input.context.principalId &&
          ["open", "claimed"].includes(view.workflow.workItemStatus ?? "")
          ? "allowed"
          : "workflow_blocked";
      if (input.operationKey === "materialize")
        return input.context.assurance === "elevated" &&
          ["approved", "applied"].includes(saved.status) &&
          saved.approvedBy !== input.context.principalId
          ? "allowed"
          : "workflow_blocked";
      return "not_applicable";
    });
  };
}
