// framework/runtime/src/services/business/finance/accounting/services/manual-je-service.ts
//
// Manual Journal Entry lifecycle service.
// Orchestrates: DRAFT -> SUBMIT -> APPROVE -> POST, with DIRECT_POST mode
// for privileged roles when the Decision Grid score qualifies for zero-approval
// AND the role has `direct_post` permission.
//
// Manual JE creates journal entries with docType = "MANUAL_JE" using the
// existing PostingEngine types and repos. No separate table.
// No budget/tax/asset/inventory/commission/federation integration.

import { ok, fail } from "../../../engines/shared/engine-base.js";
import { validateDoubleEntry, validateJournalLines } from "../../../engines/posting-engine/domain/double-entry-validator.js";
import { canPostToPeriod } from "../../../engines/posting-engine/domain/period-control.js";

import type { OperationContext, ServiceResult } from "../../../engines/shared/engine-base.js";
import type {
    JournalEntry,
    CreateJournalEntryInput,
    CreateJournalLineInput,
} from "../../../engines/posting-engine/domain/types.js";
import type { PostingService } from "../../../engines/posting-engine/services/posting-service.js";
import type { JournalEntryRepo } from "../../../engines/posting-engine/persistence/journal-entry-repo.js";
import type { FiscalPeriodRepo } from "../../../engines/posting-engine/persistence/fiscal-period-repo.js";
import type { GLBalanceRepo } from "../../../engines/posting-engine/persistence/gl-balance-repo.js";
import type { ChartOfAccountsRepo } from "../../../engines/posting-engine/persistence/chart-of-accounts-repo.js";
import type { DecisionGridEvaluator, DecisionEvaluationResult } from "../../shared/decision-grid-evaluator.js";
import type { DocumentControl } from "../../shared/document-control.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE = "MANUAL_JE";
const JE_PREFIX = "MJE";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ManualJEService {
    /** Create a new DRAFT manual JE (lines included but NOT posted) */
    create(ctx: OperationContext, input: CreateJournalEntryInput): Promise<ServiceResult<JournalEntry>>;

    /** Submit for approval. If zero-approval + direct_post permission -> auto-post */
    submit(
        ctx: OperationContext,
        jeId: string,
        options?: { directPost?: boolean },
    ): Promise<ServiceResult<ManualJESubmitResult>>;

    /** Called when approval workflow completes */
    onApprovalComplete(
        ctx: OperationContext,
        jeId: string,
        outcome: "approved" | "rejected",
    ): Promise<ServiceResult<JournalEntry>>;

    /** Post an APPROVED manual JE */
    post(ctx: OperationContext, jeId: string): Promise<ServiceResult<JournalEntry>>;

    /** Reverse a POSTED manual JE */
    reverse(ctx: OperationContext, jeId: string): Promise<ServiceResult<JournalEntry>>;
}

/**
 * Result of the submit operation. Includes the JE and the decision evaluation
 * so the caller can create an approval workflow instance when required.
 */
