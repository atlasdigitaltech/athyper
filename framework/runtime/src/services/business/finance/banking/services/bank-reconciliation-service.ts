// finance/banking/services/bank-reconciliation-service.ts
//
// Bank reconciliation lifecycle service.

import { ok, fail } from "../../../engines/shared/engine-base.js";
import { subtractAmounts, sumAmounts } from "../../../engines/shared/money.js";

import { autoMatch } from "./auto-matcher.js";

import type { PaymentMatchCandidate } from "./auto-matcher.js";
import type {
  ServiceResult,
  OperationContext,
} from "../../../engines/shared/engine-base.js";
import type {
  BankStatement,
  BankStatementLine,
  ReconciliationSession,
  CreateBankStatementInput,
  MatchResult,
} from "../domain/types.js";
import type {
  BankStatementRepo,
  BankStatementLineRepo,
} from "../persistence/bank-statement-repo.js";
import type { ReconciliationSessionRepo } from "../persistence/reconciliation-repo.js";

// Payment repo interface for fetching POSTED payments for matching
export interface PaymentQueryRepo {
  getPostedPayments(
    tenantId: string,
    entityCode: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<PaymentMatchCandidate[]>;
  reconcilePayment(tenantId: string, paymentId: string): Promise<void>;
}

export interface BankReconciliationService {
  importStatement(
    ctx: OperationContext,
    input: CreateBankStatementInput,
  ): Promise<ServiceResult<BankStatement>>;
  getStatement(tenantId: string, id: string): Promise<BankStatement | null>;
  getStatementLines(
    tenantId: string,
    statementId: string,
  ): Promise<BankStatementLine[]>;
  startReconciliation(
    ctx: OperationContext,
    statementId: string,
  ): Promise<ServiceResult<ReconciliationSession>>;
  runAutoMatch(
    ctx: OperationContext,
    sessionId: string,
  ): Promise<ServiceResult<MatchResult[]>>;
  manualMatch(
    ctx: OperationContext,
    lineId: string,
    paymentId: string,
  ): Promise<ServiceResult<BankStatementLine>>;
  unmatch(
    ctx: OperationContext,
    lineId: string,
  ): Promise<ServiceResult<BankStatementLine>>;
  completeReconciliation(
    ctx: OperationContext,
    sessionId: string,
  ): Promise<ServiceResult<ReconciliationSession>>;
}

export class DefaultBankReconciliationService implements BankReconciliationService {
  constructor(
    private readonly statementRepo: BankStatementRepo,
    private readonly lineRepo: BankStatementLineRepo,
    private readonly reconRepo: ReconciliationSessionRepo,
    private readonly paymentQueryRepo: PaymentQueryRepo,
  ) {}

  async importStatement(
    ctx: OperationContext,
    input: CreateBankStatementInput,
  ): Promise<ServiceResult<BankStatement>> {
    const statement = await this.statementRepo.create({
      ...input,
      tenantId: ctx.tenantId,
    });

    // Create lines
    if (input.lines.length > 0) {
      await this.lineRepo.bulkCreate(
        ctx.tenantId,
        statement.id,
        input.lines.map((l, i) => ({
          ...l,
          lineNo: i + 1,
        })),
      );
    }

    return ok(statement);
  }

  async getStatement(
    tenantId: string,
    id: string,
  ): Promise<BankStatement | null> {
    return this.statementRepo.getById(tenantId, id);
  }

  async getStatementLines(
    tenantId: string,
    statementId: string,
  ): Promise<BankStatementLine[]> {
    return this.lineRepo.getByStatementId(tenantId, statementId);
  }

