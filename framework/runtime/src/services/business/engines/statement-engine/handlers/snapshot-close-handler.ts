// framework/runtime/src/services/business/engines/statement-engine/handlers/snapshot-close-handler.ts
//
// SYSTEM close handler: GENERATE_STATEMENT_SNAPSHOTS
//
// Fires during period HARD_CLOSE to capture all active statement definitions
// as immutable statement_instance + statement_instance_line rows.
// This enables "what did the P&L look like at the moment of close?" queries.
//
// Handler code: close.generate_statement_snapshots
// Registered in CloseHandlerRegistry during module startup.
//
// Athyper tables:
//   - fin.rpt_statement_definition (source definitions)
//   - fin.rpt_statement_row (row definitions for rendering)
//   - fin.statement_instance (snapshot header)
//   - fin.statement_instance_line (snapshot line values)
//   - fin.rpt_balance_cube (source data)
//   - fin.fiscal_period (period status)

import { createHash } from "node:crypto";

import type { Container } from "../../../../../kernel/container.js";
import type { OperationContext } from "../../shared/engine-base.js";
import type {
  CloseHandler,
  CloseHandlerParams,
  CloseHandlerResult,
} from "../../posting-engine/domain/close-handler-registry.js";

export class StatementSnapshotCloseHandler implements CloseHandler {
  readonly handlerCode = "close.generate_statement_snapshots";
  readonly displayName = "Generate Statement Snapshots";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // ── 1. Load all active statement definitions for the entity ──

    const definitions = await db
      .selectFrom("fin.rpt_statement_definition")
      .selectAll()
      .where("tenant_id", "=", ctx.tenantId)
      .where("is_active", "=", true)
      .execute();

    if (definitions.length === 0) {
      return {
        passed: true,
        evidenceCode: "NOT_APPLICABLE",
        message: "No active statement definitions found — nothing to snapshot",
        evidence: {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
          definitionCount: 0,
        },
      };
    }

    // ── 2. Resolve period status ──