export interface ManualJESubmitResult {
    je: JournalEntry;
    evaluation: DecisionEvaluationResult;
    /** True when the JE was auto-posted via DIRECT_POST mode */
    directPosted: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultManualJEService implements ManualJEService {
    constructor(
        private readonly jeRepo: JournalEntryRepo,
        private readonly periodRepo: FiscalPeriodRepo,
        private readonly glBalanceRepo: GLBalanceRepo,
        private readonly coaRepo: ChartOfAccountsRepo,
        private readonly postingService: PostingService,
        private readonly decisionGrid: DecisionGridEvaluator,
        private readonly documentControl: DocumentControl,
    ) {}

    // ------------------------------------------------------------------
    // create — Validate lines, generate MJE number, persist as CREATED
    // ------------------------------------------------------------------

    async create(
        ctx: OperationContext,
        input: CreateJournalEntryInput,
    ): Promise<ServiceResult<JournalEntry>> {
        // ── 1. Force docType ─────────────────────────────────────────
        const normalised: CreateJournalEntryInput = {
            ...input,
            docType: DOC_TYPE,
        };

        // ── 2. Validate individual line constraints ──────────────────
        const lineValidation = validateJournalLines(normalised.lines);
        if (!lineValidation.valid) {
            return fail("INVALID_LINES", lineValidation.errors.join("; "));
        }

        // ── 3. Validate double-entry balance ─────────────────────────
        const deResult = validateDoubleEntry(normalised.lines);
        if (!deResult.valid) {
            return fail(
                "UNBALANCED",
                `Journal entry is unbalanced: debit=${deResult.totalDebit}, credit=${deResult.totalCredit}, diff=${deResult.difference}`,
            );
        }

        // ── 4. Validate all referenced accounts ──────────────────────
        const accountError = await this.validateAccounts(ctx.tenantId, normalised.lines);
        if (accountError) {
            return accountError;
        }

        // ── 5. Find and validate fiscal period ───────────────────────
        const entityCode = ctx.entityCode ?? normalised.entityCode;
        const period = await this.periodRepo.getForDate(
            ctx.tenantId,
            entityCode,
            normalised.postingDate,
        );
        if (!period) {
            return fail(
                "PERIOD_NOT_FOUND",
                `No fiscal period found for date ${normalised.postingDate.toISOString().split("T")[0]}`,
            );
        }

        const periodCheck = canPostToPeriod(period);
        if (!periodCheck.allowed) {
            return fail("PERIOD_CLOSED", periodCheck.reason!);
        }

        // ── 6. Generate JE number ────────────────────────────────────
        const jeNumber = await this.documentControl.generateNumber(
            ctx.tenantId,
            entityCode,
            JE_PREFIX,
            period.fiscalYear,
        );

        // ── 7. Persist as CREATED (draft) ────────────────────────────
        // The JE is stored in the journal_entries table with status CREATED.
        // GL balances are NOT updated until post().
        const je = await this.jeRepo.create({
            ...normalised,
            jeNumber,
            fiscalYear: period.fiscalYear,
            periodNumber: period.periodNumber,
            totalDebit: deResult.totalDebit,
            totalCredit: deResult.totalCredit,
        });

        return ok(je);
    }

    // ------------------------------------------------------------------
    // submit — Run Decision Grid, optionally DIRECT_POST
    // ------------------------------------------------------------------

    async submit(
        ctx: OperationContext,
        jeId: string,
        options?: { directPost?: boolean },
    ): Promise<ServiceResult<ManualJESubmitResult>> {
        // ── 1. Load and verify status ────────────────────────────────
        const je = await this.jeRepo.getById(ctx.tenantId, jeId);
        if (!je) {
            return fail("JE_NOT_FOUND", `Journal entry ${jeId} not found`);
        }
        if (je.status !== "CREATED") {
            return fail(
                "INVALID_STATUS",
                `Cannot submit a journal entry in status ${je.status}; expected CREATED`,
            );
        }

        // ── 2. Evaluate via Decision Grid ────────────────────────────
        const evalResult = await this.decisionGrid.evaluate(ctx, {
            docId: je.docId,
            docType: DOC_TYPE,
            amount: je.totalDebit, // totalDebit === totalCredit for a balanced JE
            currencyCode: je.currencyCode,
            ouId: ctx.entityCode ?? je.entityCode,
            metadata: {
                jeId: je.id,
                jeNumber: je.jeNumber,
                lineCount: (await this.jeRepo.getLinesByJeId(ctx.tenantId, je.id)).length,
            },
        });

        if (!evalResult.ok) {
            return fail(
                "DECISION_GRID_FAILED",
                `Decision Grid evaluation failed: ${evalResult.error.message}`,
            );
        }

        const evaluation = evalResult.value;

        // ── 3. BLOCKED — reject the submission ───────────────────────
        if (evaluation.approvalRoute === "BLOCKED") {
            return fail(
                "SUBMISSION_BLOCKED",
                "Submission blocked by policy evaluation",
                {
                    compositeScore: evaluation.compositeScore,
                    exceptions: evaluation.exceptions,
                    pipelineId: evaluation.pipelineId,
                },
            );
        }

        // ── 4. ZERO_APPROVAL + directPost → auto-post ───────────────
        if (evaluation.approvalRoute === "ZERO_APPROVAL" && options?.directPost === true) {
            const postResult = await this.post(ctx, jeId);
            if (!postResult.ok) {
                return fail(postResult.error.code, postResult.error.message, postResult.error.details);
            }

            return ok({
                je: postResult.value,
                evaluation,
                directPosted: true,
            });
        }

        // ── 5. Approval required — return evaluation for caller ──────
        // The caller (e.g., REST handler or workflow orchestrator) is
        // responsible for creating the approval workflow instance with
        // the determined approval route.
        return ok({
            je,
            evaluation,
            directPosted: false,
        });
    }

    // ------------------------------------------------------------------
    // onApprovalComplete — handle approval workflow outcome
    // ------------------------------------------------------------------

    async onApprovalComplete(
        ctx: OperationContext,
        jeId: string,
        outcome: "approved" | "rejected",
    ): Promise<ServiceResult<JournalEntry>> {
        const je = await this.jeRepo.getById(ctx.tenantId, jeId);
        if (!je) {
            return fail("JE_NOT_FOUND", `Journal entry ${jeId} not found`);
        }

        if (je.status !== "CREATED") {
            return fail(
                "INVALID_STATUS",
                `Cannot process approval for JE in status ${je.status}; expected CREATED`,
            );
        }

        if (outcome === "rejected") {
            // Rejection: we could add a REJECTED status, but since the
            // JEStatus enum is { CREATED, POSTED, REVERSED }, we leave it
            // as CREATED so the submitter can revise and re-submit.
            // Caller should record rejection reason externally (approval workflow).
            return ok(je);
        }

        // Approved — post the journal entry
        return this.post(ctx, jeId);
    }

    // ------------------------------------------------------------------
    // post — Validate again, update GL balances, mark POSTED
    // ------------------------------------------------------------------

    async post(
        ctx: OperationContext,
        jeId: string,
    ): Promise<ServiceResult<JournalEntry>> {
        // ── 1. Load and verify status ────────────────────────────────
        const je = await this.jeRepo.getById(ctx.tenantId, jeId);
        if (!je) {
            return fail("JE_NOT_FOUND", `Journal entry ${jeId} not found`);
        }
        if (je.status !== "CREATED") {
            return fail(
                "INVALID_STATUS",
                `Cannot post a journal entry in status ${je.status}; expected CREATED`,
            );
        }

        // ── 2. Load lines ────────────────────────────────────────────
        const lines = await this.jeRepo.getLinesByJeId(ctx.tenantId, jeId);
        if (lines.length < 2) {
            return fail("INVALID_LINES", "Journal entry must have at least 2 lines");
        }

        // ── 3. Re-validate double-entry (defensive) ─────────────────
        const lineInputs: CreateJournalLineInput[] = lines.map((l) => ({
            accountId: l.accountId,
            costCenterId: l.costCenterId ?? undefined,
            profitCenterId: l.profitCenterId ?? undefined,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            currencyCode: l.currencyCode,
            description: l.description ?? undefined,
            subledgerType: l.subledgerType ?? undefined,
            subledgerRefId: l.subledgerRefId ?? undefined,
            sourceDocLineId: l.sourceDocLineId ?? undefined,
            tags: l.tags,
        }));

        const deResult = validateDoubleEntry(lineInputs);
        if (!deResult.valid) {
            return fail(
                "UNBALANCED",
                `Journal entry is unbalanced at post time: debit=${deResult.totalDebit}, credit=${deResult.totalCredit}, diff=${deResult.difference}`,
            );
        }

        // ── 4. Re-validate all accounts (may have changed since draft) ──
        const accountError = await this.validateAccounts(ctx.tenantId, lineInputs);
        if (accountError) {
            return accountError;
        }

        // ── 5. Validate fiscal period is still open ──────────────────
        const entityCode = ctx.entityCode ?? je.entityCode;
        const period = await this.periodRepo.getForDate(
            ctx.tenantId,
            entityCode,
            je.postingDate,
        );
        if (!period) {
            return fail(
                "PERIOD_NOT_FOUND",
                `No fiscal period found for date ${je.postingDate.toISOString().split("T")[0]}`,
            );
        }

        const periodCheck = canPostToPeriod(period);
        if (!periodCheck.allowed) {
            return fail("PERIOD_CLOSED", periodCheck.reason!);
        }

        // ── 6. Update GL balances ────────────────────────────────────
        for (const line of lines) {
            await this.glBalanceRepo.incrementPeriodAmounts(
                ctx.tenantId,
                entityCode,
                line.accountId,
                period.fiscalYear,
                period.periodNumber,
                line.costCenterId,
                line.currencyCode,
                line.debitAmount,
                line.creditAmount,
            );
        }

        // ── 7. Mark as POSTED ────────────────────────────────────────
        const posted = await this.jeRepo.updateStatus(ctx.tenantId, je.id, "POSTED");
        return ok(posted);
    }

    // ------------------------------------------------------------------
    // reverse — Delegate to PostingService which handles reversal logic
    // ------------------------------------------------------------------

    async reverse(
        ctx: OperationContext,
        jeId: string,
    ): Promise<ServiceResult<JournalEntry>> {
        // Verify the JE exists and belongs to this tenant
        const je = await this.jeRepo.getById(ctx.tenantId, jeId);
        if (!je) {
            return fail("JE_NOT_FOUND", `Journal entry ${jeId} not found`);
        }
        if (je.docType !== DOC_TYPE) {
            return fail(
                "WRONG_DOC_TYPE",
                `Cannot reverse non-Manual JE via this service; docType is ${je.docType}`,
            );
        }

        // Generate a reversal JE number
        const entityCode = ctx.entityCode ?? je.entityCode;
        const reversalJeNumber = await this.documentControl.generateNumber(
            ctx.tenantId,
            entityCode,
            JE_PREFIX,
            je.fiscalYear,
        );

        // PostingService.reverse() handles: status checks, line swap,
        // GL balance updates, reversal linking, and status transitions.
        return this.postingService.reverse(ctx, jeId, reversalJeNumber);
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    /**
     * Validate that all accounts in the line set are active, non-group,
     * and allow direct posting.
     */
    private async validateAccounts(
        tenantId: string,
        lines: CreateJournalLineInput[],
    ): Promise<ServiceResult<never> | null> {
        for (const line of lines) {
            const account = await this.coaRepo.getById(tenantId, line.accountId);
            if (!account) {
                return fail("ACCOUNT_NOT_FOUND", `Account ${line.accountId} not found`);
            }
            if (!account.isActive) {
                return fail(
                    "ACCOUNT_INACTIVE",
                    `Account ${account.accountCode} is inactive`,
                );
            }
            if (account.isGroup) {
                return fail(
                    "ACCOUNT_IS_GROUP",
                    `Cannot post to group account ${account.accountCode}`,
                );
            }
            if (!account.allowDirectPosting) {
                return fail(
                    "ACCOUNT_NO_DIRECT_POST",
                    `Account ${account.accountCode} does not allow direct posting`,
                );
            }
        }
        return null;
    }
}
