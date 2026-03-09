// framework/runtime/src/services/business/engines/posting-engine/handlers/document-registry-close-handler.ts
//
// SYSTEM close handler: close.document_registry_readiness
//
// Queries the document registry bridge views to determine whether
// all financial documents in a period are close-ready.
//
// Defect classification:
//   DEFECT_FAILED             — HIGH: document posting failed
//   DEFECT_APPROVED_NOT_POSTED — HIGH: approved but no JE (posting gap)
//   DEFECT_POSTING_PENDING    — MEDIUM: posting in progress
//   DEFECT_UNFINALIZED        — LOW: still in DRAFT/IN_REVIEW
//
// The handler fails if any HIGH-severity defects exist. MEDIUM/LOW
// defects produce a warning but can pass if the task's config_json
// allows it (via `allow_low_severity_pass`).
//
// MC-4: monetary totals stay as strings in evidence payloads.

import type { Container } from "../../../../../kernel/container";
import type { OperationContext } from "../../shared/engine-base";
import type {
  CloseHandler,
  CloseHandlerParams,
  CloseHandlerResult,
} from "../domain/close-handler-registry";

export class DocumentRegistryCloseHandler implements CloseHandler {
  readonly handlerCode = "close.document_registry_readiness";
  readonly displayName = "Document Registry Readiness";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // ── 1. Query aggregate summary from bridge view ──────────────────
    const summaryRows = await db
      .selectFrom("fin.v_close_document_summary")
      .select([
        "doc_type",
        "close_readiness",
        "doc_count",
        "total_amount",
        "high_severity_count",
        "medium_severity_count",
        "low_severity_count",
      ])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .execute();

    if (summaryRows.length === 0) {
      return {
        passed: true,
        evidenceCode: "NOT_APPLICABLE",
        message: "No financial documents found for this period — document readiness check not applicable",
        evidence: {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
          totalDocuments: 0,
        },
      };
    }

    // ── 2. Compute totals ────────────────────────────────────────────
    let totalDocuments = 0;
    let readyDocuments = 0;
    let defectDocuments = 0;
    let highSeverityDefects = 0;
    let mediumSeverityDefects = 0;
    let lowSeverityDefects = 0;

    const defectsByType: Array<{
      docType: string;
      defectType: string;
      count: number;
      totalAmount: string;
    }> = [];

    for (const row of summaryRows) {
      const count = parseInt(row.doc_count);
      totalDocuments += count;

      if (row.close_readiness === "READY") {
        readyDocuments += count;
      } else {
        defectDocuments += count;
        defectsByType.push({
          docType: row.doc_type,
          defectType: row.close_readiness,
          count,
          totalAmount: String(row.total_amount ?? "0"),
        });
      }

      highSeverityDefects += parseInt(row.high_severity_count ?? "0");
      mediumSeverityDefects += parseInt(row.medium_severity_count ?? "0");
      lowSeverityDefects += parseInt(row.low_severity_count ?? "0");
    }

