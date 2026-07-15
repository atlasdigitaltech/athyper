import type { CSSProperties } from "react";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { PrintIdentity } from "../core/print-identity";
import type { ResolvedPrintSection } from "../core/resolve-entity-print-sections";
import type { PrintProfile } from "../hooks/use-print-entity";
import { formatPrintFieldValue } from "./format-print-field-value";

export interface EntityPrintTemplateProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown> };
  identity:   PrintIdentity;
  sections:   ResolvedPrintSection[];
  tenantName: string;
  printedAt:  string;
  profile:    PrintProfile | null;
}

// Inline styles are required here — Tailwind classes are not applied during
// window.print() or server-side PDF generation.
const PT: Record<string, CSSProperties> = {
  label:   { fontSize: "12px", color: "var(--muted-foreground)" },
  labelMd: { fontSize: "12px", fontWeight: 500, color: "var(--muted-foreground)" },
  value:   { fontSize: "12px", color: "var(--foreground)" },
  valueMd: { fontSize: "12px", fontWeight: 500, color: "var(--card-foreground)" },
  code:    { fontSize: "13px", fontWeight: 500, color: "var(--card-foreground)" },
  title:   { fontSize: "18px", fontWeight: 500, color: "var(--foreground)" },
};

function columnsToGridTemplate(columns: 1 | 2 | 3): string {
  if (columns === 1) return "1fr";
  if (columns === 3) return "1fr 1fr 1fr";
  return "1fr 1fr";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function printLayoutMode(entity: CompiledEntity): string | undefined {
  const displayConfig = asRecord(entity.display_config);
  const printConfig = asRecord(displayConfig?.["print_config"]);
  const layout = asRecord(printConfig?.["layout"]);
  return typeof layout?.["mode"] === "string" ? layout["mode"] : undefined;
}

function PrintIdentityHeader({ identity }: { identity: PrintIdentity }) {
  return (
    <div style={{ borderBottom: "2px solid var(--primary)", paddingBottom: "12px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={PT.label}>{identity.typeLabel}</div>
          {identity.code && <div style={PT.code}>{identity.code}</div>}
          {identity.name && <div style={PT.title}>{identity.name}</div>}
          {identity.subtitle && identity.subtitle !== identity.code && (
            <div style={PT.label}>{identity.subtitle}</div>
          )}
        </div>
        {identity.status && (
          <div style={{
            padding: "2px 10px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 500,
            background: "color-mix(in srgb, var(--primary) 15%, transparent)",
            color: "var(--primary)",
          }}>
            {identity.status}
          </div>
        )}
      </div>
      {identity.pinnedFacts.length > 0 && (
        <div style={{ display: "flex", gap: "24px", marginTop: "10px", flexWrap: "wrap" }}>
          {identity.pinnedFacts.map((fact) => (
            <div key={fact.label}>
              <div style={PT.label}>{fact.label}</div>
              <div style={PT.valueMd}>{fact.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrintSection({
  section,
  data,
}: {
  section: ResolvedPrintSection;
  data:    Record<string, unknown>;
}) {
  const visibleFields = section.fields.filter((f) => formatPrintFieldValue(f, data) !== null);
  if (visibleFields.length === 0) return null;

  return (
    <div style={{ marginBottom: "18px" }}>
      {section.label && section.key !== "__all" && (
        <div style={{ ...PT.labelMd, borderBottom: "1px solid var(--border)", paddingBottom: "4px", marginBottom: "8px" }}>
          {section.label}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: columnsToGridTemplate(section.columns), gap: "8px 16px" }}>
        {visibleFields.map((field) => {
          const value = formatPrintFieldValue(field, data);
          return (
            <div key={field.name}>
              <div style={{ ...PT.label, marginBottom: "1px" }}>{field.label}</div>
              <div style={PT.value}>{value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EntityPrintTemplate({
  entity,
  record,
  identity,
  sections,
  tenantName,
  printedAt,
}: EntityPrintTemplateProps) {
  const data      = record.data as Record<string, unknown>;
  const twoColumn = printLayoutMode(entity) === "two_column";

  // Partition into full-width (page_span='full') and half-width (page_span='half') sections.
  // Full sections render above the two-column zone at full page width.
  // Half sections fill the left and right columns.
  // When no section has page_span='full', all sections go to the half bucket (midpoint split).
  const hasExplicitSpan = sections.some((s) => s.page_span === "full");

  let fullSections: ResolvedPrintSection[] = [];
  let halfSections: ResolvedPrintSection[] = sections;

  if (twoColumn && hasExplicitSpan) {
    fullSections = sections.filter((s) => s.page_span === "full");
    halfSections = sections.filter((s) => s.page_span === "half");
  }

  let leftSections  = halfSections;
  let rightSections: ResolvedPrintSection[] = [];
  if (twoColumn && halfSections.length > 1) {
    const mid    = Math.ceil(halfSections.length / 2);
    leftSections  = halfSections.slice(0, mid);
    rightSections = halfSections.slice(mid);
  }

  return (
    <div style={{
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      fontSize:   "12px",
      color:      "var(--foreground)",
      padding:    "32px 36px",
      maxWidth:   "794px",
      margin:     "0 auto",
      background: "var(--card)",
    }}>
      {/* Tenant / timestamp bar */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={PT.label}>{tenantName}</div>
        <div style={PT.label}>{printedAt}</div>
      </div>

      <PrintIdentityHeader identity={identity} />

      {/* Full-width sections (only relevant in two_column mode with explicit page_span) */}
      {fullSections.map((s) => <PrintSection key={s.key} section={s} data={data} />)}

      {/* Half sections — rendered as two columns or linearly */}
      {twoColumn && rightSections.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
          <div>{leftSections.map((s) => <PrintSection key={s.key} section={s} data={data} />)}</div>
          <div>{rightSections.map((s) => <PrintSection key={s.key} section={s} data={data} />)}</div>
        </div>
      ) : (
        leftSections.map((s) => <PrintSection key={s.key} section={s} data={data} />)
      )}

      {/* Footer */}
      <div style={{
        ...PT.label,
        marginTop: "24px",
        paddingTop: "8px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>Generated by Athyper</span>
        <span>{tenantName}</span>
      </div>
    </div>
  );
}
