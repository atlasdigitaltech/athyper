// lib/finance/export-narrative-pack.ts
//
// Phase 12B: Client-side export of Narrative Pack as multi-sheet Excel (.xls).
// Bundles 4 audience-specific narratives + risk items + takeaways.

import type { NarrativeBrief } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function downloadNarrativePack(briefs: NarrativeBrief[]): void {
  if (briefs.length === 0) return;

  const first = briefs[0];
  const filename = `narrative_pack_${first.entityCode}_P${first.periodNumber}_FY${first.fiscalYear}_${new Date().toISOString().slice(0, 10)}.xls`;

  const sheets: SheetData[] = [];

  // Cover sheet
  sheets.push({
    title: "Narrative Pack",
    headers: ["Field", "Value"],
    rows: [
      ["Entity", first.entityCode],
      ["Fiscal Year", String(first.fiscalYear)],
      ["Period", `P${first.periodNumber}`],
      ["Generated At", first.generatedAt],
      ["Deterministic", "Yes"],
      ["Briefs Included", briefs.map((b) => b.audience).join(", ")],
    ],
  });

  // One sheet per brief
  for (const brief of briefs) {
    const rows: string[][] = [];

    // Summary
    rows.push(["SUMMARY", ""]);
    rows.push(["", brief.summary]);
    rows.push(["", ""]);

    // Sections
    for (const section of brief.sections) {
      rows.push([section.heading.toUpperCase(), section.severity ?? ""]);
      for (const p of section.paragraphs) {
        rows.push(["", p]);
      }
      if (section.keyMetrics && section.keyMetrics.length > 0) {
        rows.push(["", ""]);
        rows.push(["Key Metrics", ""]);
        for (const m of section.keyMetrics) {
          rows.push([`  ${m.label}`, `${m.value}${m.trend ? ` (${m.trend})` : ""}`]);
        }
      }
      rows.push(["", ""]);
    }

    // Takeaways
    if (brief.takeaways.length > 0) {
      rows.push(["KEY TAKEAWAYS", ""]);
      for (const t of brief.takeaways) {
        rows.push(["", t]);
      }
      rows.push(["", ""]);
    }

    // Risk items
    if (brief.riskItems.length > 0) {
      rows.push(["RISK ITEMS", ""]);
      for (const r of brief.riskItems) {
        rows.push([`[${r.severity.toUpperCase()}] ${r.title}`, r.detail]);
      }
    }

    sheets.push({
      title: brief.audience.replace(/_/g, " "),
      headers: ["Section", "Content"],
      rows,
    });
  }

  downloadMultiSheetExcel(filename, sheets);
}

/**
 * Download a single narrative brief as a standalone file.
 */
export function downloadSingleNarrative(brief: NarrativeBrief): void {
  downloadNarrativePack([brief]);
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
// Multi-sheet Excel (HTML table approach — matches export-audit-package.ts)
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
