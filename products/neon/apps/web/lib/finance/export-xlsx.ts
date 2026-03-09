// lib/finance/export-xlsx.ts
//
// Client-side XLSX export for financial statements.
// Generates a minimal Office Open XML (.xlsx) file without external libraries.
// The format is a ZIP of XML files — we use the browser's Blob API.

import type {
  StmtEngineInstanceDTO,
  StmtEngineInstanceLineDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a statement instance to XLSX and trigger a browser download.
 */
export function downloadStatementXlsx(
  instance: StmtEngineInstanceDTO,
  lines: StmtEngineInstanceLineDTO[],
): void {
  const filename = buildFilename(instance);
  const { headers, rows } = buildStatementData(instance, lines);
  downloadXlsxFromRows(filename, instance.definitionName, headers, rows);
}

/**
 * Generic XLSX download from headers + rows.
 * Uses the CSV-to-TSV approach wrapped in an HTML table for Excel compatibility.
 * This is the pragmatic approach — real OOXML requires a ZIP library.
 */
export function downloadXlsxFromRows(
  filename: string,
  sheetTitle: string,
  headers: string[],
  rows: StatementExportRow[],
): void {
  // Build HTML table that Excel can open natively
  const html = buildExcelHtml(sheetTitle, headers, rows);
  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Use .xls extension for HTML-based Excel files
  a.download = filename.replace(/\.xlsx$/, ".xls");
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatementExportRow {
  values: string[];
  isBold?: boolean;
  isUnderlined?: boolean;
  indentLevel?: number;
  isSeparator?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilename(instance: StmtEngineInstanceDTO): string {
  const code = instance.definitionCode ?? instance.statementType;
  const period =
    instance.periodFrom === instance.periodTo
      ? `P${instance.periodFrom}`
      : `P${instance.periodFrom}-${instance.periodTo}`;
  return `${code}_FY${instance.fiscalYear}_${period}_${instance.bookCode}.xls`;
}

function buildStatementData(
  instance: StmtEngineInstanceDTO,
  lines: StmtEngineInstanceLineDTO[],
): { headers: string[]; rows: StatementExportRow[] } {
  const hasPrior = lines.some((l) => l.priorAmount !== null);
  const hasBudget = lines.some((l) => l.budgetAmount !== null);

  const headers = ["Line Code", "Description", "Current"];
  if (hasPrior) headers.push("Prior Year", "Variance", "Var %");
  if (hasBudget) headers.push("Budget");

  const rows: StatementExportRow[] = [];

  for (const line of lines) {
    if (line.lineType === "SEPARATOR") {
      rows.push({ values: headers.map(() => ""), isSeparator: true });
      continue;
    }

    const indent = "  ".repeat(line.indentLevel);
    const values = [
      line.lineCode,
      `${indent}${line.label}`,
      fmtNum(line.currentAmount),
    ];

    if (hasPrior) {
      values.push(
        fmtNum(line.priorAmount),
        fmtNum(line.varianceAmount),
        // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
        line.variancePct !== null ? `${parseFloat(line.variancePct).toFixed(1)}%` : "",
      );
    }
    if (hasBudget) {
      values.push(fmtNum(line.budgetAmount));
    }

    rows.push({
      values,
      isBold: line.isBold,
      isUnderlined: line.isUnderlined,
      indentLevel: line.indentLevel,
    });
  }

  return { headers, rows };
}

function fmtNum(val: string | null): string {
  if (val === null || val === undefined) return "";
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExcelHtml(
  title: string,
  headers: string[],
  rows: StatementExportRow[],
): string {
  const lines: string[] = [];

  lines.push(`<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">`);
  lines.push(`<head><meta charset="utf-8">`);
  lines.push(`<style>
  td { mso-number-format: "\\@"; font-family: Calibri; font-size: 11pt; }
  .num { mso-number-format: "#,##0.00"; text-align: right; }
  .bold { font-weight: bold; }
  .underline { border-bottom: 1px solid #000; }
  .header { background-color: #4472C4; color: white; font-weight: bold; }
  .sep { border-bottom: 1px solid #999; }
</style></head>`);
  lines.push(`<body>`);
  lines.push(`<table border="0" cellpadding="4" cellspacing="0">`);

  // Title row
  lines.push(`<tr><td colspan="${headers.length}" style="font-size:14pt;font-weight:bold;">${escapeHtml(title)}</td></tr>`);
  lines.push(`<tr><td colspan="${headers.length}">&nbsp;</td></tr>`);

  // Header row
  lines.push(`<tr>`);
  for (const h of headers) {
    lines.push(`<td class="header">${escapeHtml(h)}</td>`);
  }
  lines.push(`</tr>`);

  // Data rows
  for (const row of rows) {
    if (row.isSeparator) {
      lines.push(`<tr><td colspan="${headers.length}" class="sep">&nbsp;</td></tr>`);
      continue;
    }

    const classes: string[] = [];
    if (row.isBold) classes.push("bold");
    if (row.isUnderlined) classes.push("underline");
    const cls = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";

    lines.push(`<tr${cls}>`);
    for (let i = 0; i < row.values.length; i++) {
      // First two columns are text, rest are numeric
      const isNumeric = i >= 2;
      const cellClass = isNumeric ? ` class="num${row.isBold ? " bold" : ""}"` : cls;
      lines.push(`<td${cellClass}>${escapeHtml(row.values[i])}</td>`);
    }
    lines.push(`</tr>`);
  }

  lines.push(`</table></body></html>`);
  return lines.join("\n");
}
