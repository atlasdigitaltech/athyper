/**
 * GET /api/fin/reporting/statement — Render a financial statement
 *
 * Calls fin.render_statement() to produce an ordered row set with
 * amounts, formulas, and presentation metadata.
 *
 * Query params:
 *   entityCode     — required
 *   statementCode  — required (e.g., MGMT_PNL, STAT_PNL)
 *   fiscalYear     — required
 *   periodFrom     — optional, defaults to 1
 *   periodTo       — optional, defaults to 12
 *   bookCode       — optional, uses statement default or STAT
 *   cubeCode       — optional, defaults to FS_MONTHLY
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
import { subtractAmounts, compareAmounts } from "@athyper/runtime/services/business/engines/shared/money";

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  try {
    const apiCtx = await getApiContext();
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    const statementCode = url.searchParams.get("statementCode");
    if (!statementCode) {
      return errorResponse("VALIDATION", "statementCode is required", 400);
    }

    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    if (isNaN(fiscalYear)) {
      return errorResponse("VALIDATION", "fiscalYear is required", 400);
    }

    const periodFrom = parseInt(url.searchParams.get("periodFrom") ?? "1", 10);
    const periodTo = parseInt(url.searchParams.get("periodTo") ?? "12", 10);
    const bookCode = url.searchParams.get("bookCode") ?? null;
    const cubeCode = url.searchParams.get("cubeCode") ?? "FS_MONTHLY";
    const debug = url.searchParams.get("debug") === "1";

    // Load statement definition metadata
    const defResult = await sql`
      SELECT
        id,
        statement_code AS "statementCode",
        name,
        description,
        statement_type AS "statementType",
        scope,
        book_code AS "bookCode",
        is_active AS "isActive",
        version
      FROM fin.rpt_statement_definition
      WHERE tenant_id = ${tenantUuid}
        AND statement_code = ${statementCode}
        AND is_active = TRUE
    `.execute(db);

    if ((defResult.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", `Statement '${statementCode}' not found`, 404);
    }

    const definition = (defResult.rows as any[])[0];

    // Render statement using the SQL function
    const renderResult = await sql`
      SELECT
        row_code       AS "rowCode",
        label,
        row_type       AS "rowType",
        depth,
        sort_order     AS "sortOrder",
        parent_row_code AS "parentRowCode",
        display_style  AS "displayStyle",
        sign_policy    AS "signPolicy",
        emphasis_style AS "emphasisStyle",
        formula_expression AS "formulaExpression",
        indent_level   AS "indentLevel",
        is_expandable  AS "isExpandable",
        is_visible     AS "isVisible",
        show_zero      AS "showZero",
        amount_debit   AS "amountDebit",
        amount_credit  AS "amountCredit",
        amount_net     AS "amountNet",
        prior_debit    AS "priorDebit",
        prior_credit   AS "priorCredit",
        prior_net      AS "priorNet",
        variance,
        variance_pct   AS "variancePct",
        mapped_account_codes AS "mappedAccountCodes"
      FROM fin.render_statement(
        ${tenantUuid},
        ${entityCode},
        ${statementCode},
        ${fiscalYear}::SMALLINT,
        ${periodFrom}::SMALLINT,
        ${periodTo}::SMALLINT,
        ${bookCode},
        ${cubeCode}
      )
    `.execute(db);

    const rows = (renderResult.rows as any[]).map((r) => ({
      ...r,
      // MC-4: convert decimal to string
      amountDebit: String(r.amountDebit ?? "0"),
      amountCredit: String(r.amountCredit ?? "0"),
      amountNet: String(r.amountNet ?? "0"),
      priorDebit: String(r.priorDebit ?? "0"),
      priorCredit: String(r.priorCredit ?? "0"),
      priorNet: String(r.priorNet ?? "0"),
      variance: String(r.variance ?? "0"),
      variancePct: r.variancePct != null ? String(r.variancePct) : null,
    }));

    // ── Two-pass formula evaluation with dependency ordering ──
    //
    // Pass 1: Apply sign policies to non-formula rows (LINE, HEADING, SPACER,
    //         and SUBTOTAL/FORMULA/RATIO without a formula_expression).
    //         This ensures formulas read presentation-ready values.
    //
    // Pass 2: Evaluate formulas in topological dependency order, then apply
    //         sign policy to each formula result. This guarantees:
    //         - Formulas always read post-sign values from their dependencies
    //         - Circular references are detected and reported
    //         - Missing row references produce explicit warnings

    const rowMap = new Map<string, any>();
    for (const row of rows) {
      rowMap.set(row.rowCode, row);
    }

    // Pass 1: sign policy for non-formula rows
    for (const row of rows) {
      const hasFormula =
        (row.rowType === "FORMULA" || row.rowType === "SUBTOTAL" || row.rowType === "RATIO") &&
        row.formulaExpression;
      if (!hasFormula) {
        applySignPolicy(row);
      }
    }

    // Pass 2: formula evaluation in dependency order (includes sign policy for formula rows)
    const allDiagnostics: StatementDiagnosticItem[] = evaluateAllFormulas(rows, rowMap);

    // Statement-level diagnostics
    const visibleRows = rows.filter((r: any) => r.isVisible);
    if (visibleRows.length === 0) {
      allDiagnostics.push({
        code: "NO_VISIBLE_ROWS",
        severity: "warning",
        rowCode: null,
        message: "Statement has no visible rows — nothing will render",
      });
    }

    if (rows.length === 0) {
      allDiagnostics.push({
        code: "EMPTY_STATEMENT",
        severity: "error",
        rowCode: null,
        message: "Statement definition has no rows",
      });
    }

    const hasFormulaRows = rows.some(
      (r: any) => (r.rowType === "FORMULA" || r.rowType === "RATIO") && r.formulaExpression,
    );
    const hasSubtotals = rows.some((r: any) => r.rowType === "SUBTOTAL");
    if (!hasFormulaRows && !hasSubtotals && rows.length > 5) {
      allDiagnostics.push({
        code: "NO_COMPUTED_ROWS",
        severity: "info",
        rowCode: null,
        message: "Statement has no formula or subtotal rows — consider adding computed summaries",
      });
    }

    // Stable sort: severity rank → code → rowCode → message
    const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };
    allDiagnostics.sort((a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
      || a.code.localeCompare(b.code)
      || (a.rowCode ?? "").localeCompare(b.rowCode ?? "")
      || a.message.localeCompare(b.message),
    );

    if (allDiagnostics.length > 0) {
      console.warn(
        "[statement/GET] diagnostics:",
        allDiagnostics.map((w) => `[${w.severity}] ${w.rowCode ?? "STMT"}: ${w.message}`),
      );
    }

    const effectiveBook = bookCode ?? definition.bookCode ?? "STAT";

    const response: Record<string, unknown> = {
      definition,
      rows,
      fiscalYear,
      periodFrom,
      periodTo,
      bookCode: effectiveBook,
      cubeCode,
    };

    // Summary counts by severity — always included when diagnostics exist
    if (allDiagnostics.length > 0) {
      const errorCount = allDiagnostics.filter((d) => d.severity === "error").length;
      const warningCount = allDiagnostics.filter((d) => d.severity === "warning").length;
      const infoCount = allDiagnostics.filter((d) => d.severity === "info").length;
      response.diagnosticCount = allDiagnostics.length;
      response.diagnosticSummary = { errorCount, warningCount, infoCount };
    }

    // In debug mode, include full diagnostic details.
    // Role-gated: only finance_admin, tenant_admin, or platform admin personas.
    const DIAG_PERSONAS = new Set(["finance_admin", "tenant_admin"]);
    const canSeeDiagnostics = context.persona
      ? DIAG_PERSONAS.has(context.persona)
      : (context.roles ?? []).some((r: string) => r.includes("admin"));

    if (debug && canSeeDiagnostics && allDiagnostics.length > 0) {
      response.diagnostics = allDiagnostics;
    }

    return successResponse(response);
  } catch (err) {
    console.error("[statement/GET]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Failed to render statement",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Formula evaluator — with dependency ordering and safety guards
// ---------------------------------------------------------------------------
// Supports: ROW_CODE + ROW_CODE, ROW_CODE - ROW_CODE, ROW_CODE / NULLIF(ROW_CODE, 0)
// Token-based evaluation with topological sort for correct dependency ordering,
// circular reference detection, and explicit error reporting.
// ---------------------------------------------------------------------------

type DiagnosticSeverity = "error" | "warning" | "info";

interface StatementDiagnosticItem {
  code: string;
  severity: DiagnosticSeverity;
  rowCode: string | null;
  message: string;
}

/**
 * Parse row_code dependencies from a formula expression.
 * Returns the set of row_codes referenced (excludes numeric literals).
 */
