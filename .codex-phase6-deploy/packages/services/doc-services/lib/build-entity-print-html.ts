import type { ResolvedPrintSection } from "@athyper/entity-print/core";
import type { PrintIdentity } from "@athyper/entity-print/core";

interface BuildHtmlInput {
  identity:   PrintIdentity;
  sections:   ResolvedPrintSection[];
  record:     Record<string, unknown>;
  tenantName: string;
  printedAt:  string;
  twoColumn?: boolean;
}

// ── Server-owned value formatter (no React dep, mirrors formatPrintFieldValue) ──

function fmtDate(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtMoney(value: unknown, currency: string): string | null {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (isNaN(num)) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function fmtNumber(value: unknown, decimals?: number): string | null {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals ?? 4,
    minimumFractionDigits: 0,
  }).format(num);
}

function fmt(
  field: { name: string; data_type: string; money_config?: Record<string, unknown> | undefined },
  data: Record<string, unknown>,
): string | null {
  const displayKey = `${field.name}__display`;
  const raw = displayKey in data ? data[displayKey] : data[field.name];
  if (raw == null || raw === "") return null;

  switch (field.data_type) {
    case "boolean":
      return raw === true || raw === "true" || raw === 1 ? "Yes" : "No";
    case "date":
      return fmtDate(raw);
    case "datetime":
    case "timestamptz":
    case "timestamp":
      return fmtDateTime(raw);
    case "money":
      return fmtMoney(raw, (field.money_config?.["currency_code"] as string | undefined) ?? "USD");
    case "decimal":
    case "numeric":
      return fmtNumber(raw, 4);
    case "integer":
    case "int":
    case "bigint":
      return fmtNumber(raw, 0);
    default:
      return String(raw);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildIdentityHtml(identity: PrintIdentity): string {
  const statusBadge = identity.status
    ? `<span style="padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;background:#e0e7ff;color:#3730a3;">${esc(identity.status)}</span>`
    : "";

  const pinnedHtml = identity.pinnedFacts.length > 0
    ? `<div style="display:flex;gap:24px;margin-top:10px;flex-wrap:wrap;">
        ${identity.pinnedFacts.map((f) => `
          <div>
            <div style="font-size:9px;text-transform:uppercase;color:#9ca3af;">${esc(f.label)}</div>
            <div style="font-size:12px;font-weight:600;color:#374151;">${esc(f.value)}</div>
          </div>
        `).join("")}
       </div>`
    : "";

  return `
    <div style="border-bottom:2px solid #1e40af;padding-bottom:12px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">${esc(identity.typeLabel)}</div>
          ${identity.code ? `<div style="font-size:13px;font-weight:600;color:#374151;">${esc(identity.code)}</div>` : ""}
          ${identity.name ? `<div style="font-size:18px;font-weight:700;color:#111827;">${esc(identity.name)}</div>` : ""}
          ${identity.subtitle && identity.subtitle !== identity.code ? `<div style="font-size:12px;color:#6b7280;">${esc(identity.subtitle)}</div>` : ""}
        </div>
        ${statusBadge}
      </div>
      ${pinnedHtml}
    </div>
  `;
}

function buildSectionHtml(section: ResolvedPrintSection, data: Record<string, unknown>): string {
  const visibleFields = section.fields.filter((f) => fmt(f as never, data) !== null);
  if (visibleFields.length === 0) return "";
  const fieldColumns = section.columns === 1
    ? "1fr"
    : section.columns === 3
      ? "1fr 1fr 1fr"
      : "1fr 1fr";

  const labelHtml = section.label && section.key !== "__all"
    ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px;">${esc(section.label)}</div>`
    : "";

  const fieldsHtml = visibleFields.map((field) => {
    const value = fmt(field as never, data);
    return `
      <div>
        <div style="font-size:9px;text-transform:uppercase;color:#9ca3af;margin-bottom:1px;">${esc(field.label)}</div>
        <div style="font-size:11px;color:#111827;">${esc(value ?? "")}</div>
      </div>
    `;
  }).join("");

  return `
    <div style="margin-bottom:18px;">
      ${labelHtml}
      <div style="display:grid;grid-template-columns:${fieldColumns};gap:8px 16px;">
        ${fieldsHtml}
      </div>
    </div>
  `;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function buildEntityPrintHtml(input: BuildHtmlInput): string {
  const { identity, sections, record, tenantName, printedAt, twoColumn } = input;
  const data = record;

  let sectionsHtml: string;
  const hasExplicitSpan = sections.some((section) => section.page_span === "full");
  const fullSections = twoColumn && hasExplicitSpan
    ? sections.filter((section) => section.page_span === "full")
    : [];
  const halfSections = twoColumn && hasExplicitSpan
    ? sections.filter((section) => section.page_span === "half")
    : sections;

  if (twoColumn && halfSections.length > 1) {
    const mid = Math.ceil(halfSections.length / 2);
    const full = fullSections.map((s) => buildSectionHtml(s, data)).join("");
    const left  = halfSections.slice(0, mid).map((s) => buildSectionHtml(s, data)).join("");
    const right = halfSections.slice(mid).map((s) => buildSectionHtml(s, data)).join("");
    sectionsHtml = `
      ${full}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;">
        <div>${left}</div>
        <div>${right}</div>
      </div>
    `;
  } else if (twoColumn && hasExplicitSpan) {
    sectionsHtml = [
      ...fullSections.map((s) => buildSectionHtml(s, data)),
      ...halfSections.map((s) => buildSectionHtml(s, data)),
    ].join("");
  } else {
    sectionsHtml = sections.map((s) => buildSectionHtml(s, data)).join("");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      font-size: 11px;
      color: #111827;
      background: #fff;
    }
    .page {
      padding: 32px 36px;
      max-width: 794px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="page">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:10px;color:#9ca3af;">${esc(tenantName)}</div>
      <div style="font-size:10px;color:#9ca3af;">${esc(printedAt)}</div>
    </div>
    ${buildIdentityHtml(identity)}
    ${sectionsHtml}
    <div style="margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:8px;color:#9ca3af;display:flex;justify-content:space-between;">
      <span>Generated by Athyper</span>
      <span>${esc(tenantName)}</span>
    </div>
  </div>
</body>
</html>`;
}
