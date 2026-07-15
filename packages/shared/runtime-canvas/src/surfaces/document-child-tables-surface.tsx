"use client";

import { Badge } from "@athyper/ui/primitives";
import { ChildCollectionGrid } from "@athyper/runtime-line-item/embedded";
import { useCompiledEntity } from "@athyper/query";
import {
  flattenRuntimeRecord,
  normaliseCurrencyCode,
} from "@athyper/runtime-shared/core";
import { useDocumentRuntimeContext } from "../document-runtime/document-runtime-context";
import type { RuntimeSurfaceRendererProps } from "./types";

type FlatRow = Record<string, unknown>;

export function DocumentSchedulesSurfaceRenderer({ surface }: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "document_schedules") return null;
  const ctx = useDocumentRuntimeContext();
  const rows = ctx.children.schedules.all.map(flattenRuntimeRecord);
  const scheduleEntityCode = readSurfaceEntityCode(surface, "schedule_line");
  const { data: scheduleEntity } = useCompiledEntity(scheduleEntityCode);
  const documentCurrency = documentCurrencyCode(ctx.record, rows);

  return (
    <ChildCollectionGrid
      entityCode={scheduleEntityCode}
      compiledEntity={scheduleEntity ?? null}
      label={surface.label ?? "Schedules"}
      count={rows.length}
      dataOverride={rows}
      loading={ctx.children.isLoading}
      currencyCode={documentCurrency}
      summarySlot={<Badge variant="secondary">Aggregate view</Badge>}
      searchPlaceholder="Search schedules..."
      searchAriaLabel="Search schedules"
      columnPreferenceKey={`${ctx.descriptor.entityCode}:schedules:aggregate-columns`}
      selectable={false}
      paginationMode="none"
      emptyMessage="No schedules found."
      getRowId={(row, index) => text(row.id) ?? `schedule-${index}`}
    />
  );
}

export function DocumentAccountingSurfaceRenderer({ surface }: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "document_accounting") return null;
  const ctx = useDocumentRuntimeContext();
  const rows = ctx.children.distributions.all.map(flattenRuntimeRecord);
  const accountingEntityCode = readSurfaceEntityCode(surface, "accounting_distribution");
  const { data: accountingEntity } = useCompiledEntity(accountingEntityCode);
  const documentCurrency = documentCurrencyCode(ctx.record, rows);

  return (
    <ChildCollectionGrid
      entityCode={accountingEntityCode}
      compiledEntity={accountingEntity ?? null}
      label={surface.label ?? "Accounting"}
      count={rows.length}
      dataOverride={rows}
      loading={ctx.children.isLoading}
      currencyCode={documentCurrency}
      summarySlot={<Badge variant="secondary">Aggregate view</Badge>}
      searchPlaceholder="Search accounting..."
      searchAriaLabel="Search accounting distributions"
      columnPreferenceKey={`${ctx.descriptor.entityCode}:accounting:aggregate-columns`}
      selectable={false}
      paginationMode="none"
      emptyMessage="No accounting distributions found."
      getRowId={(row, index) => text(row.id) ?? `accounting-${index}`}
    />
  );
}

function documentCurrencyCode(record: FlatRow, rows: FlatRow[]): string | undefined {
  return normaliseCurrencyCode(record["currency_code"])
    ?? normaliseCurrencyCode(record["document_currency_code"])
    ?? rows.map((row) => normaliseCurrencyCode(row["currency_code"])).find(Boolean);
}

function readSurfaceEntityCode(surface: RuntimeSurfaceRendererProps["surface"], fallback: string): string {
  const config = surface.config as Record<string, unknown> | null | undefined;
  const configured = config?.["entity_code"] ?? config?.["entityCode"] ?? config?.["child_entity_code"] ?? config?.["childEntityCode"];
  return typeof configured === "string" && configured.trim() ? configured.trim() : fallback;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}
