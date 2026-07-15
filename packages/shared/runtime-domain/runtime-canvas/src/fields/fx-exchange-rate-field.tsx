"use client";

import {
  Activity,
  Info,
  Link2,
  LockKeyhole,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { EntityField } from "@athyper/api-contracts/metadata";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import type { FieldRendererProps } from "./registry";

type FxRateSource =
  | "identity"
  | "spot"
  | "commitment_fixed"
  | "reference_document"
  | "manual_override"
  | string;

interface FxRateSnapshot {
  source?: FxRateSource | null;
  rateType?: string | null;
  asOfDate?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  fixed?: boolean | null;
  resolver?: string | null;
  resolvedAt?: string | null;
  lookupMethod?: string | null;
  lookupSource?: string | null;
  effectiveDate?: string | null;
}

interface FxExchangeRateShellProps {
  value: unknown;
  field: EntityField | MetaEntityField;
  formData?: Record<string, unknown>;
  rowData?: Record<string, unknown>;
  children?: ReactNode;
}

const SOURCE_PRESENTATION: Record<string, { label: string; Icon: LucideIcon }> = {
  identity: { label: "Identity", Icon: Info },
  spot: { label: "Spot", Icon: Activity },
  commitment_fixed: { label: "PO Fixed", Icon: LockKeyhole },
  reference_document: { label: "Reference", Icon: Link2 },
  manual_override: { label: "Manual", Icon: Pencil },
};

export function FxExchangeRateField(props: FieldRendererProps) {
  return (
    <FxExchangeRateShell
      value={props.value}
      field={props.field}
      rowData={props.rowData}
      formData={props.formData}
    >
      <span className="tabular-nums">{formatRate(props.value)}</span>
    </FxExchangeRateShell>
  );
}

export function FxExchangeRateInputShell({
  value,
  field,
  formData,
  rowData,
  children,
}: FxExchangeRateShellProps) {
  return (
    <FxExchangeRateShell value={value} field={field} formData={formData} rowData={rowData}>
      {padInputChild(children)}
    </FxExchangeRateShell>
  );
}

function FxExchangeRateShell({
  value,
  field,
  formData,
  rowData,
  children,
}: FxExchangeRateShellProps) {
  const values = formData ?? rowData ?? {};
  const config = readFxConfig(field);
  const snapshot = readSnapshot(values[config.snapshotField]);
  const currencyCode = readText(values[config.currencyField]);
  const baseCurrencyCode = readText(values[config.baseCurrencyField]);
  const presentation = SOURCE_PRESENTATION[String(snapshot?.source ?? "identity")]
    ?? { label: titleCase(String(snapshot?.source ?? "FX")), Icon: Info };
  const Icon = presentation.Icon;

  return (
    <span className="group relative block min-w-0">
      {children}
      <button
        type="button"
        aria-label="FX rate source"
        className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-72 rounded-md border bg-popover p-3 text-left text-xs text-popover-foreground shadow-lg group-focus-within:block group-hover:block"
      >
        <span className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">{presentation.label} rate</span>
          {snapshot?.fixed != null ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {snapshot.fixed ? "Fixed" : "Variable"}
            </span>
          ) : null}
        </span>
        <span className="grid gap-1 text-muted-foreground">
          <SummaryLine label="Pair" value={formatPair(currencyCode, baseCurrencyCode)} />
          <SummaryLine label="Rate" value={formatRate(value)} />
          <SummaryLine label="Type" value={snapshot?.rateType} />
          <SummaryLine label="As of" value={formatDate(snapshot?.asOfDate)} />
          <SummaryLine label="Effective" value={formatDate(snapshot?.effectiveDate)} />
          <SummaryLine label="Source" value={formatSource(snapshot)} />
          <SummaryLine label="Resolved" value={formatDateTime(snapshot?.resolvedAt)} />
          <SummaryLine label="Resolver" value={snapshot?.resolver} />
        </span>
      </span>
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: unknown }) {
  const text = readText(value);
  if (!text) return null;
  return (
    <span className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <span>{label}</span>
      <span className="truncate text-foreground">{text}</span>
    </span>
  );
}

function padInputChild(children: ReactNode): ReactNode {
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<{ className?: string }>;
  const className = `${child.props.className ?? ""} pr-10`.trim();
  return cloneElement(child, { className });
}

function readFxConfig(field: EntityField | MetaEntityField): {
  snapshotField: string;
  currencyField: string;
  baseCurrencyField: string;
} {
  const lookupConfig = readFieldProperty(field, "lookup_config", "lookupConfig");
  const referenceConfig = readFieldProperty(field, "reference_config", "referenceConfig");
  const validation = readFieldProperty(field, "validation_rules", "validation");
  const config = [lookupConfig, referenceConfig, validation].map(asRecord).find((item) =>
    Boolean(item?.["snapshotField"] ?? item?.["snapshot_field"]),
  );
  return {
    snapshotField: readText(config?.["snapshotField"] ?? config?.["snapshot_field"]) ?? "fx_rate_snapshot",
    currencyField: readText(config?.["currencyField"] ?? config?.["currency_field"]) ?? "currency_code",
    baseCurrencyField: readText(config?.["baseCurrencyField"] ?? config?.["base_currency_field"]) ?? "base_currency_code",
  };
}

function readFieldProperty(
  field: EntityField | MetaEntityField,
  snakeKey: string,
  camelKey: string,
): unknown {
  const record = field as unknown as Record<string, unknown>;
  return record[snakeKey] ?? record[camelKey];
}

function readSnapshot(value: unknown): FxRateSnapshot | null {
  const record = asRecord(value);
  if (record) return record as FxRateSnapshot;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed) as FxRateSnapshot | null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null;
}

function formatRate(value: unknown): string {
  const text = readText(value);
  if (!text) return "-";
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric.toFixed(10) : text;
}

function formatPair(currencyCode: string | null, baseCurrencyCode: string | null): string | null {
  if (!currencyCode && !baseCurrencyCode) return null;
  return `${currencyCode ?? "-"} to ${baseCurrencyCode ?? "-"}`;
}

function formatSource(snapshot: FxRateSnapshot | null): string | null {
  if (!snapshot?.sourceDocumentType && !snapshot?.sourceDocumentId) return snapshot?.lookupSource ?? null;
  return [snapshot.sourceDocumentType, snapshot.sourceDocumentId].filter(Boolean).join(" ");
}

function formatDate(value: unknown): string | null {
  const text = readText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString();
}

function formatDateTime(value: unknown): string | null {
  const text = readText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
