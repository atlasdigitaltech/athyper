"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useCompiledEntity } from "@athyper/query";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { EntityListSortEntry } from "@athyper/api-contracts/entity-list";
import type { MetaEntityCollectionConfig } from "@athyper/runtime-contracts";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { SearchInput } from "@athyper/ui/composites";
import type { ColumnDef, RowSelectionState } from "@athyper/ui/data";
import { cn } from "@athyper/theme/utils";
import {
  EmbeddedEntityList,
  type EmbeddedEntityListScope,
  type EmbeddedMobileRowsConfig,
} from "./embedded-entity-list";
import { LinesColumnPicker } from "./lines-column-picker";
import { useLocalStoragePreference } from "./use-local-storage-preference";
import { isQuantityLikeFieldName } from "../meta";

const UOM_COLUMN_NAMES = new Set([
  "unit_code",
  "uom_code",
  "uom",
  "unit_of_measure",
  "unitcode",
  "uomcode",
  "unitofmeasure",
]);

function defaultVisibleWithoutPairedUom(keys: string[]): string[] {
  if (!keys.some((key) => isQuantityLikeFieldName(key))) return keys;
  return keys.filter((key) => !UOM_COLUMN_NAMES.has(key.toLowerCase()));
}

function mergeRequiredVisibleKeys(
  visible: string[],
  required: string[] | undefined,
  entity: CompiledEntity | null,
): string[] {
  if (!required || required.length === 0) return visible;
  const known = entity ? new Set(entity.fields.map((field) => field.name)) : null;
  const next = [...visible];
  for (const key of required) {
    if (known && !known.has(key)) continue;
    if (!next.includes(key)) next.unshift(key);
  }
  return next;
}