function parseDependencies(expression: string): Set<string> {
  const deps = new Set<string>();
  // Strip NULLIF wrapper
  const expr = expression.replace(/NULLIF\(([^,]+),\s*0\)/gi, "$1");
  // Tokenize and pick non-operator, non-numeric tokens
  const tokens = expr.split(/\s*([\+\-\*\/])\s*/).filter(Boolean);
  for (const token of tokens) {
    const t = token.trim();
    if (t && !/^[\+\-\*\/]$/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) {
      deps.add(t);
    }
  }
  return deps;
}

/**
 * Topological sort of formula rows by their dependencies.
 * Returns ordered row codes and detects circular references.
 */
function topoSortFormulas(
  formulaRows: { rowCode: string; deps: Set<string> }[],
  allFormulaRowCodes: Set<string>,
): { ordered: string[]; cycles: string[] } {
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>(); // cycle detection (gray nodes)
  const cycles: string[] = [];

  // Build adjacency: rowCode -> deps that are also formula rows
  const depsMap = new Map<string, Set<string>>();
  for (const fr of formulaRows) {
    // Only track deps that are themselves formula rows (others are already resolved)
    const formulaDeps = new Set<string>();
    for (const d of fr.deps) {
      if (allFormulaRowCodes.has(d)) formulaDeps.add(d);
    }
    depsMap.set(fr.rowCode, formulaDeps);
  }

  function visit(code: string) {
    if (visited.has(code)) return;
    if (visiting.has(code)) {
      cycles.push(code);
      return;
    }
    visiting.add(code);
    const deps = depsMap.get(code);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }
    visiting.delete(code);
    visited.add(code);
    ordered.push(code);
  }

  for (const fr of formulaRows) {
    visit(fr.rowCode);
  }

  return { ordered, cycles };
}