    const period = await db
      .selectFrom("fin.fiscal_period")
      .select(["status", "book_code"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const periodStatus = period?.status ?? "UNKNOWN";

    // ── 3. Find the latest cube refresh run for traceability ──

    const latestRefresh = await db
      .selectFrom("fin.rpt_cube_refresh_run")
      .select(["id", "completed_at"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("status", "=", "COMPLETED")
      .orderBy("completed_at", "desc")
      .executeTakeFirst();

    // ── 4. For each definition, render and capture ──

    const results: Array<{
      definitionCode: string;
      instanceId: string;
      lineCount: number;
      snapshotHash: string;
      definitionVersion: number;
      diagnosticCount: number;
    }> = [];
    const errors: string[] = [];

    for (const def of definitions) {
      try {
        const snapshot = await this.captureSnapshot(
          db,
          ctx,
          params,
          def,
          periodStatus,
          latestRefresh?.id ?? null,
        );
        results.push(snapshot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${def.statement_code}: ${msg}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return {
        passed: false,
        evidenceCode: "RUN_FAILED",
        message: `All ${definitions.length} statement snapshots failed: ${errors.join("; ")}`,
        evidence: {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
          periodStatus,
          renderTimestamp: new Date().toISOString(),
          errors,
          successCount: 0,
          failureCount: errors.length,
        },
      };
    }

    const allPassed = errors.length === 0;
    const totalDiagnostics = results.reduce((sum, r) => sum + r.diagnosticCount, 0);
    return {
      passed: allPassed,
      evidenceCode: allPassed ? "PASSED" : "RUN_INCOMPLETE",
      message: allPassed
        ? `${results.length} statement snapshot(s) captured successfully`
        : `${results.length}/${definitions.length} snapshots captured; ${errors.length} failed`,
      evidence: {
        entityCode: params.entityCode,
        fiscalYear: params.fiscalYear,
        periodNumber: params.periodNumber,
        periodStatus,
        renderTimestamp: new Date().toISOString(),
        successCount: results.length,
        failureCount: errors.length,
        totalDiagnostics,
        snapshots: results.map((r) => ({
          definitionCode: r.definitionCode,
          definitionVersion: r.definitionVersion,
          instanceId: r.instanceId,
          lineCount: r.lineCount,
          snapshotHash: r.snapshotHash,
          diagnosticCount: r.diagnosticCount,
        })),
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  private async captureSnapshot(
    db: any,
    ctx: OperationContext,
    params: CloseHandlerParams,
    def: any,
    periodStatus: string,
    cubeRefreshRunId: string | null,
  ): Promise<{ definitionCode: string; instanceId: string; lineCount: number; snapshotHash: string; definitionVersion: number; diagnosticCount: number }> {
    const defCode = def.statement_code;
    const bookCode = def.book_code ?? "STAT";
    const cubeCode = "FS_MONTHLY";

    // ── Render statement rows via fin.render_statement() ──

    const renderResult = await db.executeQuery(
      db.raw(`
        SELECT
          row_code, label, row_type, depth, sort_order,
          parent_row_code, display_style, sign_policy, emphasis_style,
          formula_expression, indent_level, is_expandable, is_visible,
          show_zero, amount_debit, amount_credit, amount_net,
          prior_debit, prior_credit, prior_net, variance, variance_pct,
          mapped_account_codes
        FROM fin.render_statement(
          $1, $2, $3, $4::SMALLINT, $5::SMALLINT, $6::SMALLINT, $7, $8
        )
      `, [
        ctx.tenantId,
        params.entityCode,
        defCode,
        params.fiscalYear,
        params.periodNumber,
        params.periodNumber,
        bookCode,
        cubeCode,
      ]),
    );

    const rows = renderResult.rows ?? [];

    // ── Compute canonical snapshot hash ──
    //
    // Hash specification (v1):
    //   The hash covers the full rendered artifact at the snapshot grain.
    //   It uses normalized semantic DECIMAL values (not locale-formatted strings)
    //   so hash stability is independent of later formatting changes.
    //
    //   Header context:
    //     source_definition_code, definition_version, entity_code,
    //     fiscal_year, period, book_code, currency_code
    //
    //   Per-row payload (all rows, in sort_order):
    //     row_code, label, row_type, sort_order,
    //     display_style, sign_policy, emphasis_style,
    //     amount_debit, amount_credit, amount_net,
    //     prior_debit, prior_credit, prior_net,
    //     variance, variance_pct,
    //     is_visible, show_zero
    //
    //   Hidden rows ARE included — the hash represents the complete
    //   rendered definition state, not the user-visible subset.

    const defVersion = def.version ?? 1;
    const currencyCode = def.currency_code ?? "USD";

    const headerLine = [
      defCode, defVersion, params.entityCode,
      params.fiscalYear, params.periodNumber, params.periodNumber,
      bookCode, currencyCode,
    ].join("|");

    const rowLines = rows.map((r: any) => [
      r.row_code,
      r.label,
      r.row_type,
      r.sort_order ?? 0,
      r.display_style ?? "NORMAL",
      r.sign_policy ?? "NATURAL",
      r.emphasis_style ?? "NONE",
      normalizeDecimal(r.amount_debit),
      normalizeDecimal(r.amount_credit),
      normalizeDecimal(r.amount_net),
      normalizeDecimal(r.prior_debit),
      normalizeDecimal(r.prior_credit),
      normalizeDecimal(r.prior_net),
      normalizeDecimal(r.variance),
      r.variance_pct != null ? normalizeDecimal(r.variance_pct) : "",
      r.is_visible ?? true,
      r.show_zero ?? false,
    ].join("|"));

    const hashInput = [headerLine, ...rowLines].join("\n");
    const snapshotHash = createHash("sha256").update(hashInput).digest("hex");

    // ── Collect diagnostics at capture time ──
    // Run lightweight structural checks on the rendered rows to capture
    // the diagnostic state at the moment of snapshot.

    const diagnostics = collectSnapshotDiagnostics(rows);
    const diagErrorCount = diagnostics.filter((d) => d.severity === "error").length;
    const diagWarningCount = diagnostics.filter((d) => d.severity === "warning").length;
    const diagInfoCount = diagnostics.filter((d) => d.severity === "info").length;

    // ── Check for existing snapshot (idempotent) ──

    const existing = await db
      .selectFrom("fin.statement_instance")
      .select(["id", "snapshot_hash"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("source_definition_code", "=", defCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_from", "=", params.periodNumber)
      .where("period_to", "=", params.periodNumber)
      .where("book_code", "=", bookCode)
      .where("trigger_context", "=", "PERIOD_CLOSE")
      .where("status", "in", ["FINALIZED", "PUBLISHED"])
      .executeTakeFirst();

    if (existing && existing.snapshot_hash === snapshotHash) {
      // Identical snapshot already exists — idempotent
      return {
        definitionCode: defCode,
        instanceId: existing.id,
        lineCount: rows.length,
        snapshotHash,
        definitionVersion: defVersion,
        diagnosticCount: 0,
      };
    }

    // ── If a previous snapshot exists with different hash, supersede it ──

    if (existing) {
      await db
        .updateTable("fin.statement_instance")
        .set({ status: "SUPERSEDED", updated_at: new Date() })
        .where("id", "=", existing.id)
        .execute();
    }

    // ── Insert statement_instance ──

    const now = new Date();
    const instanceResult = await db
      .insertInto("fin.statement_instance")
      .values({
        tenant_id: ctx.tenantId,
        entity_code: params.entityCode,
        definition_id: def.id,
        definition_version: def.version ?? 1,
        source_definition_code: defCode,
        fiscal_year: params.fiscalYear,
        period_from: params.periodNumber,
        period_to: params.periodNumber,
        book_code: bookCode,
        currency_code: def.currency_code ?? "USD",
        status: "FINALIZED",
        trigger_context: "PERIOD_CLOSE",
        snapshot_hash: snapshotHash,
        period_status_at_capture: periodStatus,
        generated_at: now,
        generated_by: ctx.actorId,
        gl_balance_as_of: now,
        cube_refresh_run_id: cubeRefreshRunId,
        finalized_at: now,
        total_line_count: rows.length,
        diagnostic_count: diagnostics.length,
        diagnostic_error_count: diagErrorCount,
        diagnostic_warning_count: diagWarningCount,
        diagnostic_info_count: diagInfoCount,
        diagnostics_payload: diagnostics.length > 0 ? JSON.stringify(diagnostics) : null,
        notes: `Auto-captured at period close: FY${params.fiscalYear} P${params.periodNumber}`,
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const instanceId = instanceResult.id;

    // ── Insert statement_instance_line rows ──

    if (rows.length > 0) {
      const lineValues = rows.map((r: any, idx: number) => ({
        instance_id: instanceId,
        line_id: def.id, // placeholder — engine layer FK
        line_code: r.row_code,
        label: r.label,
        line_type: r.row_type,
        parent_line_code: r.parent_row_code,
        level: r.depth ?? 0,
        sort_order: r.sort_order ?? idx,
        display_style: r.display_style ?? "NORMAL",
        sign_policy: r.sign_policy ?? "NATURAL",
        emphasis_style: r.emphasis_style ?? "NONE",
        formula_expression: r.formula_expression,
        indent_level: r.indent_level ?? 0,
        is_expandable: r.is_expandable ?? false,
        is_visible: r.is_visible ?? true,
        show_zero: r.show_zero ?? false,
        is_bold: r.display_style === "BOLD",
        is_underlined: r.display_style === "UNDERLINE" || r.display_style === "DOUBLE_LINE",
        is_calculated: ["SUBTOTAL", "CALCULATION", "FORMULA", "RATIO"].includes(r.row_type),
        current_debit: r.amount_debit ?? 0,
        current_credit: r.amount_credit ?? 0,
        current_amount: r.amount_net ?? 0,
        prior_debit: r.prior_debit ?? 0,
        prior_credit: r.prior_credit ?? 0,
        prior_amount: r.prior_net ?? 0,
        variance_amount: r.variance ?? 0,
        variance_pct: r.variance_pct,
        mapped_account_codes: r.mapped_account_codes,
        created_at: now,
      }));

      await db
        .insertInto("fin.statement_instance_line")
        .values(lineValues)
        .execute();
    }

    return {
      definitionCode: defCode,
      instanceId,
      lineCount: rows.length,
      snapshotHash,
      definitionVersion: defVersion,
      diagnosticCount: diagnostics.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a numeric value to a canonical string for hash stability.
 * Uses fixed 4-decimal representation matching DECIMAL(18,4) storage.
 * Avoids locale formatting — pure semantic value.
 */
function normalizeDecimal(value: unknown): string {
  if (value == null) return "0.0000";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return "0.0000";
  return n.toFixed(4);
}

interface SnapshotDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  rowCode: string | null;
  message: string;
}

/**
 * Lightweight structural diagnostics collected at snapshot time.
 * Mirrors the live render endpoint's diagnostic checks so the
 * snapshot records "were there known issues at capture time?"
 */
function collectSnapshotDiagnostics(rows: any[]): SnapshotDiagnostic[] {
  const diagnostics: SnapshotDiagnostic[] = [];

  if (rows.length === 0) {
    diagnostics.push({
      code: "EMPTY_STATEMENT",
      severity: "error",
      rowCode: null,
      message: "Statement definition has no rows",
    });
    return diagnostics;
  }

  const visibleRows = rows.filter((r) => r.is_visible !== false);
  if (visibleRows.length === 0) {
    diagnostics.push({
      code: "NO_VISIBLE_ROWS",
      severity: "warning",
      rowCode: null,
      message: "Statement has no visible rows — nothing will render",
    });
  }

  // Check for zero-value LINE rows (potential unmapped accounts)
  for (const r of rows) {
    if (r.row_type === "LINE" || r.row_type === "ACCOUNT") {
      const net = parseFloat(String(r.amount_net ?? 0));
      const priorNet = parseFloat(String(r.prior_net ?? 0));
      if (net === 0 && priorNet === 0) {
        diagnostics.push({
          code: "ZERO_LINE",
          severity: "info",
          rowCode: r.row_code,
          message: "Line has zero current and prior amounts at capture time",
        });
      }
    }
  }

  // Check for formula rows with null/zero results
  const formulaTypes = new Set(["FORMULA", "CALCULATION", "RATIO", "SUBTOTAL"]);
  for (const r of rows) {
    if (formulaTypes.has(r.row_type) && r.formula_expression) {
      const net = parseFloat(String(r.amount_net ?? 0));
      if (net === 0) {
        diagnostics.push({
          code: "ZERO_FORMULA",
          severity: "info",
          rowCode: r.row_code,
          message: "Formula row evaluated to zero at capture time",
        });
      }
    }
  }

  return diagnostics;
}
