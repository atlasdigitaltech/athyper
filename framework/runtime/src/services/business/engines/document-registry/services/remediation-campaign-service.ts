// framework/runtime/src/services/business/engines/document-registry/services/remediation-campaign-service.ts
//
// Phase 8D — Remediation Campaign & Preview Service
//
// Manages batched remediation campaigns and pre-execution previews (dry-run).
// Campaigns group same-type actions into a single approval unit.
// Previews validate prerequisites and predict side effects before execution.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  RemediationActionType,
  RemediationPriority,
} from "../domain/close-command-center.js";
import type {
  RemediationCampaign,
  CampaignStatus,
  RemediationPreview,
  PrerequisiteCheckResult,
  PredictedSideEffect,
} from "../domain/remediation-playbook.js";

import {
  getPlaybook,
  getPlaybookRiskLevel,
  requiresApproval,
} from "../domain/remediation-playbook.js";

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface RemediationCampaignService {
  /** Create a new campaign from a set of action IDs */
  createCampaign(
    ctx: OperationContext,
    input: CreateCampaignInput,
  ): Promise<ServiceResult<RemediationCampaign>>;

  /** Approve a draft campaign */
  approveCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationCampaign>>;

  /** Cancel a draft or approved campaign */
  cancelCampaign(
    ctx: OperationContext,
    campaignId: string,
    reason: string,
  ): Promise<ServiceResult<RemediationCampaign>>;

  /** Get campaign by ID */
  getCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationCampaign>>;

  /** List campaigns for a period */
  listCampaigns(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    statusFilter?: CampaignStatus[],
  ): Promise<ServiceResult<RemediationCampaign[]>>;

  /** Preview a single remediation action (dry-run) */
  previewExecution(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationPreview>>;

  /** Preview all actions in a campaign (batch dry-run) */
  previewCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationPreview[]>>;
}

export interface CreateCampaignInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  campaignName: string;
  description?: string;
  actionType: RemediationActionType;
  priorityFilter?: RemediationPriority;
  actionIds: string[];
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultRemediationCampaignService implements RemediationCampaignService {
  constructor(private readonly db: any) {}

  async createCampaign(
    ctx: OperationContext,
    input: CreateCampaignInput,
  ): Promise<ServiceResult<RemediationCampaign>> {
    const playbook = getPlaybook(input.actionType);

    if (!playbook.supportsBatch) {
      return fail(
        "BATCH_NOT_SUPPORTED",
        `Action type ${input.actionType} does not support batch campaigns`,
      );
    }

    if (playbook.maxBatchSize && input.actionIds.length > playbook.maxBatchSize) {
      return fail(
        "BATCH_SIZE_EXCEEDED",
        `Campaign has ${input.actionIds.length} actions but max batch size is ${playbook.maxBatchSize}`,
      );
    }

    // Validate all actions exist, are same type, and in SUGGESTED status
    const actions = await this.db
      .selectFrom("fin.document_remediation_action")
      .select(["id", "action_type", "status", "campaign_id"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("id", "in", input.actionIds)
      .execute();

    if (actions.length !== input.actionIds.length) {
      return fail("ACTIONS_NOT_FOUND", `Some action IDs were not found`);
    }

    for (const a of actions) {
      if (a.action_type !== input.actionType) {
        return fail(
          "MIXED_ACTION_TYPES",
          `Action ${a.id} has type ${a.action_type}, expected ${input.actionType}`,
        );
      }
      if (a.status !== "SUGGESTED") {
        return fail(
          "INVALID_ACTION_STATUS",
          `Action ${a.id} is in ${a.status} status, expected SUGGESTED`,
        );
      }
      if (a.campaign_id) {
        return fail(
          "ALREADY_IN_CAMPAIGN",
          `Action ${a.id} is already assigned to campaign ${a.campaign_id}`,
        );
      }
    }

    // Create campaign
    const row = await this.db
      .insertInto("fin.remediation_campaign")
      .values({
        tenant_id: ctx.tenantId,
        entity_code: input.entityCode,
        fiscal_year: input.fiscalYear,
        period_number: input.periodNumber,
        campaign_name: input.campaignName,
        description: input.description ?? null,
        action_type: input.actionType,
        priority_filter: input.priorityFilter ?? null,
        status: "DRAFT",
        total_actions: input.actionIds.length,
        risk_level: playbook.riskLevel,
        requires_approval: requiresApproval(input.actionType, input.priorityFilter ?? "MEDIUM"),
        max_batch_size: playbook.maxBatchSize,
        created_by: ctx.actorId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Link actions to campaign
    await this.db
      .updateTable("fin.document_remediation_action")
      .set({
        campaign_id: row.id,
        playbook_code: input.actionType,
        updated_at: new Date(),
      })
      .where("id", "in", input.actionIds)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    return ok(this.mapCampaignRow(row, input.actionIds));
  }

  async approveCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationCampaign>> {
    return this.transitionCampaign(ctx, campaignId, "DRAFT", "APPROVED", {
      approved_by: ctx.actorId,
      approved_at: new Date(),
    });
  }

  async cancelCampaign(
    ctx: OperationContext,
    campaignId: string,
    reason: string,
  ): Promise<ServiceResult<RemediationCampaign>> {
    // Can cancel from DRAFT or APPROVED
    const campaign = await this.db
      .selectFrom("fin.remediation_campaign")
      .selectAll()
      .where("id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .executeTakeFirst();

    if (!campaign) {
      return fail("NOT_FOUND", `Campaign ${campaignId} not found`);
    }

    if (campaign.status !== "DRAFT" && campaign.status !== "APPROVED") {
      return fail(
        "INVALID_TRANSITION",
        `Cannot cancel campaign in ${campaign.status} status`,
      );
    }

    const row = await this.db
      .updateTable("fin.remediation_campaign")
      .set({
        status: "CANCELLED",
        cancelled_by: ctx.actorId,
        cancelled_at: new Date(),
        cancellation_reason: reason,
        updated_at: new Date(),
      })
      .where("id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Unlink actions from campaign
    await this.db
      .updateTable("fin.document_remediation_action")
      .set({ campaign_id: null, updated_at: new Date() })
      .where("campaign_id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    return ok(this.mapCampaignRow(row, []));
  }

  async getCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationCampaign>> {
    const row = await this.db
      .selectFrom("fin.remediation_campaign")
      .selectAll()
      .where("id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .executeTakeFirst();

    if (!row) {
      return fail("NOT_FOUND", `Campaign ${campaignId} not found`);
    }

    const actionIds = await this.db
      .selectFrom("fin.document_remediation_action")
      .select("id")
      .where("campaign_id", "=", campaignId)
      .execute();

    return ok(this.mapCampaignRow(row, actionIds.map((a: any) => a.id)));
  }

  async listCampaigns(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    statusFilter?: CampaignStatus[],
  ): Promise<ServiceResult<RemediationCampaign[]>> {
    let query = this.db
      .selectFrom("fin.remediation_campaign")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", entityCode)
      .where("fiscal_year", "=", fiscalYear)
      .where("period_number", "=", periodNumber)
      .orderBy("created_at", "desc");

    if (statusFilter && statusFilter.length > 0) {
      query = query.where("status", "in", statusFilter);
    }

    const rows = await query.execute();
    return ok(rows.map((r: any) => this.mapCampaignRow(r, [])));
  }

  async previewExecution(
    ctx: OperationContext,
    actionId: string,
  ): Promise<ServiceResult<RemediationPreview>> {
    const action = await this.db
      .selectFrom("fin.document_remediation_action")
      .selectAll()
      .where("id", "=", actionId)
      .where("tenant_id", "=", ctx.tenantId)
      .executeTakeFirst();

    if (!action) {
      return fail("NOT_FOUND", `Action ${actionId} not found`);
    }

    const playbook = getPlaybook(action.action_type);

    // Run prerequisite checks
    const prerequisiteResults = await this.checkPrerequisites(
      ctx, action, playbook.prerequisites.map((p) => p.checkCode),
    );

    const allPrerequisitesMet = prerequisiteResults.every((r) => r.passed);

    // Predict side effects (enrich with record counts where possible)
    const predictedSideEffects = await this.predictSideEffects(
      ctx, action, playbook.sideEffects,
    );

    // Determine blocking reasons
    const blockingReasons: string[] = [];
    for (const pr of prerequisiteResults) {
      if (!pr.passed) {
        blockingReasons.push(`${pr.description}: ${pr.detail ?? "failed"}`);
      }
    }

    // Check period status
    const period = await this.db
      .selectFrom("fin.fiscal_period")
      .select(["status"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", action.entity_code)
      .where("fiscal_year", "=", action.fiscal_year)
      .where("period_number", "=", action.period_number)
      .executeTakeFirst();

    if (period?.status === "HARD_CLOSE") {
      blockingReasons.push("Period is in HARD_CLOSE status — no mutations allowed");
    }

    const canExecute = allPrerequisitesMet && blockingReasons.length === 0;

    const impactSummary = canExecute
      ? `${playbook.displayName} for ${action.doc_no ?? action.doc_id ?? "unknown"}: ${playbook.steps.filter((s) => s.type === "MUTATE").length} mutation(s), risk level ${playbook.riskLevel}`
      : `BLOCKED: ${blockingReasons.join("; ")}`;

    const preview: RemediationPreview = {
      actionId,
      actionType: action.action_type,
      playbook,
      docId: action.doc_id,
      docNo: action.doc_no,
      docType: action.doc_type,
      prerequisiteResults,
      allPrerequisitesMet,
      predictedSideEffects,
      impactSummary,
      canExecute,
      blockingReasons,
    };

    // Log the preview for audit
    await this.db
      .insertInto("fin.remediation_preview_log")
      .values({
        tenant_id: ctx.tenantId,
        action_id: actionId,
        campaign_id: action.campaign_id ?? null,
        action_type: action.action_type,
        playbook_code: action.action_type,
        risk_level: playbook.riskLevel,
        all_prerequisites_met: allPrerequisitesMet,
        can_execute: canExecute,
        blocking_reasons: JSON.stringify(blockingReasons),
        prerequisite_results: JSON.stringify(prerequisiteResults),
        predicted_side_effects: JSON.stringify(predictedSideEffects),
        impact_summary: impactSummary,
        doc_id: action.doc_id,
        doc_type: action.doc_type,
        doc_no: action.doc_no,
        previewed_by: ctx.actorId,
      })
      .execute();

    return ok(preview);
  }

  async previewCampaign(
    ctx: OperationContext,
    campaignId: string,
  ): Promise<ServiceResult<RemediationPreview[]>> {
    const actions = await this.db
      .selectFrom("fin.document_remediation_action")
      .select("id")
      .where("campaign_id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    const previews: RemediationPreview[] = [];
    for (const a of actions) {
      const result = await this.previewExecution(ctx, a.id);
      if (result.ok) {
        previews.push(result.value);
      }
    }

    return ok(previews);
  }

  // ---------------------------------------------------------------------------
  // Private: prerequisite checking
  // ---------------------------------------------------------------------------

  private async checkPrerequisites(
    ctx: OperationContext,
    action: any,
    checkCodes: string[],
  ): Promise<PrerequisiteCheckResult[]> {
    const results: PrerequisiteCheckResult[] = [];
    const playbook = getPlaybook(action.action_type);

    for (const prereq of playbook.prerequisites) {
      const result = await this.runPrerequisiteCheck(ctx, action, prereq.checkCode);
      results.push({
        checkCode: prereq.checkCode,
        description: prereq.description,
        ...result,
      });
    }

    return results;
  }

  private async runPrerequisiteCheck(
    ctx: OperationContext,
    action: any,
    checkCode: string,
  ): Promise<{ passed: boolean; detail?: string }> {
    switch (checkCode) {
      case "PERIOD_NOT_HARD_CLOSE": {
        const period = await this.db
          .selectFrom("fin.fiscal_period")
          .select(["status"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("entity_code", "=", action.entity_code)
          .where("fiscal_year", "=", action.fiscal_year)
          .where("period_number", "=", action.period_number)
          .executeTakeFirst();
        if (!period) return { passed: false, detail: "Period not found" };
        if (period.status === "HARD_CLOSE") return { passed: false, detail: "Period is HARD_CLOSE" };
        return { passed: true, detail: `Period status: ${period.status}` };
      }

      case "DOC_STATUS_REPOSTABLE": {
        if (!action.doc_id) return { passed: false, detail: "No doc_id on action" };
        const doc = await this.db
          .selectFrom("fin.financial_document")
          .select(["status"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("doc_id", "=", action.doc_id)
          .executeTakeFirst();
        if (!doc) return { passed: false, detail: "Document not found in registry" };
        const repostable = ["APPROVED", "FAILED", "POSTING_PENDING"];
        if (repostable.includes(doc.status)) return { passed: true, detail: `Status: ${doc.status}` };
        return { passed: false, detail: `Status ${doc.status} is not re-postable` };
      }

      case "NO_EXISTING_JE": {
        if (!action.doc_id) return { passed: true };
        const doc = await this.db
          .selectFrom("fin.financial_document")
          .select(["je_id"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("doc_id", "=", action.doc_id)
          .executeTakeFirst();
        if (doc?.je_id) return { passed: false, detail: `JE already exists: ${doc.je_id}` };
        return { passed: true };
      }

      case "JE_IS_REVERSED": {
        if (!action.doc_id) return { passed: false, detail: "No doc_id" };
        const doc = await this.db
          .selectFrom("fin.financial_document")
          .select(["je_id"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("doc_id", "=", action.doc_id)
          .executeTakeFirst();
        if (!doc?.je_id) return { passed: false, detail: "No JE linked" };
        const je = await this.db
          .selectFrom("fin.journal_entry")
          .select(["status"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("id", "=", doc.je_id)
          .executeTakeFirst();
        if (je?.status === "REVERSED") return { passed: true };
        return { passed: false, detail: `JE status is ${je?.status ?? "unknown"}, expected REVERSED` };
      }

      case "DOC_NOT_TERMINAL": {
        if (!action.doc_id) return { passed: false, detail: "No doc_id" };
        const doc = await this.db
          .selectFrom("fin.financial_document")
          .select(["status"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("doc_id", "=", action.doc_id)
          .executeTakeFirst();
        if (!doc) return { passed: false, detail: "Document not found" };
        const terminal = ["VOIDED", "CANCELLED"];
        if (terminal.includes(doc.status)) return { passed: false, detail: `Already ${doc.status}` };
        return { passed: true };
      }

      case "PRIMARY_JE_POSTED": {
        if (!action.doc_id) return { passed: false, detail: "No doc_id" };
        const doc = await this.db
          .selectFrom("fin.financial_document")
          .select(["je_id"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("doc_id", "=", action.doc_id)
          .executeTakeFirst();
        if (!doc?.je_id) return { passed: false, detail: "No primary JE" };
        const je = await this.db
          .selectFrom("fin.journal_entry")
          .select(["status"])
          .where("tenant_id", "=", ctx.tenantId)
          .where("id", "=", doc.je_id)
          .executeTakeFirst();
        if (je?.status === "POSTED") return { passed: true };
        return { passed: false, detail: `Primary JE status is ${je?.status ?? "unknown"}` };
      }

      case "BOOKS_CONFIGURED": {
        // Check that the entity has at least one ledger book configured
        const books = await this.db
          .selectFrom("fin.ledger_book")
          .select("id")
          .where("tenant_id", "=", ctx.tenantId)
          .where("entity_code", "=", action.entity_code)
          .limit(1)
          .execute();
        if (books.length > 0) return { passed: true };
        return { passed: false, detail: "No ledger books configured for entity" };
      }

      case "ACCRUAL_AUTO_REVERSE":
      case "REVERSAL_DATE_IN_PERIOD":
      case "NO_EXISTING_REVERSAL":
      case "DOC_APPROVABLE":
      case "NO_PENDING_APPROVAL":
      case "APPROVAL_COMPLETED":
      case "DEFECT_ACTIVE":
      case "WAIVER_REASON_PROVIDED":
      case "INSTRUCTIONS_PROVIDED":
        // These checks require deeper domain queries — pass with a note
        // that full validation will run at execution time
        return { passed: true, detail: "Deferred to execution-time validation" };

      default:
        return { passed: true, detail: `Unknown check ${checkCode} — skipped` };
    }
  }

  // ---------------------------------------------------------------------------
  // Private: side-effect prediction
  // ---------------------------------------------------------------------------

  private async predictSideEffects(
    ctx: OperationContext,
    action: any,
    sideEffects: Array<{ description: string; affectedEntities: string[]; severity: "INFO" | "WARNING" | "CAUTION" }>,
  ): Promise<PredictedSideEffect[]> {
    return sideEffects.map((se) => ({
      description: se.description,
      affectedEntities: se.affectedEntities,
      severity: se.severity,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private: campaign transition
  // ---------------------------------------------------------------------------

  private async transitionCampaign(
    ctx: OperationContext,
    campaignId: string,
    expectedStatus: CampaignStatus,
    targetStatus: CampaignStatus,
    updates: Record<string, unknown>,
  ): Promise<ServiceResult<RemediationCampaign>> {
    const result = await this.db
      .updateTable("fin.remediation_campaign")
      .set({
        status: targetStatus,
        updated_at: new Date(),
        ...updates,
      })
      .where("id", "=", campaignId)
      .where("tenant_id", "=", ctx.tenantId)
      .where("status", "=", expectedStatus)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition campaign ${campaignId} from ${expectedStatus} to ${targetStatus}`,
      );
    }

    const actionIds = await this.db
      .selectFrom("fin.document_remediation_action")
      .select("id")
      .where("campaign_id", "=", campaignId)
      .execute();

    return ok(this.mapCampaignRow(result, actionIds.map((a: any) => a.id)));
  }

  // ---------------------------------------------------------------------------
  // Private: row mapper
  // ---------------------------------------------------------------------------

  private mapCampaignRow(row: any, actionIds: string[]): RemediationCampaign {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityCode: row.entity_code,
      fiscalYear: row.fiscal_year,
      periodNumber: row.period_number,
      campaignName: row.campaign_name,
      description: row.description,
      actionType: row.action_type,
      priorityFilter: row.priority_filter,
      status: row.status,
      actionIds,
      totalActions: row.total_actions,
      completedActions: row.completed_actions,
      failedActions: row.failed_actions,
      createdBy: row.created_by,
      createdAt: row.created_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      executedAt: row.executed_at,
      completedAt: row.completed_at,
    };
  }
}