  async startReconciliation(
    ctx: OperationContext,
    statementId: string,
  ): Promise<ServiceResult<ReconciliationSession>> {
    const statement = await this.statementRepo.getById(
      ctx.tenantId,
      statementId,
    );
    if (!statement)
      return fail("NOT_FOUND", `Statement ${statementId} not found`);
    if (statement.status === "COMPLETED") {
      return fail("ALREADY_COMPLETED", "Statement is already reconciled");
    }

    // Check if session already exists
    const existing = await this.reconRepo.getByStatementId(
      ctx.tenantId,
      statementId,
    );
    if (existing && existing.status === "OPEN") {
      return ok(existing);
    }

    const lines = await this.lineRepo.getByStatementId(
      ctx.tenantId,
      statementId,
    );

    const session = await this.reconRepo.create({
      tenantId: ctx.tenantId,
      statementId,
      totalLines: lines.length,
      startedBy: ctx.actorId,
    });

    // Mark statement as IN_PROGRESS
    await this.statementRepo.updateStatus(
      ctx.tenantId,
      statementId,
      "IN_PROGRESS",
    );

    return ok(session);
  }

  async runAutoMatch(
    ctx: OperationContext,
    sessionId: string,
  ): Promise<ServiceResult<MatchResult[]>> {
    const session = await this.reconRepo.getById(ctx.tenantId, sessionId);
    if (!session) return fail("NOT_FOUND", `Session ${sessionId} not found`);
    if (session.status !== "OPEN") {
      return fail("SESSION_CLOSED", "Reconciliation session is not open");
    }

    const statement = await this.statementRepo.getById(
      ctx.tenantId,
      session.statementId,
    );
    if (!statement) return fail("NOT_FOUND", "Statement not found");

    // Get unmatched lines and POSTED payments in the statement period
    const lines = await this.lineRepo.getUnmatched(
      ctx.tenantId,
      session.statementId,
    );
    const candidates = await this.paymentQueryRepo.getPostedPayments(
      ctx.tenantId,
      statement.entityCode,
      statement.periodStart,
      statement.periodEnd,
    );

    // Run 3-pass auto-matching
    const matches = autoMatch(lines, candidates);

    // Apply auto-matches (confidence >= 90)
    for (const match of matches) {
      if (match.confidence >= 90) {
        await this.lineRepo.updateMatch(ctx.tenantId, match.lineId, {
          matchStatus: "AUTO_MATCHED",
          matchConfidence: match.confidence,
          matchedPaymentId: match.paymentId,
          matchedBy: ctx.actorId,
        });
      }
    }

    // Update session counts
    await this.refreshSessionCounts(ctx.tenantId, sessionId, statement);

    return ok(matches);
  }

  async manualMatch(
    ctx: OperationContext,
    lineId: string,
    paymentId: string,
  ): Promise<ServiceResult<BankStatementLine>> {
    const line = await this.lineRepo.getById(ctx.tenantId, lineId);
    if (!line) return fail("NOT_FOUND", `Line ${lineId} not found`);
    if (line.matchStatus !== "UNMATCHED") {
      return fail(
        "ALREADY_MATCHED",
        `Line is already in ${line.matchStatus} status`,
      );
    }

    const updated = await this.lineRepo.updateMatch(ctx.tenantId, lineId, {
      matchStatus: "MANUAL_MATCHED",
      matchConfidence: 100,
      matchedPaymentId: paymentId,
      matchedBy: ctx.actorId,
    });

    // Refresh session counts
    const session = await this.reconRepo.getByStatementId(
      ctx.tenantId,
      line.statementId,
    );
    if (session) {
      const statement = await this.statementRepo.getById(
        ctx.tenantId,
        line.statementId,
      );
      if (statement) {
        await this.refreshSessionCounts(ctx.tenantId, session.id, statement);
      }
    }

    return ok(updated);
  }

