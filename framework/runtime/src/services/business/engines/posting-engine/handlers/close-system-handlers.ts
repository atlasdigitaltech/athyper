// framework/runtime/src/services/business/engines/posting-engine/handlers/close-system-handlers.ts
//
// Concrete SYSTEM close handlers for period close governance.
// Each handler validates a specific close prerequisite by querying
// existing athyper tables and services via DI container resolution.
//
// Handler codes match the `system_check_handler` column on
// `fin.period_close_task` and are registered via CloseHandlerRegistry
// during module startup.
//
// MC-4 compliance: all monetary comparisons use BigInt-based money
// utilities — no parseFloat in pass/fail logic.

import type { Container } from "../../../../../kernel/container";
import type { OperationContext } from "../../shared/engine-base";
import {
  sumAmounts,
  subtractAmounts,
  compareAmounts,
} from "../../shared/money";
import type {
  CloseHandler,
  CloseHandlerParams,
  CloseHandlerResult,
} from "../domain/close-handler-registry";

// ── 1. Trial Balance Check ────────────────────────────────────────────
//
// Validates that total debits === total credits in fin.gl_balance
// for the given entity/period. A non-zero imbalance means journal
// entries are out of balance — the period must not close.
//
// Athyper tables: fin.gl_balance
// DI token:       engine.posting.glBalanceRepo (or direct SQL)

export class TrialBalanceCloseHandler implements CloseHandler {
  readonly handlerCode = "close.trial_balance_validation";
  readonly displayName = "Trial Balance Validation";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // Query gl_balance for the period and compute total debits vs credits
    const result = await db
      .selectFrom("fin.gl_balance")
      .select([
        (eb: any) =>
          eb.fn.coalesce(eb.fn.sum("closing_debit"), eb.val(0)).as("total_debit"),
        (eb: any) =>
          eb.fn.coalesce(eb.fn.sum("closing_credit"), eb.val(0)).as("total_credit"),
      ])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    if (!result) {
      return {
        passed: false,
        evidenceCode: "MISSING_DATA",
        message: "No GL balance data found for this period",
        evidence: {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
        },
        nextSuggestedAction: "Verify that journal entries have been posted for this period",
      };
    }

    const totalDebit = String(result.total_debit ?? "0");
    const totalCredit = String(result.total_credit ?? "0");
    const imbalance = subtractAmounts(totalDebit, totalCredit);

    // Absolute value via BigInt compare — if imbalance is negative, negate it
    const absImbalance =
      compareAmounts(imbalance, "0") < 0
        ? subtractAmounts("0", imbalance)
        : imbalance;

    // Tolerance: 0.01 (sub-cent)
    const passed = compareAmounts(absImbalance, "0.01") <= 0;

    return {
      passed,
      evidenceCode: passed ? "PASSED" : "DISCREPANCY",
      message: passed
        ? `Trial balance is in balance: debits=${totalDebit}, credits=${totalCredit}`
        : `Trial balance imbalance of ${absImbalance}: debits=${totalDebit}, credits=${totalCredit}`,
      evidence: {
        totalDebit,
        totalCredit,
        imbalance: absImbalance,
        tolerance: "0.01",
        entityCode: params.entityCode,
        fiscalYear: params.fiscalYear,
        periodNumber: params.periodNumber,
      },
    };
  }
}

// ── 2. Asset Depreciation Check ───────────────────────────────────────
//
// Validates that a depreciation run has been completed for the period.
// Checks fin.depreciation_run for a COMPLETED row per book type
// that has active assets. If no assets exist for the entity, passes
// trivially (nothing to depreciate).
//
// Athyper tables: fin.depreciation_run, fin.asset, fin.asset_book
// DI token:       engine.asset.depreciationRunRepo (or direct SQL)

