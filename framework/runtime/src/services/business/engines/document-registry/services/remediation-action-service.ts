// framework/runtime/src/services/business/engines/document-registry/services/remediation-action-service.ts
//
// Phase 8C — Remediation Action Service
//
// Manages the lifecycle of document remediation actions:
//   SUGGESTED → APPROVED → EXECUTING → COMPLETED
//   SUGGESTED → REJECTED
//   EXECUTING → FAILED
//
// This is a "suggest → approve → execute" pipeline. The system detects
// defects and suggests fixes; controllers review and approve; then the
// system executes approved corrections.
//
// Follows the ServiceResult pattern from engine-base.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  RemediationAction,
  RemediationActionType,
  RemediationSourceType,
  RemediationPriority,
  RemediationStatus,
  RemediationSummary,
  FinancialDocType,
} from "../domain/types-remediation.js";

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface RemediationActionService {
  /** Suggest a new remediation action (usually called by handlers/evaluators) */
  suggest(
    ctx: OperationContext,
    input: SuggestRemediationInput,
  ): Promise<ServiceResult<RemediationAction>>;

  /** Approve a suggested action (controller action) */
  approve(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationAction>>;

  /** Reject a suggested action with reason */
  reject(
    ctx: OperationContext,
    actionId: string,
    reason: string,
  ): Promise<ServiceResult<RemediationAction>>;

  /** Execute an approved action */
  execute(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationAction>>;

  /** Bulk-approve multiple actions */
  bulkApprove(
    ctx: OperationContext,
    actionIds: string[],
  ): Promise<ServiceResult<RemediationAction[]>>;

  /** List actions for a period with optional status filter */
  list(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    statusFilter?: RemediationStatus[],
  ): Promise<ServiceResult<RemediationAction[]>>;

  /** Get summary counts for a period */
  getSummary(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<RemediationSummary>>;

  /** Auto-suggest remediation actions from close handler results */
  suggestFromHandlerResult(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    handlerCode: string,
    evidence: Record<string, unknown>,
  ): Promise<ServiceResult<RemediationAction[]>>;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface SuggestRemediationInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  sourceType: RemediationSourceType;
  sourceRef?: string;
  docRegistryId?: string;
  docId?: string;
  docType?: FinancialDocType;
  docNo?: string;
  actionType: RemediationActionType;
  actionDetail?: Record<string, unknown>;
  priority?: RemediationPriority;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultRemediationActionService implements RemediationActionService {
  constructor(private readonly db: any) {}

  async suggest(
    ctx: OperationContext,
    input: SuggestRemediationInput,
  ): Promise<ServiceResult<RemediationAction>> {
    // Idempotency: check if an identical SUGGESTED action already exists
    const existing = await this.db
      .selectFrom("fin.document_remediation_action")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", input.entityCode)
      .where("fiscal_year", "=", input.fiscalYear)
      .where("period_number", "=", input.periodNumber)
      .where("action_type", "=", input.actionType)
      .where("status", "=", "SUGGESTED")
      .where("doc_id", "=", input.docId ?? null)
      .executeTakeFirst();

    if (existing) {
      return ok(this.mapRow(existing));
    }

    const row = await this.db
      .insertInto("fin.document_remediation_action")
      .values({
        tenant_id: ctx.tenantId,
        entity_code: input.entityCode,
        fiscal_year: input.fiscalYear,
        period_number: input.periodNumber,
        source_type: input.sourceType,
        source_ref: input.sourceRef ?? null,
        doc_registry_id: input.docRegistryId ?? null,
        doc_id: input.docId ?? null,
        doc_type: input.docType ?? null,
        doc_no: input.docNo ?? null,
        action_type: input.actionType,
        action_detail: JSON.stringify(input.actionDetail ?? {}),
        priority: input.priority ?? "MEDIUM",
        status: "SUGGESTED",
        suggested_by: ctx.actorId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return ok(this.mapRow(row));
  }

  async approve(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationAction>> {
    return this.transition(ctx, actionId, "SUGGESTED", "APPROVED", {
      approved_by: ctx.actorId,
      approved_at: new Date(),
    });
  }

  async reject(
    ctx: OperationContext,
    actionId: string,
    reason: string,
  ): Promise<ServiceResult<RemediationAction>> {
    return this.transition(ctx, actionId, "SUGGESTED", "REJECTED", {
      rejection_reason: reason,
    });
  }

  async execute(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationAction>> {
    // Mark as EXECUTING first
    const execResult = await this.transition(ctx, actionId, "APPROVED", "EXECUTING", {
      executed_by: ctx.actorId,
    });

    if (!execResult.ok) return execResult;

    // Execute the action based on type
    // For now, mark as COMPLETED — actual execution will be wired
    // to specific domain services per action type in future phases
    const action = execResult.value;

    try {
      // Placeholder: action execution dispatch would go here
      // Each action_type maps to a specific domain service call
      return this.transition(ctx, actionId, "EXECUTING", "COMPLETED", {
        executed_at: new Date(),
        execution_result: JSON.stringify({ status: "executed", note: "Awaiting domain service integration" }),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return this.transition(ctx, actionId, "EXECUTING", "FAILED", {
        failure_reason: errorMessage,
      });
    }
  }

  async bulkApprove(
    ctx: OperationContext,
    actionIds: string[],
  ): Promise<ServiceResult<RemediationAction[]>> {
    const results: RemediationAction[] = [];
    for (const id of actionIds) {
      const result = await this.approve(ctx, id);
      if (result.ok) {
        results.push(result.value);
      }
    }
    return ok(results);
  }

  async list(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    statusFilter?: RemediationStatus[],
  ): Promise<ServiceResult<RemediationAction[]>> {
    let query = this.db
      .selectFrom("fin.document_remediation_action")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", entityCode)
      .where("fiscal_year", "=", fiscalYear)
      .where("period_number", "=", periodNumber)
      .orderBy("priority", "asc")
      .orderBy("suggested_at", "desc");

    if (statusFilter && statusFilter.length > 0) {
      query = query.where("status", "in", statusFilter);
    }

    const rows = await query.execute();
    return ok(rows.map((r: any) => this.mapRow(r)));
  }

  async getSummary(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<RemediationSummary>> {
    const row = await this.db
      .selectFrom("fin.v_remediation_summary")
      .select([
        "total_actions",
        "suggested_count",
        "approved_count",
        "executing_count",
        "completed_count",
        "rejected_count",
        "failed_count",
        "critical_count",
        "high_count",
      ])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", entityCode)
      .where("fiscal_year", "=", fiscalYear)
      .where("period_number", "=", periodNumber)
      .executeTakeFirst();

    return ok({
      totalActions: parseInt(row?.total_actions ?? "0"),
      suggestedCount: parseInt(row?.suggested_count ?? "0"),
      approvedCount: parseInt(row?.approved_count ?? "0"),
      executingCount: parseInt(row?.executing_count ?? "0"),
      completedCount: parseInt(row?.completed_count ?? "0"),
      rejectedCount: parseInt(row?.rejected_count ?? "0"),
      failedCount: parseInt(row?.failed_count ?? "0"),
      criticalCount: parseInt(row?.critical_count ?? "0"),
      highCount: parseInt(row?.high_count ?? "0"),
    });
  }

  async suggestFromHandlerResult(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    handlerCode: string,
    evidence: Record<string, unknown>,
  ): Promise<ServiceResult<RemediationAction[]>> {
    const actions: RemediationAction[] = [];
    const defects = (evidence.findings ?? evidence.defectsByType) as any[] | undefined;

    if (!defects || !Array.isArray(defects)) return ok(actions);

    for (const defect of defects) {
      const actionType = this.mapDefectToActionType(defect.findingType ?? defect.defectType);
      if (!actionType) continue;

      const priority = this.mapSeverityToPriority(defect.findingSeverity ?? defect.defectSeverity ?? "MEDIUM");

      const result = await this.suggest(ctx, {
        entityCode,
        fiscalYear,
        periodNumber,
        sourceType: "CLOSE_HANDLER",
        sourceRef: handlerCode,
        docId: defect.docId,
        docType: defect.docType,
        docNo: defect.docNo,
        actionType,
        actionDetail: {
          findingType: defect.findingType ?? defect.defectType,
          findingDetail: defect.findingDetail ?? defect.detail,
          amount: defect.docAmount ?? defect.totalAmount,
          currency: defect.currencyCode,
        },
        priority,
      });

      if (result.ok) actions.push(result.value);
    }

    return ok(actions);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async transition(
    ctx: OperationContext,
    actionId: string,
    expectedStatus: RemediationStatus,
    targetStatus: RemediationStatus,
    updates: Record<string, unknown>,
  ): Promise<ServiceResult<RemediationAction>> {
    const result = await this.db
      .updateTable("fin.document_remediation_action")
      .set({
        status: targetStatus,
        updated_at: new Date(),
        ...updates,
      })
      .where("id", "=", actionId)
      .where("tenant_id", "=", ctx.tenantId)
      .where("status", "=", expectedStatus)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition action ${actionId} from ${expectedStatus} to ${targetStatus}`,
      );
    }

    return ok(this.mapRow(result));
  }

  private mapDefectToActionType(defectType: string): RemediationActionType | null {
    switch (defectType) {
      case "POSTED_NO_JE":
      case "DEFECT_FAILED":
        return "REPOST_DOCUMENT";
      case "DEFECT_APPROVED_NOT_POSTED":
        return "REPOST_DOCUMENT";
      case "JE_REVERSED_DOC_NOT":
        return "MARK_VOID";
      case "INCOMPLETE_MULTIBOOK":
        return "POST_TO_BOOK";
      case "AMOUNT_MISMATCH":
        return "MANUAL_CORRECTION";
      case "ACCRUAL_MISSING_REVERSAL":
        return "GENERATE_REVERSAL_JE";
      case "NO_APPROVAL_EVIDENCE":
      case "NO_DECISION_SCORE":
        return "FILL_APPROVAL_EVIDENCE";
      case "DEFECT_UNFINALIZED":
        return null; // No auto-fix for drafts
      default:
        return "MANUAL_CORRECTION";
    }
  }

  private mapSeverityToPriority(severity: string): RemediationPriority {
    switch (severity) {
      case "HIGH": return "HIGH";
      case "MEDIUM": return "MEDIUM";
      case "LOW": return "LOW";
      default: return "MEDIUM";
    }
  }

  private mapRow(row: any): RemediationAction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityCode: row.entity_code,
      fiscalYear: row.fiscal_year,
      periodNumber: row.period_number,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      docRegistryId: row.doc_registry_id,
      docId: row.doc_id,
      docType: row.doc_type,
      docNo: row.doc_no,
      actionType: row.action_type,
      actionDetail: typeof row.action_detail === "string" ? JSON.parse(row.action_detail) : (row.action_detail ?? {}),
      priority: row.priority,
      status: row.status,
      suggestedBy: row.suggested_by,
      suggestedAt: row.suggested_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      executedBy: row.executed_by,
      executedAt: row.executed_at,
      executionResult: typeof row.execution_result === "string" ? JSON.parse(row.execution_result) : row.execution_result,
      failureReason: row.failure_reason,
    };
  }
}