/**
 * Evaluate formulas for all formula rows in correct dependency order.
 *
 * Two-pass approach:
 *   1. Sign policies applied to non-formula rows first (caller does this).
 *   2. Formulas evaluated in topological order reading post-sign values.
 *      Sign policy then applied to each formula result.
 */
function evaluateAllFormulas(
  rows: any[],
  rowMap: Map<string, any>,
): StatementDiagnosticItem[] {
  const warnings: StatementDiagnosticItem[] = [];

  // Identify formula rows
  const formulaRows: { rowCode: string; expression: string; deps: Set<string> }[] = [];
  const allFormulaRowCodes = new Set<string>();

  for (const row of rows) {
    if (
      (row.rowType === "FORMULA" || row.rowType === "SUBTOTAL" || row.rowType === "RATIO") &&
      row.formulaExpression
    ) {
      const deps = parseDependencies(row.formulaExpression);
      formulaRows.push({ rowCode: row.rowCode, expression: row.formulaExpression, deps });
      allFormulaRowCodes.add(row.rowCode);
    }
  }

  if (formulaRows.length === 0) return warnings;

  // Topological sort
  const { ordered, cycles } = topoSortFormulas(formulaRows, allFormulaRowCodes);

  // Report cycles
  for (const c of cycles) {
    warnings.push({
      code: "CIRCULAR_REF",
      severity: "error",
      rowCode: c,
      message: `Circular formula reference detected — row '${c}' depends on itself`,
    });
  }

  // Build lookup for formula expressions
  const exprMap = new Map<string, string>();
  for (const fr of formulaRows) {
    exprMap.set(fr.rowCode, fr.expression);
  }

  // Evaluate in dependency order
  for (const rowCode of ordered) {
    if (cycles.includes(rowCode)) continue; // skip cyclic rows

    const row = rowMap.get(rowCode);
    if (!row) continue;

    const expression = exprMap.get(rowCode)!;

    const { value: computed, warnings: fwCurrent } = evaluateFormula(expression, rowMap, "amountNet", rowCode);
    const { value: computedPrior, warnings: fwPrior } = evaluateFormula(expression, rowMap, "priorNet", rowCode);

    warnings.push(...fwCurrent, ...fwPrior);

    if (computed !== null) {
      row.amountNet = String(computed);
      row.amountDebit = "0";
      row.amountCredit = "0";
    }
    if (computedPrior !== null) {
      row.priorNet = String(computedPrior);
      row.priorDebit = "0";
      row.priorCredit = "0";
    }
    if (computed !== null && computedPrior !== null) {
      row.variance = String(computed - computedPrior);
      row.variancePct =
        computedPrior !== 0
          ? String(((computed - computedPrior) / Math.abs(computedPrior)) * 100)
          : null;
    }

    // Apply sign policy to formula result
    applySignPolicy(row);
  }

  return warnings;
}