  async unmatch(
    ctx: OperationContext,
    lineId: string,
  ): Promise<ServiceResult<BankStatementLine>> {
    const line = await this.lineRepo.getById(ctx.tenantId, lineId);
    if (!line) return fail("NOT_FOUND", `Line ${lineId} not found`);
    if (line.matchStatus === "UNMATCHED") {
      return fail("NOT_MATCHED", "Line is not currently matched");
    }
    if (line.matchStatus === "CONFIRMED") {
      return fail("CONFIRMED", "Cannot unmatch a confirmed line");
    }

    const updated = await this.lineRepo.updateMatch(ctx.tenantId, lineId, {
      matchStatus: "UNMATCHED",
      matchConfidence: undefined,
      matchedPaymentId: undefined,
      matchedBy: undefined,
    });

    // Refresh session counts
    const session = await this.reconRepo.getByStatementId(
      ctx.tenantId,
      line.statementId,
    );
    if (session) {
      const statement = await this.statementRepo.getById(
        ctx.tenantId,
        line.statementId,
      );
      if (statement) {
        await this.refreshSessionCounts(ctx.tenantId, session.id, statement);
      }
    }

    return ok(updated);
  }

  async completeReconciliation(
    ctx: OperationContext,
    sessionId: string,
  ): Promise<ServiceResult<ReconciliationSession>> {
    const session = await this.reconRepo.getById(ctx.tenantId, sessionId);
    if (!session) return fail("NOT_FOUND", `Session ${sessionId} not found`);
    if (session.status !== "OPEN") {
      return fail("SESSION_CLOSED", "Session is not open");
    }

    // Get all matched lines and mark payments as RECONCILED
    const lines = await this.lineRepo.getByStatementId(
      ctx.tenantId,
      session.statementId,
    );
    const matchedLines = lines.filter(
      (l) =>
        l.matchStatus === "AUTO_MATCHED" ||
        l.matchStatus === "MANUAL_MATCHED" ||
        l.matchStatus === "CONFIRMED",
    );

    for (const line of matchedLines) {
      if (line.matchedPaymentId) {
        await this.paymentQueryRepo.reconcilePayment(
          ctx.tenantId,
          line.matchedPaymentId,
        );

        // Confirm the match
        await this.lineRepo.updateMatch(ctx.tenantId, line.id, {
          matchStatus: "CONFIRMED",
        });
      }
    }

    // Complete session
    const completed = await this.reconRepo.complete(
      ctx.tenantId,
      sessionId,
      ctx.actorId,
    );

    // Mark statement as COMPLETED
    await this.statementRepo.updateStatus(
      ctx.tenantId,
      session.statementId,
      "COMPLETED",
    );

    return ok(completed);
  }

  // -- Private helpers --

  private async refreshSessionCounts(
    tenantId: string,
    sessionId: string,
    statement: BankStatement,
  ): Promise<void> {
    const allLines = await this.lineRepo.getByStatementId(
      tenantId,
      statement.id,
    );

    const autoMatched = allLines.filter(
      (l) => l.matchStatus === "AUTO_MATCHED",
    ).length;
    const manualMatched = allLines.filter(
      (l) => l.matchStatus === "MANUAL_MATCHED",
    ).length;
    const confirmed = allLines.filter(
      (l) => l.matchStatus === "CONFIRMED",
    ).length;
    const excluded = allLines.filter(
      (l) => l.matchStatus === "EXCLUDED",
    ).length;
    const unmatched = allLines.filter(
      (l) => l.matchStatus === "UNMATCHED",
    ).length;

    // Calculate discrepancy: matched amounts vs statement closing - opening
    const matchedAmounts = allLines
      .filter(
        (l) => l.matchStatus !== "UNMATCHED" && l.matchStatus !== "EXCLUDED",
      )
      .map((l) => (l.direction === "CREDIT" ? l.amount : `-${l.amount}`));
    const netMatched =
      matchedAmounts.length > 0 ? sumAmounts(matchedAmounts) : "0";
    const expectedNet = subtractAmounts(
      statement.closingBalance,
      statement.openingBalance,
    );
    const discrepancy = subtractAmounts(expectedNet, netMatched);

    await this.reconRepo.updateCounts(tenantId, sessionId, {
      autoMatched: autoMatched + confirmed,
      manualMatched,
      unmatched,
      excluded,
      discrepancy,
    });
  }
}
