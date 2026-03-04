// framework/runtime/src/services/business/engines/decision-grid/pipeline/pipeline-orchestrator.ts

/**
 * Decision Grid Pipeline Orchestrator — executes the 12-step transaction pipeline.
 *
 * Steps:
 * 1.  INTAKE — Assign txn_id, doc_id, emit txn.submitted
 * 2.  OU_VALIDATION — Verify OU active + user authorized
 * 3.  INTENT_RESOLUTION — Resolve Business Intent
 * 4.  SMART_DEFAULTS — Auto-populate GL, centers, FP, tax
 * 5.  FUNDING_CHECK — Evaluate FP health at all hierarchy levels
 * 6.  COMMITMENT_CREATION — Create commitment, emit commitment.created
 * 7.  POLICY_EVALUATION — Execute all policy modules (REUSE policy-rules engine)
 * 8.  RISK_SCORING — Multi-dimensional risk scoring
 * 9.  WORKFLOW_ASSEMBLY — Assemble approval workflow (REUSE wf.approval_*)
 * 10. TAX_CALCULATION — Invoke Tax Engine
 * 11. AI_ENHANCEMENT — Atlas advisory (stub for Phase 1)
 * 12. FINALIZATION — Build snapshot, emit txn.finalized
 */

import { ok, fail } from "../../shared/engine-base.js";
import { STEP_TO_STATUS } from "../domain/types.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  TransactionPipeline,
  SubmitTransactionInput,
  PipelineStep,
  StepResult,
} from "../domain/types.js";
import type { PipelineRepo } from "../persistence/pipeline-repo.js";

/**
 * Pipeline step executor function signature.
 * Each step receives the current pipeline state and returns updates.
 */
export type PipelineStepExecutor = (
  ctx: OperationContext,
  pipeline: TransactionPipeline,
  input: SubmitTransactionInput,
) => Promise<StepResult>;

/**
 * Pipeline Orchestrator — drives transactions through the 12-step grid.
 */
export interface PipelineOrchestrator {
  /** Submit a new transaction through the pipeline */
  submit(
    ctx: OperationContext,
    input: SubmitTransactionInput,
  ): Promise<ServiceResult<TransactionPipeline>>;
  /** Resume a failed/paused pipeline from its current step */
  resume(
    ctx: OperationContext,
    pipelineId: string,
  ): Promise<ServiceResult<TransactionPipeline>>;
  /** Get pipeline status */
  getStatus(
    tenantId: string,
    txnId: string,
  ): Promise<TransactionPipeline | null>;
}

export class DefaultPipelineOrchestrator implements PipelineOrchestrator {
  private steps: Map<PipelineStep, PipelineStepExecutor> = new Map();

  constructor(private readonly pipelineRepo: PipelineRepo) {}

  /** Register a step executor */
  registerStep(step: PipelineStep, executor: PipelineStepExecutor): void {
    this.steps.set(step, executor);
  }

  async submit(
    ctx: OperationContext,
    input: SubmitTransactionInput,
  ): Promise<ServiceResult<TransactionPipeline>> {
    // Create pipeline
    const txnId = crypto.randomUUID();
    const pipeline = await this.pipelineRepo.create({
      tenantId: ctx.tenantId,
      txnId,
      docId: input.docId,
      docType: input.docType,
      ouId: input.ouId,
      submittedBy: input.submittedBy,
    });

    // Execute steps sequentially
    return this.executeSteps(ctx, pipeline, input);
  }

  async resume(
    ctx: OperationContext,
    pipelineId: string,
  ): Promise<ServiceResult<TransactionPipeline>> {
    const pipeline = await this.pipelineRepo.getById(ctx.tenantId, pipelineId);
    if (!pipeline) {
      return fail("PIPELINE_NOT_FOUND", `Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status === "COMPLETED") {
      return fail("PIPELINE_COMPLETED", "Pipeline is already completed");
    }

    // Resume from current step with minimal input
    const input: SubmitTransactionInput = {
      tenantId: ctx.tenantId,
      docId: pipeline.docId,
      docType: pipeline.docType,
      ouId: pipeline.ouId,
      entityCode: ctx.entityCode ?? "",
      amount: { amount: "0", currencyCode: "USD", precision: 4 },
      category: "",
      lineItems: [],
      submittedBy: pipeline.submittedBy,
    };

    return this.executeSteps(ctx, pipeline, input);
  }

  async getStatus(
    tenantId: string,
    txnId: string,
  ): Promise<TransactionPipeline | null> {
    return this.pipelineRepo.getByTxnId(tenantId, txnId);
  }

  private async executeSteps(
    ctx: OperationContext,
    pipeline: TransactionPipeline,
    input: SubmitTransactionInput,
  ): Promise<ServiceResult<TransactionPipeline>> {
    let current = pipeline;

    for (
      let step = current.currentStep as PipelineStep;
      step <= 12;
      step = (step + 1) as PipelineStep
    ) {
      const executor = this.steps.get(step);
      if (!executor) {
        // Skip unregistered steps (e.g., AI_ENHANCEMENT stub)
        const status = STEP_TO_STATUS[step];
        if (status) {
          current = await this.pipelineRepo.updateStep(
            ctx.tenantId,
            current.id,
            step,
            status,
            {},
          );
        }
        continue;
      }

      try {
        const result = await executor(ctx, current, input);

        if (!result.success) {
          // Step failed — mark pipeline as FAILED
          current = await this.pipelineRepo.updateStep(
            ctx.tenantId,
            current.id,
            step,
            "FAILED",
            { rejectionReason: result.error, ...result.updates },
          );
          return fail(
            "STEP_FAILED",
            `Pipeline failed at step ${step}: ${result.error}`,
          );
        }

        // Step succeeded — update pipeline
        const status = STEP_TO_STATUS[step] ?? current.status;
        current = await this.pipelineRepo.updateStep(
          ctx.tenantId,
          current.id,
          step,
          status,
          result.updates,
        );

        // If step says to stop (e.g., workflow assembly needs async approval)
        if (result.nextStep === null) {
          return ok(current);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        current = await this.pipelineRepo.updateStep(
          ctx.tenantId,
          current.id,
          step,
          "FAILED",
          { rejectionReason: `Unexpected error: ${message}` },
        );
        return fail("STEP_ERROR", `Pipeline error at step ${step}: ${message}`);
      }
    }

    // All steps completed
    current = await this.pipelineRepo.updateStatus(
      ctx.tenantId,
      current.id,
      "COMPLETED",
    );
    return ok(current);
  }
}