export interface ChildCollectionGridProps {
  entityCode: string;
  label: string;
  count?: number;
  collection?: MetaEntityCollectionConfig;
  scope?: EmbeddedEntityListScope;
  initialSort?: EntityListSortEntry[];
  dataOverride?: Array<Record<string, unknown>>;
  columnsOverride?: ColumnDef<Record<string, unknown>>[];
  compiledEntity?: CompiledEntity | null;
  /** Disable compiled metadata for empty collections that render a fixed empty state. */
  metadataEnabled?: boolean;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  currencyCode?: string;
  quantityDisplay?: "pill" | "inline";
  summarySlot?: ReactNode;
  primaryActionSlot?: ReactNode;
  footerSlot?: ReactNode;
  onRowClick?: (row: Record<string, unknown>) => void;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
  rowExpansionToggle?: (row: Record<string, unknown>) => ReactNode;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (
    next: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
  getRowId?: (row: Record<string, unknown>, index: number) => string;
  mobileRows?: EmbeddedMobileRowsConfig;
  renderRowExpansion?: (row: Record<string, unknown>) => ReactNode;
  getIsRowExpanded?: (row: Record<string, unknown>) => boolean;
  selectable?: boolean;
  searchKeys?: string[];
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  columnPreferenceKey?: string;
  defaultVisibleColumnKeys?: string[];
  requiredVisibleColumnKeys?: string[];
  pinnedColumns?: string[];
  paginationMode?: "none" | "server";
  initialPageSize?: number;
  currentPage?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  virtualized?: boolean;
  virtualRowEstimate?: number;
  virtualOverscan?: number;
  disableHeaderSort?: boolean;
  emptyMessage?: string;
  className?: string;
  toolbarClassName?: string;
  tableContainerClassName?: string;
}

export function ChildCollectionGrid({
  entityCode,
  label,
  count,
  collection,
  scope,
  initialSort,
  dataOverride,
  columnsOverride,
  compiledEntity,
  metadataEnabled = true,
  loading,
  error,
  errorMessage = "Failed to load records. Try refreshing the page.",
  currencyCode,
  quantityDisplay,
  summarySlot,
  primaryActionSlot,
  footerSlot,
  onRowClick,
  rowActions,
  rowExpansionToggle,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  mobileRows,
  renderRowExpansion,
  getIsRowExpanded,
  selectable,
  searchKeys,
  searchPlaceholder,
  searchAriaLabel,
  columnPreferenceKey,
  defaultVisibleColumnKeys,
  requiredVisibleColumnKeys,
  pinnedColumns,
  paginationMode,
  initialPageSize,
  currentPage,
  totalCount,
  onPageChange,
  virtualized,
  virtualRowEstimate,
  virtualOverscan,
  disableHeaderSort,
  emptyMessage,
  className,
  toolbarClassName,
  tableContainerClassName,
}: ChildCollectionGridProps) {
  const [search, setSearch] = useState("");
  const { data: queriedEntity } = useCompiledEntity(entityCode, {
    enabled: metadataEnabled && compiledEntity === undefined,
  });
  const pickerEntity = compiledEntity ?? queriedEntity ?? null;

  const descriptorVisibleKeys = useMemo<string[]>(
    () => pickerEntity ? resolveListConfig(pickerEntity).columns.map((field) => field.name) : [],
    [pickerEntity],
  );
  const configuredVisibleKeys = collection?.table?.visibleColumns;
  const baseVisibleKeys = defaultVisibleWithoutPairedUom(
    defaultVisibleColumnKeys
      ?? (configuredVisibleKeys && configuredVisibleKeys.length > 0 ? configuredVisibleKeys : undefined)
      ?? descriptorVisibleKeys,
  );
  const [persistedVisibleKeys, setPersistedVisibleKeys] =
    useLocalStoragePreference<string[] | null>(
      columnPreferenceKey ?? `child-collection-grid:${entityCode}:columns`,
      null,
    );
  const effectiveVisibleKeys = mergeRequiredVisibleKeys(
    persistedVisibleKeys ?? baseVisibleKeys,
    requiredVisibleColumnKeys,
    pickerEntity,
  );

  const toolbarSearch = collection?.toolbar?.search;
  const searchConfig = typeof toolbarSearch === "object" && toolbarSearch !== null
    ? toolbarSearch
    : undefined;
  const searchEnabled = toolbarSearch !== false;
  const effectiveSearchKeys = searchKeys ?? searchConfig?.keys;
  const inlineLabel = label.trim().toLowerCase();
  const effectiveSearchPlaceholder = searchPlaceholder
    ?? searchConfig?.placeholder
    ?? `Search ${inlineLabel}...`;
  const effectiveSearchAriaLabel = searchAriaLabel ?? `Search ${inlineLabel}`;
  const columnsEnabled = collection?.toolbar?.columns !== false;
  const showCount = collection?.title?.showCount !== false;
  const renderedTitle = showCount && typeof count === "number"
    ? `${label} (${count})`
    : label;

  const primaryAction = collection?.toolbar?.primaryAction === "none"
    ? undefined
    : primaryActionSlot;
  const effectivePinnedColumns = pinnedColumns ?? collection?.table?.pinnedColumns;
  const effectivePaginationMode = paginationMode ?? collection?.table?.pagination ?? "none";
  const effectiveInitialPageSize = initialPageSize ?? collection?.table?.pageSize;
  const effectiveVirtualized = virtualized ?? collection?.table?.virtualized ?? false;
  const effectiveDisableHeaderSort = disableHeaderSort ?? collection?.table?.disableHeaderSort;
  const effectiveSelectable = selectable ?? collection?.row?.selection ?? false;

  const headerSlot = (
    <>
      <span className="shrink-0 text-base font-semibold text-foreground">{renderedTitle}</span>
      {summarySlot}
      {searchEnabled ? (
        <SearchInput
          value={search}
          onSearch={setSearch}
          debounceMs={150}
          placeholder={effectiveSearchPlaceholder}
          aria-label={effectiveSearchAriaLabel}
          className="ml-auto w-56 min-w-[12rem] shrink-0"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("");
          }}
        />
      ) : (
        <span className="ml-auto" aria-hidden="true" />
      )}
      {columnsEnabled && pickerEntity ? (
        <div className="hidden md:block">
          <LinesColumnPicker
            entity={pickerEntity}
            defaultVisible={baseVisibleKeys}
            visible={effectiveVisibleKeys}
            onApply={(next) => {
              const same = next.length === baseVisibleKeys.length
                && next.every((key, index) => key === baseVisibleKeys[index]);
              setPersistedVisibleKeys(same ? null : next);
            }}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <EmbeddedEntityList
      entityCode={entityCode}
      scope={scope}
      initialSort={initialSort}
      dataOverride={error ? [] : dataOverride}
      compiledEntity={pickerEntity}
      metadataEnabled={false}
      columnsOverride={columnsOverride}
      visibleColumnKeys={effectiveVisibleKeys.length > 0 ? effectiveVisibleKeys : undefined}
      clientSearchQuery={searchEnabled ? search : undefined}
      clientSearchKeys={effectiveSearchKeys}
      loading={error ? false : loading}
      emptyMessage={error ? errorMessage : emptyMessage}
      currencyCode={currencyCode}
      quantityDisplay={quantityDisplay}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={getRowId}
      onRowClick={onRowClick}
      rowActions={rowActions}
      rowExpansionToggle={rowExpansionToggle}
      selectable={effectiveSelectable}
      renderRowExpansion={renderRowExpansion}
      getIsRowExpanded={getIsRowExpanded}
      paginationMode={effectivePaginationMode}
      initialPageSize={effectiveInitialPageSize}
      currentPage={currentPage}
      totalCount={totalCount}
      onPageChange={onPageChange}
      mobileRows={mobileRows}
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
      toolbarClassName={cn("min-h-12 bg-card px-5 py-1", toolbarClassName)}
      tableContainerClassName={cn(
        "border-0 rounded-none overflow-x-auto overflow-y-auto max-h-[min(70dvh,42rem)]",
        tableContainerClassName,
      )}
      pinnedColumns={effectivePinnedColumns}
      virtualized={effectiveVirtualized}
      virtualRowEstimate={virtualRowEstimate}
      virtualOverscan={virtualOverscan}
      disableHeaderSort={effectiveDisableHeaderSort}
      slots={{
        header: headerSlot,
        primaryAction,
        footer: footerSlot,
      }}
    />
  );
}