export class DepreciationCheckHandler implements CloseHandler {
  readonly handlerCode = "close.asset_depreciation";
  readonly displayName = "Asset Depreciation Completeness";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // Check if entity has any active/capitalized assets
    const assetCount = await db
      .selectFrom("fin.asset")
      .select((eb: any) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("status", "in", ["CAPITALIZED", "ACTIVE"])
      .executeTakeFirst();

    if (!assetCount || parseInt(assetCount.count) === 0) {
      return {
        passed: true,
        evidenceCode: "NOT_APPLICABLE",
        message: "No active assets — depreciation check not applicable",
        evidence: { activeAssetCount: 0, entityCode: params.entityCode },
      };
    }

    // Find which book types have active assets
    const bookTypes = await db
      .selectFrom("fin.asset_book as ab")
      .innerJoin("fin.asset as a", "a.id", "ab.asset_id")
      .select("ab.book_type")
      .distinct()
      .where("a.tenant_id", "=", ctx.tenantId)
      .where("a.entity_code", "=", params.entityCode)
      .where("a.status", "in", ["CAPITALIZED", "ACTIVE"])
      .execute();

    const requiredBooks = bookTypes.map((r: any) => r.book_type as string);

    // Check depreciation runs for each book type
    const runs = await db
      .selectFrom("fin.depreciation_run")
      .select(["book_type", "status", "asset_count", "total_amount"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .execute();

    const completedBooks = new Set(
      runs
        .filter((r: any) => r.status === "COMPLETED")
        .map((r: any) => r.book_type as string),
    );

    const missingBooks = requiredBooks.filter((b: string) => !completedBooks.has(b));
    const failedRuns = runs.filter((r: any) => r.status === "FAILED");

    if (failedRuns.length > 0) {
      return {
        passed: false,
        evidenceCode: "RUN_FAILED",
        message: `Depreciation run failed for book(s): ${failedRuns.map((r: any) => r.book_type).join(", ")}`,
        evidence: {
          failedBooks: failedRuns.map((r: any) => r.book_type),
          completedBooks: Array.from(completedBooks),
          requiredBooks,
        },
        nextSuggestedAction: "Investigate failed depreciation run errors and re-run",
      };
    }

    if (missingBooks.length > 0) {
      return {
        passed: false,
        evidenceCode: "MISSING_RUN",
        message: `Depreciation not run for book(s): ${missingBooks.join(", ")}`,
        evidence: {
          missingBooks,
          completedBooks: Array.from(completedBooks),
          requiredBooks,
          activeAssetCount: parseInt(assetCount.count),
        },
        nextSuggestedAction: "Run depreciation for the missing book types",
      };
    }

    // MC-4: sum total_amount using BigInt arithmetic
    const totalAmount = sumAmounts(
      runs
        .filter((r: any) => r.status === "COMPLETED")
        .map((r: any) => String(r.total_amount ?? "0")),
    );

    return {
      passed: true,
      evidenceCode: "PASSED",
      message: `Depreciation completed for all ${requiredBooks.length} book type(s): total=${totalAmount}`,
      evidence: {
        completedBooks: Array.from(completedBooks),
        totalAssets: runs.reduce((sum: number, r: any) => sum + (r.asset_count || 0), 0),
        totalAmount,
      },
    };
  }
}

// ── 3. FX Revaluation Check ──────────────────────────────────────────
//
// Validates that unrealized FX gain/loss entries have been computed
// for all foreign-currency-denominated GL accounts in the period.
// Checks fin.fx_revaluation for coverage and ensures revaluation
// JE references exist.
//
// Athyper tables: fin.fx_revaluation, fin.gl_balance, fin.chart_of_accounts
// DI token:       engine.federation.fxRevaluationRepo (or direct SQL)

export class FxRevaluationCheckHandler implements CloseHandler {
  readonly handlerCode = "close.fx_revaluation";
  readonly displayName = "FX Revaluation Completeness";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // Look up the entity's functional currency.
    // Scope: params.entityCode maps to fin.legal_entity.code (the legal entity registry).
    // If no legal entity is found, fail with CONTEXT_MISSING_ENTITY.
    const entity = await db
      .selectFrom("fin.legal_entity")
      .select("functional_currency")
      .where("tenant_id", "=", ctx.tenantId)
      .where("code", "=", params.entityCode)
      .executeTakeFirst();

    if (!entity) {
      return {
        passed: false,
        evidenceCode: "CONTEXT_MISSING_ENTITY",
        message: `Legal entity '${params.entityCode}' not found in fin.legal_entity — cannot determine functional currency`,
        evidence: {
          entityCode: params.entityCode,
        },
        nextSuggestedAction: "Register the legal entity in fin.legal_entity with a functional_currency",
      };
    }

    const functionalCurrency = entity.functional_currency;

    // Find GL accounts with foreign currency balances in this period
    const fcAccounts = await db
      .selectFrom("fin.gl_balance as gb")
      .innerJoin("fin.chart_of_accounts as coa", "coa.id", "gb.account_id")
      .select(["gb.account_id", "gb.currency_code", "coa.account_code"])
      .where("gb.tenant_id", "=", ctx.tenantId)
      .where("gb.entity_code", "=", params.entityCode)
      .where("gb.fiscal_year", "=", params.fiscalYear)
      .where("gb.period_number", "=", params.periodNumber)
      .where((eb: any) =>
        eb.or([
          eb("gb.closing_debit", "!=", 0),
          eb("gb.closing_credit", "!=", 0),
        ]),
      )
      .execute();

    // Filter to only foreign currency accounts
    const foreignAccounts = fcAccounts.filter(
      (a: any) => a.currency_code !== functionalCurrency,
    );

    if (foreignAccounts.length === 0) {
      return {
        passed: true,
        evidenceCode: "NOT_APPLICABLE",
        message: "No foreign currency balances — FX revaluation not applicable",
        evidence: {
          functionalCurrency,
          foreignAccountCount: 0,
          entityCode: params.entityCode,
        },
      };
    }

    // Check which accounts have revaluation entries for this period
    const revalEntries = await db
      .selectFrom("fin.fx_revaluation")
      .select(["account_id", "unrealized_gain_loss", "reference_je_id"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .execute();

    const revaluedAccountIds = new Set(
      revalEntries.map((r: any) => r.account_id),
    );

    const unrevaluedAccounts = foreignAccounts.filter(
      (a: any) => !revaluedAccountIds.has(a.account_id),
    );

    // Check for entries missing JE references (reval computed but not posted)
    const unpostedRevals = revalEntries.filter(
      (r: any) => r.reference_je_id == null,
    );

    if (unrevaluedAccounts.length > 0) {
      return {
        passed: false,
        evidenceCode: "MISSING_RUN",
        message: `FX revaluation missing for ${unrevaluedAccounts.length} foreign currency account(s): ${unrevaluedAccounts.map((a: any) => a.account_code).join(", ")}`,
        evidence: {
          unrevaluedAccounts: unrevaluedAccounts.map((a: any) => ({
            accountId: a.account_id,
            accountCode: a.account_code,
            currency: a.currency_code,
          })),
          totalForeignAccounts: foreignAccounts.length,
          revaluedCount: revaluedAccountIds.size,
        },
        nextSuggestedAction: "Run FX revaluation for the unrevalued foreign currency accounts",
      };
    }

    if (unpostedRevals.length > 0) {
      return {
        passed: false,
        evidenceCode: "POSTING_INCOMPLETE",
        message: `${unpostedRevals.length} FX revaluation(s) computed but not posted (missing JE reference)`,
        evidence: {
          unpostedCount: unpostedRevals.length,
          totalRevaluations: revalEntries.length,
        },
        nextSuggestedAction: "Post the pending FX revaluation journal entries",
      };
    }

    // MC-4: sum unrealized_gain_loss using BigInt arithmetic
    const totalGainLoss = sumAmounts(
      revalEntries.map((r: any) => String(r.unrealized_gain_loss ?? "0")),
    );

    return {
      passed: true,
      evidenceCode: "PASSED",
      message: `FX revaluation complete: ${revalEntries.length} account(s), net unrealized gain/loss=${totalGainLoss}`,
      evidence: {
        accountsRevalued: revalEntries.length,
        totalForeignAccounts: foreignAccounts.length,
        netUnrealizedGainLoss: totalGainLoss,
        functionalCurrency,
      },
    };
  }
}

// ── 4. Bank Reconciliation Check ─────────────────────────────────────
//
// Validates that all bank statements covering the period have been
// reconciled. Checks fin.bank_statement + fin.reconciliation_session
// for COMPLETED status and zero/acceptable discrepancy.
//
// Period scope policy (via taskPolicy.bankRecScope):
//   OVERLAP (default): any statement whose [period_start, period_end]
//     intersects the fiscal period. Catches statements spanning month
//     boundaries.
//   ENDING_WITHIN: only statements whose period_end falls within
//     the fiscal period. Use when statements must close within the
//     period to count.
//
// Athyper tables: fin.bank_statement, fin.reconciliation_session, fin.fiscal_period
// DI token:       direct SQL (no dedicated recon service token yet)

export class BankReconCheckHandler implements CloseHandler {
  readonly handlerCode = "close.bank_reconciliation";
  readonly displayName = "Bank Reconciliation Completeness";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");
    const scopePolicy = params.taskPolicy?.bankRecScope ?? "OVERLAP";

    // Find the period's date range from fiscal_period
    const period = await db
      .selectFrom("fin.fiscal_period")
      .select(["start_date", "end_date"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    if (!period) {
      return {
        passed: false,
        evidenceCode: "MISSING_PREREQUISITE",
        message: "Fiscal period not found",
        evidence: {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
        },
        nextSuggestedAction: "Ensure the fiscal calendar is configured for this entity and year",
      };
    }

    // Find bank statements based on scope policy
    let statementsQuery = db
      .selectFrom("fin.bank_statement")
      .select(["id", "statement_number", "bank_name", "status", "statement_date"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode);

    if (scopePolicy === "ENDING_WITHIN") {
      // Only statements whose period_end is within the fiscal period
      statementsQuery = statementsQuery
        .where("period_end", ">=", period.start_date)
        .where("period_end", "<=", period.end_date);
    } else {
      // OVERLAP: any statement that overlaps with the fiscal period
      statementsQuery = statementsQuery
        .where("period_end", ">=", period.start_date)
        .where("period_start", "<=", period.end_date);
    }

    const statements = await statementsQuery.execute();

    if (statements.length === 0) {
      return {
        passed: true,
        evidenceCode: "NOT_APPLICABLE",
        message: "No bank statements found for this period — reconciliation not applicable",
        evidence: {
          entityCode: params.entityCode,
          periodStart: period.start_date,
          periodEnd: period.end_date,
          scopePolicy,
          statementCount: 0,
        },
      };
    }

    // Check reconciliation sessions for each statement
    const statementIds = statements.map((s: any) => s.id);
    const sessions = await db
      .selectFrom("fin.reconciliation_session")
      .select(["statement_id", "status", "discrepancy", "unmatched"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("statement_id", "in", statementIds)
      .execute();

    const sessionMap = new Map<string, any>(
      sessions.map((s: any) => [s.statement_id, s]),
    );

    const issues: Array<{ statementNumber: string; bankName: string; reason: string; evidenceCode: string }> = [];

    for (const stmt of statements) {
      const session = sessionMap.get(stmt.id);

      if (!session) {
        issues.push({
          statementNumber: stmt.statement_number,
          bankName: stmt.bank_name ?? "unknown",
          reason: "No reconciliation session started",
          evidenceCode: "MISSING_RUN",
        });
        continue;
      }

      if (session.status !== "COMPLETED") {
        issues.push({
          statementNumber: stmt.statement_number,
          bankName: stmt.bank_name ?? "unknown",
          reason: `Reconciliation ${session.status} (not COMPLETED)`,
          evidenceCode: session.status === "FAILED" ? "RUN_FAILED" : "RUN_INCOMPLETE",
        });
        continue;
      }

      if (session.unmatched > 0) {
        issues.push({
          statementNumber: stmt.statement_number,
          bankName: stmt.bank_name ?? "unknown",
          reason: `${session.unmatched} unmatched transaction(s)`,
          evidenceCode: "UNMATCHED_ITEMS",
        });
        continue;
      }

      // MC-4: compare discrepancy using BigInt arithmetic
      const discrepancy = String(session.discrepancy ?? "0");
      const absDiscrepancy =
        compareAmounts(discrepancy, "0") < 0
          ? subtractAmounts("0", discrepancy)
          : discrepancy;

      if (compareAmounts(absDiscrepancy, "0.01") > 0) {
        issues.push({
          statementNumber: stmt.statement_number,
          bankName: stmt.bank_name ?? "unknown",
          reason: `Discrepancy of ${absDiscrepancy}`,
          evidenceCode: "DISCREPANCY",
        });
      }
    }

    if (issues.length > 0) {
      return {
        passed: false,
        evidenceCode: "RECONCILIATION_INCOMPLETE",
        message: `Bank reconciliation incomplete: ${issues.length} of ${statements.length} statement(s) have issues`,
        evidence: {
          totalStatements: statements.length,
          issueCount: issues.length,
          scopePolicy,
          issues,
        },
        nextSuggestedAction: "Complete reconciliation for all outstanding bank statements",
      };
    }

    return {
      passed: true,
      evidenceCode: "PASSED",
      message: `Bank reconciliation complete: ${statements.length} statement(s) fully reconciled`,
      evidence: {
        totalStatements: statements.length,
        reconciledCount: statements.length,
        periodStart: period.start_date,
        periodEnd: period.end_date,
        scopePolicy,
      },
    };
  }
}