    // ── 3. Check accrual reversal gaps ───────────────────────────────
    const accrualGapResult = await db
      .selectFrom("fin.v_close_accrual_reversal_gap")
      .select((eb: any) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .where("reversal_urgency", "=", "REVERSAL_DUE_THIS_PERIOD")
      .executeTakeFirst();

    const accrualReversalGaps = parseInt(accrualGapResult?.count ?? "0");

    // ── 4. Check posting gaps ────────────────────────────────────────
    const postingGapResult = await db
      .selectFrom("fin.v_close_posting_gap")
      .select((eb: any) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const postingGaps = parseInt(postingGapResult?.count ?? "0");

    // ── 4b. Check book posting gaps (Phase 8B) ───────────────────────
    const bookGapResult = await db
      .selectFrom("fin.v_close_document_book_summary")
      .select((eb: any) =>
        eb.fn.coalesce(eb.fn.sum("missing_count"), eb.val(0)).as("missing"),
      )
      .select((eb: any) =>
        eb.fn.coalesce(eb.fn.sum("failed_count"), eb.val(0)).as("failed"),
      )
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const bookPostingGaps =
      parseInt(bookGapResult?.missing ?? "0") +
      parseInt(bookGapResult?.failed ?? "0");

    // ── 4c. Check reversed documents with misaligned reversals ───────
    const reversedResult = await db
      .selectFrom("fin.v_close_reversed_still_counted")
      .select((eb: any) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const reversedMisaligned = parseInt(reversedResult?.count ?? "0");

    // ── 4d. Check approval evidence gaps ─────────────────────────────
    const approvalGapResult = await db
      .selectFrom("fin.v_close_approval_evidence_gap")
      .select((eb: any) => eb.fn.countAll().as("count"))
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const approvalEvidenceGaps = parseInt(approvalGapResult?.count ?? "0");

    // ── 5. Determine pass/fail ───────────────────────────────────────
    const readinessPercent =
      totalDocuments > 0
        ? Math.round((readyDocuments / totalDocuments) * 100)
        : 100;

    const hasHighSeverity = highSeverityDefects > 0;
    const hasAccrualGaps = accrualReversalGaps > 0;

    // Allow low-severity pass via task policy
    const allowLowSeverityPass =
      (params.taskPolicy as any)?.allowLowSeverityPass === true;

    const hasBookGaps = bookPostingGaps > 0;
    const hasReversalMisalignment = reversedMisaligned > 0;

    const passed =
      !hasHighSeverity &&
      !hasAccrualGaps &&
      !hasBookGaps &&
      !hasReversalMisalignment &&
      (allowLowSeverityPass || defectDocuments === 0);

    const evidence = {
      totalDocuments,
      readyDocuments,
      defectDocuments,
      readinessPercent,
      highSeverityDefects,
      mediumSeverityDefects,
      lowSeverityDefects,
      defectsByType,
      accrualReversalGaps,
      postingGaps,
      bookPostingGaps,
      reversedMisaligned,
      approvalEvidenceGaps,
      entityCode: params.entityCode,
      fiscalYear: params.fiscalYear,
      periodNumber: params.periodNumber,
    };

    if (passed) {
      const qualifier =
        defectDocuments > 0
          ? ` (${defectDocuments} low-severity defect(s) allowed by policy)`
          : "";
      return {
        passed: true,
        evidenceCode: "PASSED",
        message: `Document registry ready: ${readyDocuments}/${totalDocuments} documents (${readinessPercent}%)${qualifier}`,
        evidence,
      };
    }

    // Build failure message
    const issues: string[] = [];
    if (highSeverityDefects > 0) {
      issues.push(`${highSeverityDefects} high-severity defect(s)`);
    }
    if (accrualReversalGaps > 0) {
      issues.push(`${accrualReversalGaps} accrual reversal(s) due this period`);
    }
    if (mediumSeverityDefects > 0) {
      issues.push(`${mediumSeverityDefects} medium-severity defect(s)`);
    }
    if (lowSeverityDefects > 0) {
      issues.push(`${lowSeverityDefects} low-severity defect(s)`);
    }
    if (bookPostingGaps > 0) {
      issues.push(`${bookPostingGaps} multi-book posting gap(s)`);
    }
    if (reversedMisaligned > 0) {
      issues.push(`${reversedMisaligned} reversed doc(s) with misaligned reversal`);
    }
    if (approvalEvidenceGaps > 0) {
      issues.push(`${approvalEvidenceGaps} approval evidence gap(s)`);
    }

    const evidenceCode = hasHighSeverity || hasAccrualGaps || hasBookGaps
      ? "POSTING_INCOMPLETE"
      : "RUN_INCOMPLETE";

    return {
      passed: false,
      evidenceCode,
      message: `Document registry not ready: ${defectDocuments} defect(s) across ${totalDocuments} documents — ${issues.join(", ")}`,
      evidence,
      nextSuggestedAction: hasHighSeverity
        ? "Resolve failed postings and post approved documents before close"
        : hasAccrualGaps
          ? "Generate reversal JEs for auto-reverse accruals due this period"
          : hasBookGaps
            ? "Post missing book entries for multi-book documents"
            : hasReversalMisalignment
              ? "Align reversed documents — ensure reversal entries are in the same period"
              : "Finalize or cancel draft/in-review documents",
    };
  }
}
