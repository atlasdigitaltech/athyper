// lib/finance/export-remediation-package.ts
//
// Client-side export of a Remediation Audit Package as multi-sheet Excel (.xls).
// Bundles: remediation summary, action log, campaign summary, preview log,
// and playbook reference into a single downloadable file.
//
// Follows the same pattern as export-audit-package.ts.

import type {
  RemediationActionDTO,
  RemediationSummaryDTO,
  RemediationCampaignDTO,
  RemediationPreviewDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Package shape
// ---------------------------------------------------------------------------

export interface RemediationAuditPackage {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  exportedAt: string;
  exportId?: string;
  contentHash?: string;
  summary: RemediationSummaryDTO;
  actions: RemediationActionDTO[];
  campaigns: RemediationCampaignDTO[];
  previews: RemediationPreviewDTO[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function downloadRemediationAuditPackage(pkg: RemediationAuditPackage): void {
  const filename = `${pkg.entityCode}_P${pkg.periodNumber}_FY${pkg.fiscalYear}_remediation_audit_${new Date().toISOString().slice(0, 10)}.xls`;

  const sheets: SheetData[] = [];

  // 1. Export Summary
  sheets.push({
    title: "Export Summary",
    headers: ["Field", "Value"],
    rows: [
      ["Entity", pkg.entityCode],
      ["Fiscal Year", String(pkg.fiscalYear)],
      ["Period", `P${pkg.periodNumber}`],
      ["Exported At", pkg.exportedAt],
      ["Export ID", pkg.exportId ?? "N/A"],
      ["Content Hash (SHA-256)", pkg.contentHash ?? "N/A"],
      ["Total Actions", String(pkg.summary.totalActions)],
      ["Suggested", String(pkg.summary.suggestedCount)],
      ["Approved", String(pkg.summary.approvedCount)],
      ["Executing", String(pkg.summary.executingCount)],
      ["Completed", String(pkg.summary.completedCount)],
      ["Rejected", String(pkg.summary.rejectedCount)],
      ["Failed", String(pkg.summary.failedCount)],
      ["Critical Priority", String(pkg.summary.criticalCount)],
      ["High Priority", String(pkg.summary.highCount)],
    ],
  });

  // 2. Remediation Action Log
  if (pkg.actions.length > 0) {
    sheets.push({
      title: "Remediation Actions",
      headers: [
        "ID", "Doc No", "Doc Type", "Action Type", "Priority", "Status",
        "Source", "Source Ref", "Suggested By", "Suggested At",
        "Approved By", "Approved At", "Executed By", "Executed At",
        "Rejection Reason", "Failure Reason",
      ],
      rows: pkg.actions.map((a) => [
        a.id,
        a.docNo ?? "",
        a.docType ?? "",
        a.actionType,
        a.priority,
        a.status,
        a.sourceType,
        a.sourceRef ?? "",
        a.suggestedBy ?? "",
        a.suggestedAt ?? "",
        a.approvedBy ?? "",
        a.approvedAt ?? "",
        a.executedBy ?? "",
        a.executedAt ?? "",
        a.rejectionReason ?? "",
        a.failureReason ?? "",
      ]),
    });
  }

  // 3. Campaign Summary
  if (pkg.campaigns.length > 0) {
    sheets.push({
      title: "Campaigns",
      headers: [
        "ID", "Campaign Name", "Action Type", "Status", "Risk Level",
        "Total Actions", "Completed", "Failed",
        "Created By", "Created At", "Approved By", "Approved At",
        "Executed At", "Completed At",
      ],
      rows: pkg.campaigns.map((c) => [
        c.id,
        c.campaignName,
        c.actionType,
        c.status,
        c.riskLevel ?? "",
        String(c.totalActions),
        String(c.completedActions),
        String(c.failedActions),
        c.createdBy,
        c.createdAt,
        c.approvedBy ?? "",
        c.approvedAt ?? "",
        c.executedAt ?? "",
        c.completedAt ?? "",
      ]),
    });
  }

  // 4. Preview / Dry-Run Log
  if (pkg.previews.length > 0) {
    sheets.push({
      title: "Preview Log",
      headers: [
        "Action ID", "Action Type", "Doc No", "Risk Level",
        "Prerequisites Met", "Can Execute", "Impact Summary",
        "Blocking Reasons",
      ],
      rows: pkg.previews.map((p) => [
        p.actionId,
        p.actionType,
        p.docNo ?? "",
        p.playbook.riskLevel,
        p.allPrerequisitesMet ? "Yes" : "No",
        p.canExecute ? "Yes" : "No",
        p.impactSummary,
        p.blockingReasons.join("; "),
      ]),
    });
  }

  // 5. Prerequisite Detail (flattened from all previews)
  const prereqRows: string[][] = [];
  for (const p of pkg.previews) {
    for (const pr of p.prerequisiteResults) {
      prereqRows.push([
        p.actionId,
        p.docNo ?? "",
        pr.checkCode,
        pr.description,
        pr.passed ? "PASS" : "FAIL",
        pr.detail ?? "",
      ]);
    }
  }
  if (prereqRows.length > 0) {
    sheets.push({
      title: "Prerequisite Checks",
      headers: ["Action ID", "Doc No", "Check Code", "Description", "Result", "Detail"],
      rows: prereqRows,
    });
  }

  // 6. Side Effects (flattened from all previews)
  const sideEffectRows: string[][] = [];
  for (const p of pkg.previews) {
    for (const se of p.predictedSideEffects) {
      sideEffectRows.push([
        p.actionId,
        p.docNo ?? "",
        se.severity,
        se.description,
        se.affectedEntities.join(", "),
        se.affectedRecordCount != null ? String(se.affectedRecordCount) : "",
      ]);
    }
  }
  if (sideEffectRows.length > 0) {
    sheets.push({
      title: "Predicted Side Effects",
      headers: ["Action ID", "Doc No", "Severity", "Description", "Affected Entities", "Record Count"],
      rows: sideEffectRows,
    });
  }

  downloadMultiSheetExcel(filename, sheets);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SheetData {
  title: string;
  headers: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Multi-sheet Excel (HTML table approach — same as export-audit-package.ts)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadMultiSheetExcel(filename: string, sheets: SheetData[]): void {
  const lines: string[] = [];

  lines.push(`<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">`);
  lines.push(`<head><meta charset="utf-8">`);
  lines.push(`<style>
  td { mso-number-format: "\\@"; font-family: Calibri; font-size: 10pt; }
  .header { background-color: #2F5496; color: white; font-weight: bold; }
  .sheet-title { font-size: 13pt; font-weight: bold; }
  .sep { border-bottom: 2px solid #2F5496; }
</style></head>`);
  lines.push(`<body>`);

  for (const sheet of sheets) {
    lines.push(`<table border="0" cellpadding="3" cellspacing="0">`);
    lines.push(`<tr><td colspan="${sheet.headers.length}" class="sheet-title">${escapeHtml(sheet.title)}</td></tr>`);
    lines.push(`<tr>`);
    for (const h of sheet.headers) {
      lines.push(`<td class="header">${escapeHtml(h)}</td>`);
    }
    lines.push(`</tr>`);
    for (const row of sheet.rows) {
      lines.push(`<tr>`);
      for (const cell of row) {
        lines.push(`<td>${escapeHtml(cell)}</td>`);
      }
      lines.push(`</tr>`);
    }
    lines.push(`<tr><td colspan="${sheet.headers.length}" class="sep">&nbsp;</td></tr>`);
    lines.push(`<tr><td colspan="${sheet.headers.length}">&nbsp;</td></tr>`);
    lines.push(`</table>`);
  }

  lines.push(`</body></html>`);

  const html = lines.join("\n");
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
