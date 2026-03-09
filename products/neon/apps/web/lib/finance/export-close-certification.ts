// lib/finance/export-close-certification.ts
//
// Phase 9C: Close Certification Pack export — multi-sheet Excel (.xls).
// Bundles: certification summary, task evidence, exception register,
// override register, SLA compliance, remediation summary into a single
// downloadable audit artifact.

import type { CloseCertificationPackDTO } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function downloadCloseCertificationPack(
  pkg: CloseCertificationPackDTO,
): void {
  const cert = pkg.certification;
  const filename = `${cert.certCode}_certification_pack_${new Date().toISOString().slice(0, 10)}.xls`;

  const sheets: SheetData[] = [];

  // 1. Certification Summary
  const summaryRows: string[][] = [
    ["Certification Code", cert.certCode],
    ["Version", String(cert.certVersion)],
    ["Entity", cert.entityCode],
    ["Fiscal Year", String(cert.fiscalYear)],
    ["Period", `P${cert.periodNumber}`],
    ["Status", cert.status],
    ["Type", cert.certType],
    ["Clean Close", cert.isCleanClose ? "Yes" : "No"],
    [""],
    ["-- KPI Snapshot --", ""],
    ["Readiness Score", cert.readinessScore != null ? `${cert.readinessScore}%` : "N/A"],
    ["SLA Status", cert.slaStatus ?? "N/A"],
    ["Total Tasks", String(cert.totalTasks ?? 0)],
    ["Completed Tasks", String(cert.completedTasks ?? 0)],
    ["Waived Tasks", String(cert.waivedTasks ?? 0)],
    ["Failed Tasks", String(cert.failedTasks ?? 0)],
    ["Total Overrides", String(cert.totalOverrides)],
    ["Override Impact", cert.overrideImpact],
    ["Total Exceptions", String(cert.totalExceptions)],
    ["Open Exceptions", String(cert.openExceptions)],
    ["Doc Health Score", cert.docHealthScore != null ? `${cert.docHealthScore}%` : "N/A"],
    ["Remediation Total", String(cert.remediationTotal)],
    ["Remediation Open", String(cert.remediationOpen)],
    [""],
    ["-- Sign-Off Chain --", ""],
    ["Assembled At", cert.assembledAt ?? ""],
    ["Content Hash (SHA-256)", cert.contentHash ?? ""],
    ["Certified By", cert.certifiedBy ?? ""],
    ["Certified At", cert.certifiedAt ?? ""],
    ["Controller Notes", cert.controllerNotes ?? ""],
    ["Attested By (CFO)", cert.attestedBy ?? ""],
    ["Attested At", cert.attestedAt ?? ""],
    ["Attestation Notes", cert.attestationNotes ?? ""],
    [""],
    ["-- Export Metadata --", ""],
    ["Export ID", pkg.exportId],
    ["Exported At", pkg.exportedAt],
    ["Pack Content Hash", pkg.contentHash ?? ""],
  ];

  sheets.push({
    title: "Certification Summary",
    headers: ["Field", "Value"],
    rows: summaryRows,
  });

  // 2. Task Evidence
  if (pkg.taskEvidence.length > 0) {
    sheets.push({
      title: "Task Evidence",
      headers: [
        "Task Code",
        "Task Name",
        "Category",
        "Gate",
        "Mode",
        "Mandatory",
        "Status",
        "Assigned To",
        "Due",
        "Completed By",
        "Completed At",
        "Hours",
        "Within SLA",
        "Waiver Status",
        "Waiver Reason",
        "Waived By",
        "Handler Runs",
        "Last Handler At",
        "Failure Reason",
        "Notes",
      ],
      rows: pkg.taskEvidence.map((t) => [
        t.taskCode,
        t.taskName,
        t.category,
        t.requiredBefore,
        t.completionMode,
        t.isMandatory ? "Yes" : "No",
        t.taskStatus,
        t.assignedTo ?? "",
        t.dueAt ?? "",
        t.completedBy ?? "",
        t.completedAt ?? "",
        t.hoursToComplete != null ? t.hoursToComplete.toFixed(1) : "",
        t.withinSla == null ? "" : t.withinSla ? "Yes" : "No",
        t.waiverStatus ?? "",
        t.waiverReason ?? "",
        t.waivedBy ?? "",
        String(t.handlerRunCount),
        t.lastHandlerRunAt ?? "",
        t.failureReason ?? "",
        t.completionNotes ?? "",
      ]),
    });
  }

  // 3. Exception Register
  if (pkg.exceptions.length > 0) {
    sheets.push({
      title: "Exception Register",
      headers: [
        "Code",
        "Title",
        "Severity",
        "Status",
        "Category",
        "Root Cause",
        "Impact",
        "Impact Amount",
        "Currency",
        "Raised By",
        "Raised At",
        "Assigned To",
        "Resolved By",
        "Resolved At",
        "Resolution Notes",
      ],
      rows: pkg.exceptions.map((e) => [
        e.exceptionCode,
        e.title,
        e.severity,
        e.status,
        e.category ?? "",
        e.rootCause ?? "",
        e.impactDescription ?? "",
        e.impactAmount ?? "",
        e.impactCurrency ?? "",
        e.raisedBy ?? "",
        e.raisedAt ?? "",
        e.assignedTo ?? "",
        e.resolvedBy ?? "",
        e.resolvedAt ?? "",
        e.resolutionNotes ?? "",
      ]),
    });
  }

  // 4. Override Register
  if (pkg.overrides.length > 0) {
    sheets.push({
      title: "Override Register",
      headers: [
        "Scope",
        "Task Code",
        "Task Name",
        "Category",
        "Reason",
        "Detail",
        "Status",
        "Active",
        "Impact",
        "Currency",
        "Requested By",
        "Requested At",
        "Decision Notes",
        "Last Activity",
        "Last Activity At",
        "Last Activity By",
      ],
      rows: pkg.overrides.map((o) => [
        o.overrideScope,
        o.taskCode ?? "",
        o.taskName ?? "",
        o.taskCategory ?? "",
        o.reasonCode,
        o.reasonDetail ?? "",
        o.status,
        o.isActive ? "Yes" : "No",
        o.impactAmount ?? "0",
        o.impactCurrency ?? "",
        o.requestedBy,
        o.requestedAt ?? "",
        o.decisionNotes ?? "",
        o.lastActivity ?? "",
        o.lastActivityAt ?? "",
        o.lastActivityBy ?? "",
      ]),
    });
  }

  // 5. SLA Compliance
  if (pkg.slaCompliance) {
    const sla = pkg.slaCompliance;
    sheets.push({
      title: "SLA Compliance",
      headers: ["Metric", "Value"],
      rows: [
        ["Close Type", sla.closeType],
        ["Period End Date", sla.periodEndDate],
        ["Close Start Date", sla.closeStartDate],
        ["Soft Close Target", sla.softCloseTarget],
        ["Hard Close Target", sla.hardCloseTarget],
        ["Soft Close Actual", sla.softCloseActual ?? "Pending"],
        ["Hard Close Actual", sla.hardCloseActual ?? "Pending"],
        ["Target Working Days", sla.targetWorkingDays != null ? String(sla.targetWorkingDays) : "N/A"],
        ["Actual Working Days", sla.actualWorkingDays != null ? String(sla.actualWorkingDays) : "N/A"],
        ["SLA Status", sla.slaStatus],
        ["Soft Close Met", sla.softCloseMet == null ? "N/A" : sla.softCloseMet ? "Yes" : "No"],
        ["Hard Close Met", sla.hardCloseMet == null ? "N/A" : sla.hardCloseMet ? "Yes" : "No"],
        ["Days Elapsed", String(sla.daysElapsed)],
        ["Days Remaining", String(sla.daysRemaining)],
      ],
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
// Multi-sheet Excel (HTML table approach — same pattern as export-audit-package.ts)
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

    // Title
    lines.push(`<tr><td colspan="${sheet.headers.length}" class="sheet-title">${escapeHtml(sheet.title)}</td></tr>`);

    // Headers
    lines.push(`<tr>`);
    for (const h of sheet.headers) {
      lines.push(`<td class="header">${escapeHtml(h)}</td>`);
    }
    lines.push(`</tr>`);

    // Rows
    for (const row of sheet.rows) {
      lines.push(`<tr>`);
      for (const cell of row) {
        lines.push(`<td>${escapeHtml(cell)}</td>`);
      }
      lines.push(`</tr>`);
    }

    // Spacer between sheets
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
