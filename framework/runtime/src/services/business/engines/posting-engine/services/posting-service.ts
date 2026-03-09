// framework/runtime/src/services/business/engines/posting-engine/services/posting-service.ts
//
// Hardened Posting Service — the single gate for all GL posting.
// Enforces: double-entry balance, period control, no-post-twice,
// idempotency, and optional caller-provided transaction context.

import { ok, fail } from "../../shared/engine-base";
import {
  validateDoubleEntry,
  validateJournalLines,
} from "../domain/double-entry-validator";
import { canPostToPeriod } from "../domain/period-control";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base";
import type { JournalEntry, CreateJournalEntryInput } from "../domain/types";
import type { ChartOfAccountsRepo } from "../persistence/chart-of-accounts-repo";
import type { FiscalPeriodRepo } from "../persistence/fiscal-period-repo";
import type { GLBalanceRepo } from "../persistence/gl-balance-repo";
import type { JournalEntryRepo } from "../persistence/journal-entry-repo";
import type { DimensionResolutionService } from "./dimension-resolution-service";

/**
 * Opaque transaction handle. In production this wraps a DB transaction
 * (e.g., Kysely transaction). The exact type is implementation-specific;
 * callers pass it through from their own transaction scope.
 */
export type TransactionContext = unknown;

/**
 * Posting Service — creates and posts journal entries.
 * Enforces double-entry invariant, period control, no-post-twice,
 * and idempotency.
 */
export interface PostingService {
  /**
   * Create and post a journal entry.
   *
   * @param tx  Optional caller-provided transaction. When supplied, ALL
   *            operations (JE insert, GL balance upsert, status update)
   *            execute within the caller's transaction boundary. This is
   *            critical for payment posting where JE + invoice paid_amount
   *            updates must be atomic.
   */
  createAndPost(
    ctx: OperationContext,
    input: CreateJournalEntryInput,
    jeNumber: string,
    tx?: TransactionContext,
  ): Promise<ServiceResult<JournalEntry>>;

  /** Create a reversal JE for an existing entry */
  reverse(
    ctx: OperationContext,
    jeId: string,
    reversalJeNumber: string,
  ): Promise<ServiceResult<JournalEntry>>;

  /** Get a JE by ID with lines */
  getById(tenantId: string, id: string): Promise<JournalEntry | null>;
}

export class DefaultPostingService implements PostingService {
  constructor(
    private readonly jeRepo: JournalEntryRepo,
    private readonly periodRepo: FiscalPeriodRepo,
    private readonly glBalanceRepo: GLBalanceRepo,
    private readonly coaRepo: ChartOfAccountsRepo,
    private readonly dimService?: DimensionResolutionService,
  ) {}

  async createAndPost(
    ctx: OperationContext,
    input: CreateJournalEntryInput,
    jeNumber: string,
    tx?: TransactionContext,
  ): Promise<ServiceResult<JournalEntry>> {
    // ── 1. No-post-twice invariant ──────────────────────────────
    // Prevents duplicate JE postings from UI retries, workflow replays,
    // or admin scripts — even with different idempotency keys.
    const existingJe = await this.jeRepo.findByDocIdAndType(
      input.tenantId,
      input.docId,
      input.docType,
    );
    if (existingJe && existingJe.status !== "REVERSED") {
      return fail(
        "ALREADY_POSTED",
        `Document ${input.docId} (${input.docType}) already has a non-reversed JE: ${existingJe.jeNumber}`,
        { existingJeId: existingJe.id, existingJeNumber: existingJe.jeNumber },
      );
    }

    // ── 2. Validate lines ───────────────────────────────────────
    const lineValidation = validateJournalLines(input.lines);
    if (!lineValidation.valid) {
      return fail("INVALID_LINES", lineValidation.errors.join("; "));
    }

    // ── 3. Validate double-entry balance ────────────────────────
    const deResult = validateDoubleEntry(input.lines);
    if (!deResult.valid) {
      return fail(
        "UNBALANCED",
        `Journal entry is unbalanced: debit=${deResult.totalDebit}, credit=${deResult.totalCredit}, diff=${deResult.difference}`,
      );
    }

    // ── 4. Validate all accounts ────────────────────────────────
    for (const line of input.lines) {
      const account = await this.coaRepo.getById(ctx.tenantId, line.accountId);
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

    // ── 5. Resolve dimensions (if dimension service is available) ─
    const entityCode = ctx.entityCode ?? input.entityCode;
    const resolvedDimensions = new Map<number, string | null>();
    // Resolution metadata to persist after JE creation (need line IDs)
    const pendingResolutionMeta: Array<{
      lineIndex: number;
      dimensionSetId: string | null;
      resolutionLog: unknown[];
      resolutionHash: string;
      evaluatedPolicies: unknown[];
    }> = [];

    if (this.dimService) {
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        // Skip if caller already resolved the dimension set
        if (line.dimensionSetId) {
          resolvedDimensions.set(i, line.dimensionSetId);
          continue;
        }

        if (line.dimensionInput) {
          const dimResult = await this.dimService.resolveForLine(
            ctx.tenantId,
            entityCode,
            line.dimensionInput,
            tx,
          );

          if (dimResult.errors.length > 0) {
            return fail(
              "DIMENSION_VALIDATION",
              `Line ${i + 1}: ${dimResult.errors.join("; ")}`,
            );
          }
          resolvedDimensions.set(i, dimResult.dimensionSetId);

          // Queue resolution metadata for persistence after JE creation
          if (dimResult.resolutionHash) {
            pendingResolutionMeta.push({
              lineIndex: i,
              dimensionSetId: dimResult.dimensionSetId,
              resolutionLog: dimResult.derivationLog,
              resolutionHash: dimResult.resolutionHash,
              evaluatedPolicies: dimResult.evaluatedPolicies,
            });
          }
        }
      }
    }

    // ── 6. Find and validate fiscal period ──────────────────────
    const period = await this.periodRepo.getForDate(
      ctx.tenantId,
      entityCode,
      input.postingDate,
    );
    if (!period) {
      return fail(
        "PERIOD_NOT_FOUND",
        `No fiscal period found for date ${input.postingDate.toISOString().split("T")[0]}`,
      );
    }

    const periodCheck = canPostToPeriod(period);
    if (!periodCheck.allowed) {
      return fail("PERIOD_CLOSED", periodCheck.reason!);
    }

    // ── 7. Create JE (within caller's tx if provided) ──────────
    const je = await this.jeRepo.create(
      {
        ...input,
        jeNumber,
        fiscalYear: period.fiscalYear,
        periodNumber: period.periodNumber,
        totalDebit: deResult.totalDebit,
        totalCredit: deResult.totalCredit,
      },
      tx,
    );

    // ── 8. Update GL balances ───────────────────────────────────
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const dimSetId = resolvedDimensions.get(i) ?? line.dimensionSetId ?? null;
      await this.glBalanceRepo.incrementPeriodAmounts(
        ctx.tenantId,
        entityCode,
        line.accountId,
        period.fiscalYear,
        period.periodNumber,
        line.costCenterId ?? null,
        line.currencyCode,
        line.debitAmount,
        line.creditAmount,
        tx,
        dimSetId,
      );
    }