/**
 * Evaluate a statement formula expression (e.g., "REVENUE_TOTAL - EXPENSE_TOTAL + 100").
 *
 * MC-4 note: This mini-calculator uses float intermediates for *, / operations
 * (which cannot overflow 4dp precision in practice — formulas are bounded sums of
 * pre-rounded GL balances). Results are rounded to 4dp before assignment.
 * Sign-policy application (INVERT/ABSOLUTE) uses string manipulation instead.
 */
function evaluateFormula(
  expression: string,
  rowMap: Map<string, any>,
  amountField: string,
  contextRowCode: string,
): { value: number | null; warnings: StatementDiagnosticItem[] } {
  const warnings: StatementDiagnosticItem[] = [];
  try {
    // Remove NULLIF wrapper for ratio safety
    let expr = expression.replace(/NULLIF\(([^,]+),\s*0\)/gi, "$1");

    // Tokenize: split by operators while keeping them
    const tokens = expr.split(/\s*([\+\-\*\/])\s*/).filter(Boolean);

    if (tokens.length === 0) return { value: null, warnings };

    // Resolve first operand
    const { value: first, warning: w0 } = resolveOperand(tokens[0]!, rowMap, amountField, contextRowCode);
    if (w0) warnings.push(w0);
    if (first === null) return { value: null, warnings };
    let result = first;

    // Process remaining operator-operand pairs
    for (let i = 1; i < tokens.length; i += 2) {
      const operator = tokens[i];
      const operand = tokens[i + 1];
      if (!operator || !operand) break;

      const { value, warning } = resolveOperand(operand, rowMap, amountField, contextRowCode);
      if (warning) warnings.push(warning);
      if (value === null) return { value: null, warnings };

      switch (operator) {
        case "+":
          result += value;
          break;
        case "-":
          result -= value;
          break;
        case "*":
          result *= value;
          break;
        case "/":
          if (value === 0) {
            // Division by zero — return null (renders as "—")
            return { value: null, warnings };
          }
          result /= value;
          break;
      }
    }

    return { value: Math.round(result * 10000) / 10000, warnings };
  } catch {
    warnings.push({ code: "FORMULA_PARSE_ERROR", severity: "error", rowCode: contextRowCode, message: `Formula parse error: ${expression}` });
    return { value: null, warnings };
  }
}

function resolveOperand(
  token: string,
  rowMap: Map<string, any>,
  amountField: string,
  contextRowCode: string,
): { value: number | null; warning?: StatementDiagnosticItem } {
  const trimmed = token.trim();

  // Numeric literal (formula engine — bounded float, see evaluateFormula MC-4 note)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK (formula engine)
    return { value: parseFloat(trimmed) };
  }

  // Row code reference
  const row = rowMap.get(trimmed);
  if (!row) {
    return {
      value: null,
      warning: {
        code: "MISSING_ROW_REF",
        severity: "error",
        rowCode: contextRowCode,
        message: `Missing row reference '${trimmed}' in formula`,
      },
    };
  }

  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK (formula engine)
  const val = parseFloat(row[amountField] ?? "0");
  return { value: isNaN(val) ? 0 : val };
}

/**
 * Apply sign policy to a single row's amount fields.
 * MC-4: uses string arithmetic for sign inversion to avoid float drift.
 */
function applySignPolicy(row: any): void {
  if (row.signPolicy === "INVERT" || row.signPolicy === "CREDIT_POSITIVE") {
    // Credits are negative in net (debit - credit), so invert for display
    row.amountNet = negateAmount(row.amountNet);
    row.priorNet = negateAmount(row.priorNet);
    row.variance = negateAmount(row.variance);
  } else if (row.signPolicy === "ABSOLUTE") {
    row.amountNet = absAmount(row.amountNet);
    row.priorNet = absAmount(row.priorNet);
    row.variance = absAmount(row.variance);
  }
  // NATURAL and DEBIT_POSITIVE: no change
}

/** Negate a string amount without float conversion. */
function negateAmount(val: string): string {
  if (!val || val === "0") return val;
  return val.startsWith("-") ? val.slice(1) : `-${val}`;
}

/** Absolute value of a string amount without float conversion. */
function absAmount(val: string): string {
  if (!val) return "0";
  return val.startsWith("-") ? val.slice(1) : val;
}
