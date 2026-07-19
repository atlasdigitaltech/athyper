"use client";

import { WorkPanel } from "@athyper/surface-kit";
import type { RuntimeSurfaceRendererProps } from "./types";

const RICH_SUMMARY_KINDS = new Set([
  "summary_cards",
  "contacts_channel",
  "addresses",
  "banking_summary",
  "tax_profile_summary",
  "supplier_company_code",
  "operational_presentation",
]);

const SYSTEM_KEYS = new Set([
  "id",
  "data",
  "tenant_id",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "deleted_by",
  "row_version",
  "metadata",
]);

type SummaryEntry = {
  key: string;
  label: string;
  value: unknown;
};

export function RichSummarySurfaceRenderer({
  surface,
  record,
}: RuntimeSurfaceRendererProps) {
  if (!RICH_SUMMARY_KINDS.has(surface.kind)) return null;

  const entries = buildSummaryEntries(surface.kind, readSurfaceConfig(surface), record ?? {});

  return (
    <WorkPanel title={surface.label}>
      {entries.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center rounded-md border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">No record data is available for this surface.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <div key={entry.key} className="rounded-md border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground" title={formatValue(entry.value)}>
                {formatValue(entry.value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </WorkPanel>
  );
}

function buildSummaryEntries(
  kind: string,
  config: Record<string, unknown>,
  record: Record<string, unknown>,
): SummaryEntry[] {
  const configured = configuredFieldEntries(config, record);
  if (configured.length > 0) return configured;

  return fallbackFieldKeys(kind, record)
    .map((key) => ({ key, label: toLabel(key), value: record[key] }))
    .filter((entry) => isRenderableValue(entry.value))
    .slice(0, 12);
}

function configuredFieldEntries(
  config: Record<string, unknown>,
  record: Record<string, unknown>,
): SummaryEntry[] {
  const rawFields = firstArray(config["summaryFields"], config["fields"], config["displayFields"], config["items"]);
  if (!rawFields) return [];

  return rawFields
    .map((item): SummaryEntry | null => {
      if (typeof item === "string" && item.trim()) {
        const key = item.trim();
        return { key, label: toLabel(key), value: record[key] };
      }
      if (!isRecord(item)) return null;
      const key = readString(item, "field") ?? readString(item, "name") ?? readString(item, "key");
      if (!key) return null;
      return {
        key,
        label: readString(item, "label") ?? toLabel(key),
        value: record[key],
      };
    })
    .filter((entry): entry is SummaryEntry => entry !== null && isRenderableValue(entry.value));
}

function fallbackFieldKeys(kind: string, record: Record<string, unknown>): string[] {
  const preferredByKind: Record<string, string[]> = {
    summary_cards: ["code", "name", "display_name", "status", "type", "category"],
    contacts_channel: ["email", "phone", "mobile", "contact_name", "website", "communication_language"],
    addresses: ["address_line1", "address_line2", "city", "state", "postal_code", "country"],
    banking_summary: ["bank_name", "bank_account", "iban", "swift", "currency", "payment_method"],
    tax_profile_summary: ["tax_id", "tax_registration_no", "tax_country", "tax_category", "withholding_tax"],
    supplier_company_code: ["company_code", "purchasing_org", "payment_terms", "reconciliation_account"],
    operational_presentation: ["status", "priority", "owner", "region", "site", "warehouse"],
  };

  const preferred = preferredByKind[kind] ?? [];
  const presentPreferred = preferred.filter((key) => isRenderableValue(record[key]));
  const discovered = Object.keys(record)
    .filter((key) => !SYSTEM_KEYS.has(key) && !presentPreferred.includes(key) && isRenderableValue(record[key]))
    .sort((left, right) => fieldScore(right) - fieldScore(left));
  return [...presentPreferred, ...discovered];
}

function fieldScore(key: string): number {
  if (["code", "name", "display_name", "status"].includes(key)) return 100;
  if (key.endsWith("_code") || key.endsWith("_name")) return 80;
  if (key.endsWith("_id")) return -20;
  return 0;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

function isRenderableValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function readSurfaceConfig(surface: RuntimeSurfaceRendererProps["surface"]): Record<string, unknown> {
  return isRecord(surface["config"]) ? surface["config"] : {};
}

function firstArray(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return null;
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function toLabel(key: string): string {
  return key
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