    // ── 9. Mark as posted ───────────────────────────────────────
    const posted = await this.jeRepo.updateStatus(
      ctx.tenantId,
      je.id,
      "POSTED",
      tx,
    );
    return ok(posted);
  }

  async reverse(
    ctx: OperationContext,
    jeId: string,
    reversalJeNumber: string,
  ): Promise<ServiceResult<JournalEntry>> {
    const originalJe = await this.jeRepo.getById(ctx.tenantId, jeId);
    if (!originalJe) {
      return fail("JE_NOT_FOUND", `Journal entry ${jeId} not found`);
    }
    if (originalJe.status !== "POSTED") {
      return fail(
        "JE_NOT_POSTED",
        `Can only reverse POSTED journal entries, current status: ${originalJe.status}`,
      );
    }
    if (originalJe.reversedById) {
      return fail(
        "JE_ALREADY_REVERSED",
        "This journal entry has already been reversed",
      );
    }

    // Get original lines and reverse them — dimensions are carried forward
    // from the original line (reversal must post to same dimension set)
    const originalLines = await this.jeRepo.getLinesByJeId(ctx.tenantId, jeId);
    const reversedLines = originalLines.map((line) => ({
      accountId: line.accountId,
      costCenterId: line.costCenterId ?? undefined,
      profitCenterId: line.profitCenterId ?? undefined,
      debitAmount: line.creditAmount, // swap debit/credit
      creditAmount: line.debitAmount,
      currencyCode: line.currencyCode,
      description: `Reversal: ${line.description ?? ""}`,
      subledgerType: line.subledgerType ?? undefined,
      subledgerRefId: line.subledgerRefId ?? undefined,
      sourceDocLineId: line.sourceDocLineId ?? undefined,
      // Dimension safety: reversal inherits exact dimension set from original
      // This is governed by rule, not accident — no re-resolution needed
      dimensionSetId: line.dimensionSetId ?? undefined,
      tags: line.tags,
    }));

    const reversalInput: CreateJournalEntryInput = {
      tenantId: ctx.tenantId,
      entityCode: originalJe.entityCode,
      txnId: originalJe.txnId,
      docId: originalJe.docId,
      docType: `${originalJe.docType}_REVERSAL`,
      accountingProfileId: originalJe.accountingProfileId ?? undefined,
      postingDate: new Date(),
      description: `Reversal of ${originalJe.jeNumber}`,
      currencyCode: originalJe.currencyCode,
      lines: reversedLines,
      postedBy: ctx.actorId,
    };

    const result = await this.createAndPost(
      ctx,
      reversalInput,
      reversalJeNumber,
    );
    if (!result.ok) return result;

    // Link original → reversal
    await this.jeRepo.setReversalLink(ctx.tenantId, jeId, result.value.id);
    await this.jeRepo.updateStatus(ctx.tenantId, jeId, "REVERSED");

    return result;
  }

  async getById(tenantId: string, id: string): Promise<JournalEntry | null> {
    return this.jeRepo.getById(tenantId, id);
  }
}
