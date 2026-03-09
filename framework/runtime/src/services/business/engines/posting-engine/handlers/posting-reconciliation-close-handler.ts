// framework/runtime/src/services/business/engines/posting-engine/handlers/posting-reconciliation-close-handler.ts
//
// SYSTEM close handler: close.posting_reconciliation
//
// Cross-validates the document→JE→book posting pipeline for a period.
// Queries v_posting_reconciliation_summary and v_posting_reconciliation
// to produce structured reconciliation evidence.
//
// Defect classification:
//   POSTED_NO_JE           — HIGH: document POSTED with no JE reference
//   JE_REVERSED_DOC_NOT    — HIGH: JE reversed but document still POSTED
//   AMOUNT_MISMATCH        — MEDIUM: document amount != JE total
//   INCOMPLETE_MULTIBOOK   — MEDIUM: missing book bridge entries
//
// The handler fails if any HIGH-severity findings exist.
// MEDIUM findings produce a warning but pass if task policy allows it.
//
// MC-4: monetary totals stay as strings in evidence payloads.

import type { Container } from "../../../../../kernel/container";
import type { OperationContext } from "../../shared/engine-base";
import type {
  CloseHandler,
  CloseHandlerParams,
  CloseHandlerResult,
} from "../domain/close-handler-registry";

export class PostingReconciliationCloseHandler implements CloseHandler {
  readonly handlerCode = "close.posting_reconciliation";
  readonly displayName = "Posting Reconciliation";

  constructor(private readonly container: Container) {}

  async execute(
    ctx: OperationContext,
    params: CloseHandlerParams,
  ): Promise<CloseHandlerResult> {
    const db = await this.container.resolve<any>("db");

    // ── 1. Query aggregate summary ──────────────────────────────────────
    const summary = await db
      .selectFrom("fin.v_posting_reconciliation_summary")
      .select([
        "total_findings",
        "high_findings",
        "medium_findings",
        "posted_no_je_count",
        "je_reversed_doc_not_count",
        "amount_mismatch_count",
        "incomplete_multibook_count",
      ])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .executeTakeFirst();

    const totalFindings = parseInt(summary?.total_findings ?? "0");
    const highFindings = parseInt(summary?.high_findings ?? "0");
    const mediumFindings = parseInt(summary?.medium_findings ?? "0");
    const postedNoJe = parseInt(summary?.posted_no_je_count ?? "0");
    const jeReversedDocNot = parseInt(summary?.je_reversed_doc_not_count ?? "0");
    const amountMismatch = parseInt(summary?.amount_mismatch_count ?? "0");
    const incompleteMultibook = parseInt(summary?.incomplete_multibook_count ?? "0");

    if (totalFindings === 0) {
      return {
        passed: true,
        evidenceCode: "PASSED",
        message: "Posting reconciliation clean — all documents fully reconciled",
        evidence: {
          totalFindings: 0,
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
        },
      };
    }

    // ── 2. Query top findings for evidence detail ───────────────────────
    const findings = await db
      .selectFrom("fin.v_posting_reconciliation")
      .select([
        "doc_registry_id",
        "doc_id",
        "doc_type",
        "doc_no",
        "doc_amount",
        "currency_code",
        "finding_type",
        "finding_severity",
        "finding_detail",
      ])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_code", "=", params.entityCode)
      .where("fiscal_year", "=", params.fiscalYear)
      .where("period_number", "=", params.periodNumber)
      .orderBy("finding_severity", "asc") // HIGH first
      .limit(20)
      .execute();

    const findingDetails = findings.map((f: any) => ({
      docId: f.doc_id,
      docType: f.doc_type,
      docNo: f.doc_no,
      docAmount: String(f.doc_amount ?? "0"),
      currencyCode: f.currency_code,
      findingType: f.finding_type,
      findingSeverity: f.finding_severity,
      findingDetail: f.finding_detail,
    }));

    // ── 3. Determine pass/fail ──────────────────────────────────────────
    const allowMediumPass =
      (params.taskPolicy as any)?.allowMediumSeverityPass === true;

    const passed = highFindings === 0 && (allowMediumPass || mediumFindings === 0);

    const evidence = {
      totalFindings,
      highFindings,
      mediumFindings,
      postedNoJe,
      jeReversedDocNot,
      amountMismatch,
      incompleteMultibook,
      findings: findingDetails,
      entityCode: params.entityCode,
      fiscalYear: params.fiscalYear,
      periodNumber: params.periodNumber,
    };

    if (passed) {
      return {
        passed: true,
        evidenceCode: "PASSED",
        message: `Posting reconciliation passed with ${mediumFindings} medium-severity finding(s) allowed by policy`,
        evidence,
      };
    }

    // ── 4. Build failure message ────────────────────────────────────────
    const issues: string[] = [];
    if (postedNoJe > 0) issues.push(`${postedNoJe} doc(s) POSTED without JE`);
    if (jeReversedDocNot > 0) issues.push(`${jeReversedDocNot} JE(s) reversed but doc still POSTED`);
    if (amountMismatch > 0) issues.push(`${amountMismatch} amount mismatch(es)`);
    if (incompleteMultibook > 0) issues.push(`${incompleteMultibook} incomplete multi-book posting(s)`);

    return {
      passed: false,
      evidenceCode: highFindings > 0 ? "DISCREPANCY" : "RECONCILIATION_INCOMPLETE",
      message: `Posting reconciliation failed: ${totalFindings} finding(s) — ${issues.join(", ")}`,
      evidence,
      nextSuggestedAction: postedNoJe > 0
        ? "Re-post documents missing journal entries"
        : jeReversedDocNot > 0
          ? "Align document status with reversed JE status"
          : amountMismatch > 0
            ? "Investigate amount discrepancies between documents and journal entries"
            : "Complete multi-book posting for documents with missing book bridge entries",
    };
  }
}
