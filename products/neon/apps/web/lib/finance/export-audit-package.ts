// lib/finance/export-audit-package.ts
//
// Client-side export of a Release Audit Package as multi-sheet Excel (.xls).
// Bundles: release summary, audit chain, manifest, decisions, overrides,
// integrity results, notifications, and SLA into a single downloadable file.

import type { ReleaseAuditPackage } from "./release-types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function downloadReleaseAuditPackage(pkg: ReleaseAuditPackage): void {
  const rel = pkg.release;
  const code = rel?.releaseCode ?? "RELEASE";
  const filename = `${code}_audit_package_${new Date().toISOString().slice(0, 10)}.xls`;

  const sheets: SheetData[] = [];

  // 1. Release Summary
  if (rel) {
    const summaryRows: string[][] = [
      ["Release Code", rel.releaseCode],
      ["Release Name", rel.releaseName],
      ["Entity", rel.entityCode],
      ["Fiscal Year", String(rel.fiscalYear)],
      ["Period", `P${rel.periodFrom}${rel.periodTo !== rel.periodFrom ? `-${rel.periodTo}` : ""}`],
      ["Book", rel.bookCode],
      ["Release Type", rel.releaseType],
      ["Status", rel.status],
      ["Clean Close", rel.isCleanClose == null ? "N/A" : rel.isCleanClose ? "Yes" : "No"],
      ["Override Count", String(rel.overrideCount)],
      ["Override Impact", rel.overrideImpactTotal ?? "0"],
      ["Readiness Score", rel.readinessScore ? `${rel.readinessScore}%` : "N/A"],
      ["Requires Exception Signoff", rel.requiresExceptionSignoff ? "Yes" : "No"],
      ["Exception Signoff By", rel.exceptionSignoffBy ?? "N/A"],
      ["Exception Signoff At", rel.exceptionSignoffAt ?? "N/A"],
      ["Assembled At", rel.assembledAt ?? ""],
      ["Ready At", rel.readyAt ?? ""],
      ["Released At", rel.releasedAt ?? ""],
      ["Released By", rel.releasedBy ?? ""],
      ["Superseded At", rel.supersededAt ?? ""],
      ["Supersession Reason", rel.supersessionReason ?? ""],
      ["Created At", rel.createdAt],
      ["Exported At", pkg.exportedAt],
    ];
    // Governed export metadata
    if (pkg.exportId) summaryRows.push(["Export ID", pkg.exportId]);
    if (pkg.contentHash) summaryRows.push(["Content Hash (SHA-256)", pkg.contentHash]);

    sheets.push({
      title: "Release Summary",
      headers: ["Field", "Value"],
      rows: summaryRows,
    });
  }

  // 2. Decisions
  if (pkg.decisions.length > 0) {
    sheets.push({
      title: "Decision Log",
      headers: ["Timestamp", "Command", "Result", "Actor", "Correlation ID"],
      rows: pkg.decisions.map((d) => [
        d.createdAt ?? "",
        d.command,
        d.result,
        d.actorId ?? "",
        d.correlationId ?? "",
      ]),
    });
  }

  // 3. Overrides
  if (pkg.overrides.length > 0) {
    sheets.push({
      title: "Close Overrides",
      headers: ["Scope", "Reason", "Subcode", "Status", "Impact", "Currency", "Requested By", "Requested At", "Decision Notes"],
      rows: pkg.overrides.map((o) => [
        o.overrideScope,
        o.reasonCode,
        o.reasonSubcode ?? "",
        o.status,
        o.impactAmount ?? "0",
        o.impactCurrency ?? "",
        o.requestedBy,
        o.requestedAt ?? "",
        o.decisionNotes ?? "",
      ]),
    });
  }

  // 4. Manifest
  if (pkg.manifestItems.length > 0) {
    sheets.push({
      title: "Publication Manifest",
      headers: ["Type", "Code", "Version", "Period", "Book", "Value", "Currency", "Hash"],
      rows: pkg.manifestItems.map((m) => [
        m.artifactType,
        m.definitionCode ?? "",
        m.definitionVersion != null ? String(m.definitionVersion) : "",
        `P${m.periodNumber}`,
        m.bookCode,
        m.publishedValue ?? "",
        m.publishedCurrency ?? "",
        m.artifactHash ?? "",
      ]),
    });
  }

  // 5. Integrity
  if (pkg.integrity) {
    sheets.push({
      title: "Integrity Checks",
      headers: ["Check", "Passed", "Detail"],
      rows: [
        ["Overall", pkg.integrity.valid ? "PASS" : "FAIL", `Checked: ${pkg.integrity.checkedAt ?? "N/A"}`],
        ...pkg.integrity.checks.map((c) => [
          c.checkName,
          c.passed ? "PASS" : "FAIL",
          c.detail ?? "",
        ]),
      ],
    });
  }

  // 6. Notifications
  if (pkg.notifications.length > 0) {
    sheets.push({
      title: "Notifications",
      headers: ["Timestamp", "Event", "Severity", "Summary", "Processed"],
      rows: pkg.notifications.map((n) => [
        n.createdAt ?? "",
        n.eventCode,
        n.severity,
        n.summary,
        n.processed ? "Yes" : "No",
      ]),
    });
  }

  // 7. SLA
  if (pkg.sla) {
    sheets.push({
      title: "SLA Snapshot",
      headers: ["Metric", "Value"],
      rows: [
        ["Close Duration (h)", pkg.sla.closeDurationHours ?? "N/A"],
        ["Assembly (h)", pkg.sla.assemblyDurationHours ?? "N/A"],
        ["Certification Wait (h)", pkg.sla.certificationWaitHours ?? "N/A"],
        ["Exception Signoff Wait (h)", pkg.sla.exceptionSignoffWaitHours ?? "N/A"],
        ["Release to Distribution (h)", pkg.sla.releaseToDistributionHours ?? "N/A"],
        ["Total Pipeline (h)", pkg.sla.totalPipelineHours ?? "N/A"],
        ["SLA Met", pkg.sla.closeSlaMet == null ? "N/A" : pkg.sla.closeSlaMet ? "Yes" : "No"],
        ["Captured At", pkg.sla.capturedAt ?? ""],
      ],
    });
  }

  // 8. Timeline
  if (pkg.timeline.length > 0) {
    sheets.push({
      title: "Timeline",
      headers: ["Timestamp", "Source", "Title", "Severity", "Detail"],
      rows: pkg.timeline.map((t) => [
        t.timestamp ?? "",
        t.source,
        t.title,
        t.severity,
        t.detail ?? "",
      ]),
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
// Multi-sheet Excel (HTML table approach — same pattern as export-xlsx.ts)
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
