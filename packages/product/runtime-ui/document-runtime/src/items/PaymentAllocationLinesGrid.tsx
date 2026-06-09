"use client";

/**
 * PaymentAllocationLinesGrid — read-only allocation view for payment entries.
 *
 * Columns and data access are driven by display_config.allocation_display_labels.
 */

import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { asConfigRecord, stringArrayConfig, textConfig } from "../documentRuntimeDefaults";

function fmtAmt(v: unknown, hide = false): string {
  const n = Number(v);
  if (hide && !n) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DeductionCell({ value }: { value: unknown }) {
  const n = Number(value);
  if (!n) return <span className="text-muted-foreground/30 text-right">—</span>;
  return (
    <span className="tabular-nums text-warning text-right">
      ({fmtAmt(n)})
    </span>
  );
}

export interface PaymentAllocationLinesGridProps {
  lines:        DocumentLine[];
  isLoading?:   boolean;
  currencyCode?: string;
  entity?: CompiledEntity;
}

type AllocationDisplayColumn = {
  key: string;
  label: string;
  field: string;
  source: AllocationDisplaySource;
  role?: "amount" | "deduction" | "net" | "subtitle";
  hideWhenZero?: boolean;
};

type AllocationDisplaySource = "data" | "line";

type AllocationPrimaryConfig = {
  label: string;
  field?: string;
  source: AllocationDisplaySource;
  fallbackFields: string[];
  fallbackText: string;
};

function readAllocationSource(value: unknown): AllocationDisplaySource {
  return textConfig(value) === "line" ? "line" : "data";
}

function readAllocationColumns(entity?: CompiledEntity): AllocationDisplayColumn[] {
  const configured = asConfigRecord(entity?.display_config)?.["allocation_display_labels"];
  if (!Array.isArray(configured)) return [];
  return configured.flatMap((entry): AllocationDisplayColumn[] => {
    const row = asConfigRecord(entry);
    if (!row) return [];
    const key = textConfig(row["key"]);
    const label = textConfig(row["label"]);
    const field = textConfig(row["field"]) ?? key;
    if (!key || !label || !field) return [];
    const role = textConfig(row["role"]);
    return [{
      key,
      label,
      field,
      source: readAllocationSource(row["source"]),
      role: role === "deduction" || role === "net" || role === "subtitle" || role === "amount" ? role : "amount",
      hideWhenZero: row["hide_when_zero"] === true,
    }];
  });
}

function readAllocationPrimary(entity?: CompiledEntity): AllocationPrimaryConfig {
  const displayConfig = asConfigRecord(entity?.display_config);
  return {
    label: textConfig(displayConfig?.["allocation_primary_label"]) ?? (entity?.entity_name ?? "Record"),
    field: textConfig(displayConfig?.["allocation_primary_field"]),
    source: readAllocationSource(displayConfig?.["allocation_primary_source"]),
    fallbackFields: stringArrayConfig(displayConfig?.["allocation_primary_fallback_fields"]) ?? [],
    fallbackText: textConfig(displayConfig?.["allocation_empty_primary_label"]) ?? "-",
  };
}

function lineFieldValue(line: DocumentLine, field: string, source: AllocationDisplaySource): unknown {
  if (source === "line") return (line as unknown as Record<string, unknown>)[field];
  return ((line.data as Record<string, unknown> | null | undefined) ?? {})[field];
}

function lineFallbackValue(line: DocumentLine, field: string): unknown {
  return (line as unknown as Record<string, unknown>)[field]
    ?? ((line.data as Record<string, unknown> | null | undefined) ?? {})[field];
}

function lineColumnValue(line: DocumentLine, column: AllocationDisplayColumn): unknown {
  return lineFieldValue(line, column.field, column.source);
}

function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function primaryCellText(line: DocumentLine, primary: AllocationPrimaryConfig): string | null {
  const configuredValue = primary.field ? textValue(lineFieldValue(line, primary.field, primary.source)) : null;
  if (configuredValue) return configuredValue;

  for (const field of primary.fallbackFields) {
    const fallbackValue = textValue(lineFallbackValue(line, field));
    if (fallbackValue) return fallbackValue;
  }
  return null;
}

function subtitleText(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString();
}

function columnTotal(lines: DocumentLine[], column: AllocationDisplayColumn): number {
  return lines.reduce((sum, line) => sum + (Number(lineColumnValue(line, column)) || 0), 0);
}

export function PaymentAllocationLinesGrid({
  lines,
  isLoading,
  currencyCode,
  entity,
}: PaymentAllocationLinesGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  const columns = readAllocationColumns(entity);
  const visibleColumns = columns.filter((column) => !column.hideWhenZero || columnTotal(lines, column) > 0);
  const subtitleColumn = visibleColumns.find((column) => column.role === "subtitle");
  const amountColumns = visibleColumns.filter((column) => column.role !== "subtitle");
  const primary = readAllocationPrimary(entity);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-medium text-foreground">
          {lines.length} allocation{lines.length !== 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {currencyCode ?? ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col />
            {amountColumns.map((column) => (
              <col key={column.key} style={{ width: column.role === "net" ? 120 : 110 }} />
            ))}
          </colgroup>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-left">{primary.label}</th>
              {amountColumns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={2 + amountColumns.length}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No allocation lines</p>
                  </div>
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const subtitleValue = subtitleColumn ? lineColumnValue(line, subtitleColumn) : null;
                const subtitle = subtitleText(subtitleValue);
                const primaryText = primaryCellText(line, primary);
                return (
                  <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      {primaryText ? (
                        <>
                          <div className="tabular-nums text-xs font-medium text-foreground truncate">
                            {primaryText}
                          </div>
                          {subtitle && (
                            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">{primary.fallbackText}</span>
                      )}
                    </td>
                    {amountColumns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          column.role === "net" ? "font-medium text-primary" : "font-medium",
                        )}
                      >
                        {column.role === "deduction"
                          ? <DeductionCell value={lineColumnValue(line, column)} />
                          : fmtAmt(lineColumnValue(line, column))}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-t border-border/40 bg-muted/20 text-xs">
        {amountColumns.map((column) => (
          <span key={column.key} className={column.role === "net" ? "ml-auto" : undefined}>
            <span className="text-muted-foreground mr-1.5">{column.label}</span>
            <span className={cn(
              "font-medium tabular-nums",
              column.role === "deduction" && "text-warning",
              column.role === "net" && "font-medium text-primary",
            )}>
              {column.role === "deduction"
                ? `(${fmtAmt(columnTotal(lines, column))})`
                : fmtAmt(columnTotal(lines, column))}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
