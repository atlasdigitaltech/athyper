// framework/runtime/src/services/business/finance/shared/decision-grid-evaluator.ts
//
// Thin facade over the Decision Grid pipeline for finance document evaluation.
// Translates document context into pipeline input and returns a simplified result.

import type { OperationContext, ServiceResult } from "../../engines/shared/engine-base.js";
import { ok, fail } from "../../engines/shared/engine-base.js";
import type { PipelineOrchestrator } from "../../engines/decision-grid/pipeline/pipeline-orchestrator.js";
import { money } from "../../engines/shared/money.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Approval route derived from the composite score.
 * Matches the WorkflowPath from decision-grid engine.
 */
export type ApprovalRoute =
    | "ZERO_APPROVAL"
    | "STANDARD"
    | "ENHANCED"
    | "EXECUTIVE"
    | "BLOCKED";

/**
 * Evaluation result returned to the calling document service.
 */
export interface DecisionEvaluationResult {
    /** Composite score (0.0 – 1.0) from all policy modules */
    compositeScore: number;
    /** Determined approval route */
    approvalRoute: ApprovalRoute;
    /** Individual policy module results for audit trail */
    policyResults: PolicyEvalResult[];
    /** Policy exceptions (blocking conditions) */
    exceptions: PolicyException[];
    /** Pipeline ID for traceability */
    pipelineId: string;
}

export interface PolicyEvalResult {
    moduleId: string;
    score: number;
    action: "APPROVE" | "REVIEW" | "ESCALATE" | "BLOCK";
    explanation: string;
}

export interface PolicyException {
    moduleId: string;
    severity: "WARNING" | "BLOCKING";
    message: string;
}

/**
 * Document context used for evaluation. The caller (PurchaseInvoiceService,
 * PaymentEntryService, etc.) constructs this from the document being submitted.
 */
export interface DocumentEvaluationInput {
    docId: string;
    docType: string;
    amount: string;
    currencyCode: string;
    ouId: string;
    intentId?: string;
    categoryId?: string;
    vendorId?: string;
    /** Additional context the pipeline may use for policy evaluation */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * DecisionGridEvaluator — evaluates finance documents against policy modules.
 *
 * On SUBMIT, each finance document calls `evaluate()` to get:
 * 1. A composite score (weighted average of 8 policy module scores)
 * 2. An approval route (ZERO_APPROVAL, STANDARD, ENHANCED, EXECUTIVE, BLOCKED)
 * 3. Policy results and exceptions for audit trail storage
 *
 * The calling service then:
 * - Stores `compositeScore` + `approvalRoute` on the document header
 * - If ZERO_APPROVAL → auto-approve (skip workflow)
 * - If BLOCKED → reject submission with remediation guidance
 * - Otherwise → create approval workflow instance with the determined route
 */
export class DecisionGridEvaluator {
    constructor(private readonly pipelineOrchestrator: PipelineOrchestrator) {}

    async evaluate(
        ctx: OperationContext,
        input: DocumentEvaluationInput,
    ): Promise<ServiceResult<DecisionEvaluationResult>> {
        // Submit to the decision grid pipeline
        const pipelineResult = await this.pipelineOrchestrator.submit(ctx, {
            tenantId: ctx.tenantId,
            docId: input.docId,
            docType: input.docType,
            ouId: input.ouId,
            entityCode: ctx.entityCode ?? "",
            amount: money(input.amount, input.currencyCode),
            category: input.categoryId ?? "",
            vendorId: input.vendorId,
            lineItems: [],
            submittedBy: ctx.actorId,
        });

        if (!pipelineResult.ok) {
            return fail("DECISION_GRID_FAILED", pipelineResult.error.message);
        }

        const pipeline = pipelineResult.value;

        // Extract policy decisions from the pipeline result
        const policyResults: PolicyEvalResult[] = (pipeline.policyDecisions ?? []).map((d) => ({
            moduleId: d.moduleId,
            score: d.score,
            action: d.action,
            explanation: d.explanation,
        }));

        // Extract blocking exceptions
        const exceptions: PolicyException[] = (pipeline.policyDecisions ?? [])
            .filter((d) => d.action === "BLOCK")
            .map((d) => ({
                moduleId: d.moduleId,
                severity: "BLOCKING" as const,
                message: d.explanation,
            }));

        const approvalRoute = (pipeline.workflowPath ?? "STANDARD") as ApprovalRoute;

        return ok({
            compositeScore: pipeline.compositeScore ?? 0,
            approvalRoute,
            policyResults,
            exceptions,
            pipelineId: pipeline.id,
        });
    }
}
