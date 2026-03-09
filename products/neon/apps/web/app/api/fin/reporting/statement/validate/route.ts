/**
 * GET /api/fin/reporting/statement/validate — Validate a statement definition
 *
 * Runs structural integrity checks on a statement definition without rendering.
 * Designed for finance admins maintaining statement templates.
 *
 * Checks:
 *   - Circular formula references
 *   - Missing row references in formulas
 *   - Unused rows (defined but never referenced by parent or formula)
 *   - Unreachable subtotals (no child LINE rows)
 *   - Duplicate row codes
 *   - Orphan rows (parent_row_id references non-existent row)
 *   - Formula syntax errors
 *
 * Query params:
 *   statementCode  — required
 *
 * Response follows the Athyper diagnostic pattern:
 *   { valid, errors: [], warnings: [] }
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationIssue {
  code: string;
  severity: "error" | "warning" | "info";
  rowCode: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

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

    const statementCode = url.searchParams.get("statementCode");
    if (!statementCode) {
      return errorResponse("VALIDATION", "statementCode is required", 400);
    }

    // Load statement definition
    const defResult = await sql`
      SELECT id, statement_code
      FROM fin.rpt_statement_definition
      WHERE tenant_id = ${tenantUuid}
        AND statement_code = ${statementCode}
    `.execute(db);

    if ((defResult.rows as any[]).length === 0) {
      return errorResponse("NOT_FOUND", `Statement '${statementCode}' not found`, 404);
    }

    const defId = (defResult.rows as any[])[0].id;

    // Load all rows for this statement
    const rowResult = await sql`
      SELECT
        sr.id,
        sr.row_code       AS "rowCode",
        sr.label,
        sr.row_type       AS "rowType",
        sr.parent_row_id  AS "parentRowId",
        sr.formula_expression AS "formulaExpression",
        pr.row_code       AS "parentRowCode"
      FROM fin.rpt_statement_row sr
      LEFT JOIN fin.rpt_statement_row pr ON pr.id = sr.parent_row_id
      WHERE sr.tenant_id = ${tenantUuid}
        AND sr.statement_definition_id = ${defId}
      ORDER BY sr.sort_order
    `.execute(db);

    const rows = rowResult.rows as any[];
    const issues: ValidationIssue[] = [];

    // Build lookups
    const rowCodeSet = new Set<string>();
    const rowById = new Map<string, any>();
    const childrenByCode = new Map<string, string[]>();

    // ── Check: Duplicate row codes ──
    const codeCounts = new Map<string, number>();
    for (const row of rows) {
      codeCounts.set(row.rowCode, (codeCounts.get(row.rowCode) ?? 0) + 1);
      rowCodeSet.add(row.rowCode);
      rowById.set(row.id, row);

      if (row.parentRowCode) {
        const children = childrenByCode.get(row.parentRowCode) ?? [];
        children.push(row.rowCode);
        childrenByCode.set(row.parentRowCode, children);
      }
    }

    for (const [code, count] of codeCounts) {
      if (count > 1) {
        issues.push({
          code: "DUPLICATE_ROW_CODE",
          severity: "error",
          rowCode: code,
          message: `Row code '${code}' appears ${count} times — must be unique within a statement`,
        });
      }
    }

    // ── Check: Orphan rows (parent references non-existent row) ──
    for (const row of rows) {
      if (row.parentRowId && !rowById.has(row.parentRowId)) {
        issues.push({
          code: "ORPHAN_ROW",
          severity: "error",
          rowCode: row.rowCode,
          message: `References parent_row_id that does not exist in this statement`,
        });
      }
    }

    // ── Parse formula dependencies ──
    const formulaRows: { rowCode: string; deps: Set<string>; expression: string }[] = [];
    const allFormulaRowCodes = new Set<string>();

    for (const row of rows) {
      if (
        (row.rowType === "FORMULA" || row.rowType === "SUBTOTAL" || row.rowType === "RATIO") &&
        row.formulaExpression
      ) {
        const deps = parseDependencies(row.formulaExpression);
        formulaRows.push({ rowCode: row.rowCode, deps, expression: row.formulaExpression });
        allFormulaRowCodes.add(row.rowCode);
      }
    }

    // ── Check: Missing row references in formulas ──
    for (const fr of formulaRows) {
      for (const dep of fr.deps) {
        if (!rowCodeSet.has(dep)) {
          issues.push({
            code: "MISSING_ROW_REF",
            severity: "error",
            rowCode: fr.rowCode,
            message: `Formula references '${dep}' which does not exist in this statement`,
          });
        }
      }
    }

    // ── Check: Formula syntax ──
    for (const fr of formulaRows) {
      const syntaxError = checkFormulaSyntax(fr.expression);
      if (syntaxError) {
        issues.push({
          code: "FORMULA_SYNTAX",
          severity: "error",
          rowCode: fr.rowCode,
          message: syntaxError,
        });
      }
    }

    // ── Check: Circular references ──
    const { cycles } = detectCycles(formulaRows, allFormulaRowCodes);
    for (const c of cycles) {
      issues.push({
        code: "CIRCULAR_REF",
        severity: "error",
        rowCode: c,
        message: `Circular formula dependency detected — row '${c}' is part of a dependency cycle`,
      });
    }

    // ── Check: Unreachable subtotals (SUBTOTAL/FORMULA with no formula and no child LINE rows) ──
    for (const row of rows) {
      if (row.rowType === "SUBTOTAL" && !row.formulaExpression) {
        const children = childrenByCode.get(row.rowCode) ?? [];
        const hasLineChild = children.some((childCode) => {
          const child = rows.find((r) => r.rowCode === childCode);
          return child && (child.rowType === "LINE" || child.rowType === "SUBTOTAL");
        });
        if (!hasLineChild) {
          issues.push({
            code: "EMPTY_SUBTOTAL",
            severity: "warning",
            rowCode: row.rowCode,
            message: `SUBTOTAL row has no formula and no child LINE rows — will always show zero`,
          });
        }
      }
    }

    // ── Check: Unused rows (not a root, not referenced by any formula, no parent, no children) ──
    const referencedByFormula = new Set<string>();
    for (const fr of formulaRows) {
      for (const dep of fr.deps) {
        referencedByFormula.add(dep);
      }
    }

    for (const row of rows) {
      if (row.rowType === "SPACER" || row.rowType === "HEADING") continue;
      const hasChildren = childrenByCode.has(row.rowCode);
      const hasParent = !!row.parentRowCode;
      const isReferencedByFormula = referencedByFormula.has(row.rowCode);
      const hasFormula = !!row.formulaExpression;
      const isLineRow = row.rowType === "LINE";

      // A LINE row without a parent and not referenced by any formula is suspicious
      if (isLineRow && !hasParent && !isReferencedByFormula) {
        issues.push({
          code: "UNUSED_ROW",
          severity: "warning",
          rowCode: row.rowCode,
          message: `LINE row has no parent section and is not referenced by any formula`,
        });
      }

      // A FORMULA/SUBTOTAL/RATIO that nobody references is OK if it's a final total
      // Only flag if it has no children and no parent (truly orphan computation)
      if ((row.rowType === "FORMULA" || row.rowType === "RATIO") && !hasParent && !hasChildren && !isReferencedByFormula) {
        issues.push({
          code: "UNUSED_ROW",
          severity: "warning",
          rowCode: row.rowCode,
          message: `Computed row has no parent section and is not referenced by other formulas`,
        });
      }
    }

    // Load row mapping counts for LINE rows
    const mapResult = await sql`
      SELECT
        sr.row_code AS "rowCode",
        COUNT(rm.id) AS "mapCount"
      FROM fin.rpt_statement_row sr
      LEFT JOIN fin.rpt_statement_row_map rm ON rm.statement_row_id = sr.id
      WHERE sr.tenant_id = ${tenantUuid}
        AND sr.statement_definition_id = ${defId}
        AND sr.row_type = 'LINE'
      GROUP BY sr.row_code
    `.execute(db);

    for (const mr of mapResult.rows as any[]) {
      if (parseInt(mr.mapCount, 10) === 0) {
        issues.push({
          code: "UNMAPPED_LINE",
          severity: "warning",
          rowCode: mr.rowCode,
          message: `LINE row has no account mappings — will always show zero`,
        });
      }
    }

    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");

    return successResponse({
      statementCode,
      valid: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
    });
  } catch (err) {
    console.error("[statement/validate/GET]", err);
    return errorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Validation failed",
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDependencies(expression: string): Set<string> {
  const deps = new Set<string>();
  const expr = expression.replace(/NULLIF\(([^,]+),\s*0\)/gi, "$1");
  const tokens = expr.split(/\s*([\+\-\*\/])\s*/).filter(Boolean);
  for (const token of tokens) {
    const t = token.trim();
    if (t && !/^[\+\-\*\/]$/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) {
      deps.add(t);
    }
  }
  return deps;
}

