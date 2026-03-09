/**
 * GET /api/fin/gl/consistency
 *
 * Validates financial truth consistency across the posting pipeline:
 *   1. GL Balance vs Journal Lines (do pre-aggregated balances match journal truth?)
 *   2. Statement Snapshot vs GL Balance (do published statements match GL?)
 *   3. Bank Reconciliation completeness (all statements reconciled for period?)
 *
 * Query params:
 *   entityCode   — required
 *   fiscalYear   — required
 *   periodNumber — required
 *   bookCode     — optional, defaults to STAT
 *
 * Returns:
 *   { consistent: boolean, checks: [...], gateResult: "PASS" | "FAIL" }
 *
 * Used by release preflight to enforce DATA_INTEGRITY and RECONCILIATION gates.
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

interface ConsistencyCheck {
  check: string;
  gate: "DATA_INTEGRITY" | "RECONCILIATION";
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  message: string;
  evidence?: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);
    const bookCode = url.searchParams.get("bookCode") ?? "STAT";

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    const checks: ConsistencyCheck[] = [];

    // -----------------------------------------------------------------------
    // CHECK 1: GL Balance vs Journal Lines
    // -----------------------------------------------------------------------
    // Compare fin.gl_balance period totals against sum(journal_line) for POSTED JEs
    const glVsJournalResult = await sql<{
      source: string;
      total_debit: string;
      total_credit: string;
    }>`
      -- GL Balance totals
      select 'gl_balance' as source,
             coalesce(sum(period_debit), 0)::text  as total_debit,
             coalesce(sum(period_credit), 0)::text as total_credit
      from fin.gl_balance
      where tenant_id = ${tenantUuid}::uuid
        and entity_code = ${entityCode}
        and book_code = ${bookCode}
        and fiscal_year = ${fiscalYear}
        and period_number = ${periodNumber}

      union all

      -- Journal line totals (ground truth)
      select 'journal_lines' as source,
             coalesce(sum(jl.debit_amount), 0)::text  as total_debit,
             coalesce(sum(jl.credit_amount), 0)::text as total_credit
      from fin.journal_line jl
      join fin.journal_entry je on je.id = jl.je_id and je.tenant_id = jl.tenant_id
      where je.tenant_id = ${tenantUuid}::uuid
        and je.entity_code = ${entityCode}
        and je.book_code = ${bookCode}
        and je.fiscal_year = ${fiscalYear}
        and je.period_number = ${periodNumber}
        and je.status = 'POSTED'
    `.execute(db);

    const glRow = glVsJournalResult.rows.find((r) => r.source === "gl_balance");
    const jeRow = glVsJournalResult.rows.find((r) => r.source === "journal_lines");

    if (!jeRow || (jeRow.total_debit === "0" && jeRow.total_credit === "0")) {
      checks.push({
        check: "GL_BALANCE_VS_JOURNAL",
        gate: "DATA_INTEGRITY",
        status: "SKIP",
        message: "No posted journal entries for this period",
      });
    } else if (
      glRow &&
      glRow.total_debit === jeRow.total_debit &&
      glRow.total_credit === jeRow.total_credit
    ) {
      checks.push({
        check: "GL_BALANCE_VS_JOURNAL",
        gate: "DATA_INTEGRITY",
        status: "PASS",
        message: "GL balance totals match journal line totals",
        evidence: {
          glDebit: glRow.total_debit,
          glCredit: glRow.total_credit,
          jeDebit: jeRow.total_debit,
          jeCredit: jeRow.total_credit,
        },
      });
    } else {
      checks.push({
        check: "GL_BALANCE_VS_JOURNAL",
        gate: "DATA_INTEGRITY",
        status: "FAIL",
        message: "GL balance totals do NOT match journal line totals — projection is stale or corrupt",
        evidence: {
          glDebit: glRow?.total_debit ?? "MISSING",
          glCredit: glRow?.total_credit ?? "MISSING",
          jeDebit: jeRow.total_debit,
          jeCredit: jeRow.total_credit,
        },
      });
    }

    // -----------------------------------------------------------------------
    // CHECK 2: Double-entry integrity (sum debits == sum credits for POSTED JEs)
    // -----------------------------------------------------------------------
    if (jeRow && (jeRow.total_debit !== "0" || jeRow.total_credit !== "0")) {
      if (jeRow.total_debit === jeRow.total_credit) {
        checks.push({
          check: "DOUBLE_ENTRY_BALANCE",
          gate: "DATA_INTEGRITY",
          status: "PASS",
          message: "Double-entry invariant holds: total debits equal total credits",
          evidence: {
            totalDebit: jeRow.total_debit,
            totalCredit: jeRow.total_credit,
          },
        });
      } else {
        checks.push({
          check: "DOUBLE_ENTRY_BALANCE",
          gate: "DATA_INTEGRITY",
          status: "FAIL",
          message: `Double-entry invariant BROKEN: debits (${jeRow.total_debit}) != credits (${jeRow.total_credit})`,
          evidence: {
            totalDebit: jeRow.total_debit,
            totalCredit: jeRow.total_credit,
            difference: String(Number(jeRow.total_debit) - Number(jeRow.total_credit)),
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // CHECK 3: Statement Snapshot vs GL Balance
    // -----------------------------------------------------------------------
    // If there's a certified statement snapshot, its totals should match GL
    const snapshotResult = await sql<{
      snapshot_id: string;
      total_debit: string;
      total_credit: string;
      content_hash: string;
    }>`
      select
        ss.id as snapshot_id,
        coalesce((ss.snapshot_data->>'totalDebit'), '0') as total_debit,
        coalesce((ss.snapshot_data->>'totalCredit'), '0') as total_credit,
        ss.content_hash
      from fin.statement_snapshot ss
      where ss.tenant_id = ${tenantUuid}::uuid
        and ss.entity_code = ${entityCode}
        and ss.fiscal_year = ${fiscalYear}
        and ss.period_number = ${periodNumber}
      order by ss.created_at desc
      limit 1
    `.execute(db);

    if (!snapshotResult.rows.length) {
      checks.push({
        check: "SNAPSHOT_VS_GL",
        gate: "DATA_INTEGRITY",
        status: "SKIP",
        message: "No statement snapshot exists for this period",
      });
    } else {
      const snap = snapshotResult.rows[0];
      if (glRow && snap.total_debit === glRow.total_debit && snap.total_credit === glRow.total_credit) {
        checks.push({
          check: "SNAPSHOT_VS_GL",
          gate: "DATA_INTEGRITY",
          status: "PASS",
          message: "Statement snapshot totals match GL balance",
          evidence: {
            snapshotId: snap.snapshot_id,
            snapshotDebit: snap.total_debit,
            snapshotCredit: snap.total_credit,
            glDebit: glRow.total_debit,
            glCredit: glRow.total_credit,
            contentHash: snap.content_hash,
          },
        });
      } else {
        checks.push({
          check: "SNAPSHOT_VS_GL",
          gate: "DATA_INTEGRITY",
          status: "FAIL",
          message: "Statement snapshot totals do NOT match GL balance — snapshot is stale",
          evidence: {
            snapshotId: snap.snapshot_id,
            snapshotDebit: snap.total_debit,
            snapshotCredit: snap.total_credit,
            glDebit: glRow?.total_debit ?? "MISSING",
            glCredit: glRow?.total_credit ?? "MISSING",
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // CHECK 4: Bank Reconciliation Completeness
    // -----------------------------------------------------------------------
    // All bank statements overlapping this period must have COMPLETED reconciliation
    const reconResult = await sql<{
      statement_id: string;
      statement_number: string;
      recon_status: string | null;
      unmatched: number;
      discrepancy: string | null;
    }>`
      select
        bs.id                as statement_id,
        bs.statement_number,
        rs.status            as recon_status,
        coalesce(rs.unmatched, 0)::int as unmatched,
        rs.discrepancy::text
      from fin.bank_statement bs
      left join lateral (
        select * from fin.reconciliation_session r
        where r.statement_id = bs.id and r.tenant_id = bs.tenant_id
        order by r.created_at desc limit 1
      ) rs on true
      where bs.tenant_id = ${tenantUuid}::uuid
        and bs.entity_code = ${entityCode}
        and bs.period_end >= (
          select fp.start_date from fin.fiscal_period fp
          where fp.tenant_id = ${tenantUuid}::uuid
            and fp.entity_code = ${entityCode}
            and fp.fiscal_year = ${fiscalYear}
            and fp.period_number = ${periodNumber}
        )
        and bs.period_start <= (
          select fp.end_date from fin.fiscal_period fp
          where fp.tenant_id = ${tenantUuid}::uuid
            and fp.entity_code = ${entityCode}
            and fp.fiscal_year = ${fiscalYear}
            and fp.period_number = ${periodNumber}
        )
    `.execute(db);

    if (!reconResult.rows.length) {
      checks.push({
        check: "BANK_RECONCILIATION",
        gate: "RECONCILIATION",
        status: "SKIP",
        message: "No bank statements overlap this period",
      });
    } else {
      const incomplete = reconResult.rows.filter(
        (r) => r.recon_status !== "COMPLETED" || r.unmatched > 0 ||
          (r.discrepancy && Math.abs(Number(r.discrepancy)) > 0.01),
      );

      if (incomplete.length === 0) {
        checks.push({
          check: "BANK_RECONCILIATION",
          gate: "RECONCILIATION",
          status: "PASS",
          message: `All ${reconResult.rows.length} bank statement(s) fully reconciled`,
          evidence: {
            totalStatements: reconResult.rows.length,
          },
        });
      } else {
        checks.push({
          check: "BANK_RECONCILIATION",
          gate: "RECONCILIATION",
          status: "FAIL",
          message: `${incomplete.length} of ${reconResult.rows.length} bank statement(s) have reconciliation issues`,
          evidence: {
            totalStatements: reconResult.rows.length,
            incompleteStatements: incomplete.map((r) => ({
              statementId: r.statement_id,
              statementNumber: r.statement_number,
              reconStatus: r.recon_status ?? "NONE",
              unmatchedLines: r.unmatched,
              discrepancy: r.discrepancy,
            })),
          },
        });
      }
    }

    // -----------------------------------------------------------------------
    // Aggregate gate result
    // -----------------------------------------------------------------------
    const hasFail = checks.some((c) => c.status === "FAIL");
    const dataIntegrityPass = !checks.some((c) => c.gate === "DATA_INTEGRITY" && c.status === "FAIL");
    const reconciliationPass = !checks.some((c) => c.gate === "RECONCILIATION" && c.status === "FAIL");

    return successResponse({
      consistent: !hasFail,
      gateResult: hasFail ? "FAIL" : "PASS",
      gates: {
        DATA_INTEGRITY: dataIntegrityPass ? "PASS" : "FAIL",
        RECONCILIATION: reconciliationPass ? "PASS" : "FAIL",
      },
      checks,
      evaluatedAt: new Date().toISOString(),
      context: { entityCode, fiscalYear, periodNumber, bookCode },
    });
  } catch (err) {
    console.error("[gl-consistency] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to evaluate consistency");
  } finally {
    await redis?.quit();
  }
}