function detectCycles(
  formulaRows: { rowCode: string; deps: Set<string> }[],
  allFormulaRowCodes: Set<string>,
): { cycles: string[] } {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycles: string[] = [];

  const depsMap = new Map<string, Set<string>>();
  for (const fr of formulaRows) {
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
      for (const dep of deps) visit(dep);
    }
    visiting.delete(code);
    visited.add(code);
  }

  for (const fr of formulaRows) visit(fr.rowCode);
  return { cycles };
}

function checkFormulaSyntax(expression: string): string | null {
  const expr = expression.replace(/NULLIF\(([^,]+),\s*0\)/gi, "$1");
  const tokens = expr.split(/\s*([\+\-\*\/])\s*/).filter(Boolean);

  if (tokens.length === 0) return "Empty formula expression";

  // Must alternate: operand, operator, operand, ...
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.trim();
    if (i % 2 === 0) {
      // Expect operand (row code or numeric literal)
      if (/^[\+\-\*\/]$/.test(t)) {
        return `Expected operand at position ${i + 1}, got operator '${t}'`;
      }
    } else {
      // Expect operator
      if (!/^[\+\-\*\/]$/.test(t)) {
        return `Expected operator at position ${i + 1}, got '${t}'`;
      }
    }
  }

  // Must end with operand (odd number of tokens)
  if (tokens.length % 2 === 0) {
    return "Formula ends with an operator — missing final operand";
  }

  return null;
}
