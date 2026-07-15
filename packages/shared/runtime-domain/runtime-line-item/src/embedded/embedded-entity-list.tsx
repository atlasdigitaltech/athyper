"use client";

/**
 * @athyper/runtime-line-item — EmbeddedEntityList
 *
 * Slot-based entity list designed to mount inside another surface. First
 * consumer is the document-page line items grid; the abstraction is
 * intentionally generic so other embedded child-collections (deeply nested
 * dimensions, sub-line breakdowns, etc.) can adopt it later.
 *
 * Lives in `@athyper/runtime-line-item` for now because the line-items
 * grid is its sole caller. Once a second non-line-item consumer surfaces,
 * lift it to a more general shared package — at that point the
 * `formatFieldValue`-based descriptor cell renderer can be swapped for a
 * pluggable `resolveFieldRenderer` injection point.
 *
 * Design discipline — what's deliberately NOT here yet:
 *   - Filter chips / filter drawer
 *   - Column visibility chooser
 *   - Group / Kanban / Dashboard view modes
 *   - Bulk action toolbar (selection state IS tracked + exposable)
 *   - Saved views (embedded grids don't persist user state)
 *
 * Two escape hatches for caller control:
 *   - `dataOverride` bypasses the server fetch — used by draft-mode
 *     consumers that merge in-memory drafts with previously-fetched rows.
 *   - `columnsOverride` bypasses descriptor-driven columns — used by
 *     line-item grids whose variant catalogs (procure/sales/generic)
 *     don't yet round-trip cleanly through `display_config.list_columns`.
 *   - `clientSearchQuery` lets the caller render its own search chrome
 *     while this component filters the bounded row set it already has.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCompiledEntity, useEntityList } from "@athyper/query";
import {
  DataTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@athyper/ui/data";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { EntityListSortEntry } from "@athyper/api-contracts/entity-list";
import { resolveListConfig } from "@athyper/metadata-client/compiled-reader";
import { cn } from "@athyper/theme/utils";
import { buildEmbeddedColumns } from "./columns";

// Client-side comparator used when `dataOverride` is in play (no server
// round-trip to do the sort for us). Nulls sort last regardless of
// direction — `.reverse()` on the asc result would push nulls to the top
// in desc mode, which is the wrong UX. Numbers compare numerically;
// everything else uses localeCompare with `numeric: true` so strings that
// look like numbers ("10" vs "2") still sort the way users expect.
function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  let cmp: number;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else if (typeof a === "boolean" && typeof b === "boolean") {
    cmp = (a === b) ? 0 : (a ? 1 : -1);
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }
  return dir === "desc" ? -cmp : cmp;
}

function searchableText(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(searchableText).filter(Boolean).join(" ");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["label", "name", "code", "display", "id"]
      .map((key) => searchableText(record[key]))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface EmbeddedEntityListSlots {
  /** Left side of the toolbar (e.g. count strip + status pills). */
  header?: ReactNode;
  /** Right side of the toolbar (e.g. Add Item dropdown). */
  primaryAction?: ReactNode;
  /** Rendered below the table (e.g. totals row). */
  footer?: ReactNode;
}

/**
 * Context handed to `mobileRows.renderRow`. Selection / openRow are wired
 * to the same state that drives the desktop table — both branches share
 * one truth.
 */
export interface EmbeddedMobileRowContext {
  row: Record<string, unknown>;
  rowId: string;
  index: number;
  selected: boolean;
  setSelected: (checked: boolean) => void;
  /** Calls `onRowClick(row)` if the parent provided one. No-op otherwise. */
  openRow: () => void;
  entity: CompiledEntity | null;
  currencyCode?: string;
}

export interface EmbeddedMobileRowsConfig {
  renderRow: (ctx: EmbeddedMobileRowContext) => ReactNode;
  /** Class names applied to the `<ul>` that wraps the mobile rows. */
  listClassName?: string;
  /** Opt-in virtual rendering for large mobile card lists. */
  virtualized?: boolean;
  /** Estimated mobile row height in px for virtualized rendering. */
  virtualRowEstimate?: number;
  /** Extra mobile rows rendered above/below the visible viewport. */
  virtualOverscan?: number;
  /** Shown when `loading=true` on mobile. Default: "Loading…". */
  loadingMessage?: string;
  /** Shown when there are no rows on mobile. Default: same as `emptyMessage`. */
  emptyMessage?: string;
}

export interface EmbeddedEntityListScope {
  /**
   * Parent FK scope for child entities. Resolved server-side via the
   * entity's `identity_config.parent.field`. Caller-owned: not user-
   * controlled and not persisted in saved views.
   */
  parent_id?: string;
}

export interface EmbeddedEntityListProps {
  entityCode: string;
  scope?: EmbeddedEntityListScope;
  /** Initial sort. Component owns sort state in memory thereafter. */
  initialSort?: EntityListSortEntry[];
  slots?: EmbeddedEntityListSlots;
  /** When provided, rows become clickable and this fires per row. */
  onRowClick?: (row: Record<string, unknown>) => void;
  /** Enables the leading checkbox column. Defaults true for existing embedded grid callers. */
  selectable?: boolean;
  /** Optional sticky-right row action cell. */
  rowActions?: (row: Record<string, unknown>) => ReactNode;
  /** Optional control rendered inside the line identity column. */
  rowExpansionToggle?: (row: Record<string, unknown>) => ReactNode;
  /**
   *  - `"none"`   (default): single page, no pagination controls. Suitable
   *    for bounded child collections (e.g. document lines).
   *  - `"server"`: server-side pagination with prev/next controls.
   */
  paginationMode?: "none" | "server";
  /** Initial page size when `paginationMode === "server"`. Default 25. */
  initialPageSize?: number;
  /**
   * Bypass the server fetch and render these rows directly. The server
   * query is disabled (no waste). Draft-mode consumers merge their local
   * drafts with previously-fetched server rows and feed the union here.
   */
  dataOverride?: Array<Record<string, unknown>>;
  /** Caller-owned descriptor; prevents a second compiled-metadata query. */
  compiledEntity?: CompiledEntity | null;
  /** Disable descriptor loading for intentionally metadata-free empty states. */
  metadataEnabled?: boolean;
  /**
   * Bypass descriptor-driven columns. Used by line grids that still rely
   * on variant column catalogs (procure / sales / generic) — those don't
   * yet round-trip cleanly through `display_config.list_columns`.
   */
  columnsOverride?: ColumnDef<Record<string, unknown>>[];
  /**
   * Project columns from a caller-supplied list of field names. Overrides
   * the descriptor's `display_config.list_columns` while still using the
   * embedded grid's descriptor-driven cell formatter. Used by consumers
   * (e.g., the line items grid) that let users add/remove columns via a
   * column-visibility picker.
   *
   * Ignored when `columnsOverride` is set.
   */
  visibleColumnKeys?: string[];
  /**
   * Client-side search over the rows currently held by this embedded list.
   * Intended for bounded `dataOverride` collections such as invoice lines.
   */
  clientSearchQuery?: string;
  /** Fields searched by `clientSearchQuery`; defaults to every row value. */
  clientSearchKeys?: string[];
  /**
   * Controlled selection. When provided, the component does not own the
   * selection — `onRowSelectionChange` is the single writer. Use this
   * when the parent renders a floating selection bar / bulk-action UI
   * that depends on which rows are selected.
   *
   * Selection keys default to TanStack's row index. Pass `getRowId` to
   * key selection by a stable row identity so sort/filter changes don't
   * shuffle which rows look selected.
   */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (
    next: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
  /**
   * Stable row identity. Threaded into both the desktop `DataTable` and
   * the mobile row branch so selection state keys consistently across
   * sort/search and viewport switches. Returning a falsy id falls back
   * to the row index.
   */
  getRowId?: (row: Record<string, unknown>, index: number) => string;
  /**
   * Opt-in mobile presentation. When set, the desktop `DataTable` renders
   * inside `hidden md:block` and a row-card list renders inside `md:hidden`.
   * Both branches share the same `rows`, `rowSelection`, and `onRowClick`
   * source of truth — no duplicate data path.
   */
  mobileRows?: EmbeddedMobileRowsConfig;
  /**
   * Override the internal loading derivation. Useful when the parent
   * owns its own loading signal (e.g. LinesGrid receives `isLoading`
   * from its caller alongside `dataOverride`).
   */
  loading?: boolean;
  /** Message shown by the table branch when there are no rows. */
  emptyMessage?: string;
  /** Currency code threaded into descriptor cell formatting. */
  currencyCode?: string;
  /** Descriptor quantity cells render as plain text or suffix-pill group. */
  quantityDisplay?: "pill" | "inline";
  /**
   * Extra classes appended to the toolbar div (`<div>` that wraps
   * `slots.header` and `slots.primaryAction`). Use this to opt the grid
   * into a more prominent two-level toolbar look (subtle background,
   * taller padding) without forking the component.
   */
  toolbarClassName?: string;
  /**
   * Extra classes appended to the inner `DataTable` container (the
   * `<div>` that wraps the `<table>`). Use this to flatten the inner
   * table's default `rounded-md border` when the outer grid already
   * provides a rounded-bordered container — avoids the double-border
   * look from nested chrome.
   */
  tableContainerClassName?: string;
  /**
   * Column keys to pin left in the desktop table. Threaded directly to
   * DataTable; useful for keeping identity columns visible during horizontal
   * scroll inside embedded grids.
   */
  pinnedColumns?: string[];
  /**
   * Opt-in desktop row virtualization. Keeps all rows in memory for totals,
   * search, and selection while only rendering the visible viewport.
   */
  virtualized?: boolean;
  virtualRowEstimate?: number;
  virtualOverscan?: number;
  /**
   * When true, all descriptor-driven columns render with sort disabled.
   * Used with the two-level toolbar pattern where sort affordances
   * belong in the toolbar rather than per-column arrows. Click-to-sort
   * stops working at the header level; future Sort drawer would
   * reintroduce the affordance in the toolbar.
   */
  disableHeaderSort?: boolean;
  /**
   * Inline row expansion. When both props are provided, the desktop
   * DataTable renders `renderRowExpansion(row)` as a full-width sub-row
   * below each row for which `getIsRowExpanded(row) === true`. Caller
   * owns the expansion state. Mobile branch ignores these props today.
   */
  renderRowExpansion?: (row: Record<string, unknown>) => ReactNode;
  getIsRowExpanded?: (row: Record<string, unknown>) => boolean;
  className?: string;
}

const DEFAULT_PAGE_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmbeddedEntityList({
  entityCode,
  scope,
  initialSort,
  slots,
  onRowClick,
  selectable = true,
  rowActions,
  rowExpansionToggle,
  paginationMode = "none",
  initialPageSize = DEFAULT_PAGE_SIZE,
  dataOverride,
  compiledEntity,
  metadataEnabled = true,
  columnsOverride,
  visibleColumnKeys,
  clientSearchQuery,
  clientSearchKeys,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  getRowId,
  mobileRows,
  loading,
  emptyMessage = "No records",
  currencyCode,
  quantityDisplay,
  toolbarClassName,
  tableContainerClassName,
  pinnedColumns,
  virtualized,
  virtualRowEstimate,
  virtualOverscan,
  disableHeaderSort,
  renderRowExpansion,
  getIsRowExpanded,
  className,
}: EmbeddedEntityListProps) {
  // In-memory state — URL is intentionally NOT a source of truth so this
  // grid composes inside any parent without hijacking the address bar.
  //
  // Sort precedence: user-controlled state wins, then the descriptor's
  // display_config.default_sort_field (resolved from the compiled entity),
  // then no sort. `userTouchedSort` keeps an explicit "user cleared sort"
  // distinct from "no user input yet" so we don't re-apply the descriptor
  // default after the user deliberately turned sort off.
  const [userSort, setUserSort] = useState<EntityListSortEntry[] | undefined>(initialSort);
  const [userTouchedSort, setUserTouchedSort] = useState<boolean>(initialSort !== undefined);
  const [page, setPage] = useState<number>(1);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});

  const rowSelection = controlledSelection ?? internalSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalSelection;
  const normalizedClientSearch = useMemo(
    () => clientSearchQuery?.trim().toLocaleLowerCase() ?? "",
    [clientSearchQuery],
  );

  const { data: queriedEntity, isLoading: descriptorLoading } = useCompiledEntity(entityCode, {
    enabled: metadataEnabled && compiledEntity === undefined,
  });
  const entity = compiledEntity ?? queriedEntity;

  // Descriptor-level default sort, derived from display_config. Becomes the
  // effective sort until the user interacts with sort affordances.
  const descriptorDefaultSort = useMemo<EntityListSortEntry[] | undefined>(() => {
    if (!entity) return undefined;
    const { defaultSortField, defaultSortOrder } = resolveListConfig(entity);
    return defaultSortField
      ? [{ key: defaultSortField, dir: defaultSortOrder }]
      : undefined;
  }, [entity]);
  const sort = userTouchedSort ? userSort : descriptorDefaultSort;

  // Server-side page index becomes stale when sort or scope changes — reset.
  useEffect(() => {
    setPage(1);
  }, [sort, scope?.parent_id, normalizedClientSearch]);

  const queryEnabled = dataOverride === undefined;
  const apiParams = useMemo(
    () => ({
      sort,
      parent_id: scope?.parent_id,
      ...(paginationMode === "server"
        ? { page, pageSize: initialPageSize }
        : {}),
    }),
    [sort, scope?.parent_id, paginationMode, page, initialPageSize],
  );

  const {
    data: listData,
    isLoading: dataLoading,
  } = useEntityList(entityCode, apiParams, { enabled: queryEnabled });

  // MasterRecord shape: `{ id, data: { ...fields } }`. Flatten so column
  // accessors can read fields directly off the row.
  //
  // Search runs client-side over the row set this embedded list already has.
  // Sort handling depends on the data source:
  //   - Server query: `sort` is threaded into apiParams and the API returns
  //     pre-sorted rows. DataTable's `manualSorting: true` mode is correct.
  //   - dataOverride: there's no server round-trip, so we apply `sort`
  //     client-side here. Without this, clicking a column header updates
  //     the visual indicator but the rows don't move (the bug the
  //     line-items grid hit).
  const rows = useMemo<Array<Record<string, unknown>>>(() => {
    const base: Array<Record<string, unknown>> = dataOverride !== undefined
      ? dataOverride
      : (listData?.data ?? []).map((r) => ({ id: r.id, ...(r.data ?? {}) }));

    const searched = normalizedClientSearch
      ? base.filter((row) => {
          const values = clientSearchKeys && clientSearchKeys.length > 0
            ? clientSearchKeys.map((key) => row[key])
            : Object.values(row);
          return values.some((value) =>
            searchableText(value).toLocaleLowerCase().includes(normalizedClientSearch),
          );
        })
      : base;

    if (dataOverride === undefined || !sort || sort.length === 0) {
      return searched;
    }

    const primary = sort[0]!;
    return [...searched].sort((a, b) => compareValues(a[primary.key], b[primary.key], primary.dir));
  }, [dataOverride, listData, sort, normalizedClientSearch, clientSearchKeys]);

  const columns = useMemo(
    () => columnsOverride ?? (entity
        ? buildEmbeddedColumns(entity, {
          currencyCode,
          quantityDisplay,
          visibleKeys: visibleColumnKeys,
          disableSort: disableHeaderSort,
          rowExpansionToggle,
        })
      : []),
    [columnsOverride, entity, currencyCode, quantityDisplay, visibleColumnKeys, disableHeaderSort, rowExpansionToggle],
  );

  const sortingState = useMemo<SortingState>(
    () => sort?.map((s) => ({ id: s.key, desc: s.dir === "desc" })) ?? [],
    [sort],
  );

  const handleSortChange = (next: SortingState) => {
    setUserTouchedSort(true);
    if (next.length === 0) {
      setUserSort(undefined);
      return;
    }
    const { id, desc } = next[0]!;
    setUserSort([{ key: id, dir: desc ? "desc" : "asc" }]);
  };

  // Loading derivation — explicit override wins. Otherwise: when columns
  // are overridden, descriptor isn't load-bearing for rendering; when data
  // is overridden, the server query was disabled.
  const internalLoading = (columnsOverride === undefined && descriptorLoading)
                       || (queryEnabled && dataLoading);
  const isLoading = loading ?? internalLoading;

  const pagination = listData?.pagination as { total?: number } | undefined;
  const totalCount = pagination?.total;
  const totalPages = totalCount !== undefined && paginationMode === "server"
    ? Math.max(1, Math.ceil(totalCount / initialPageSize))
    : undefined;

  // Stable id resolver — both branches use the same function so the
  // mobile checkbox and the desktop checkbox key the same selection slot.
  const resolveRowId = (row: Record<string, unknown>, index: number): string => {
    if (getRowId) {
      const id = getRowId(row, index);
      if (id) return id;
    }
    return String(index);
  };

  // Desktop classes — when mobile rendering is enabled, hide below md.
  const desktopWrapperClass = mobileRows ? "hidden md:block" : undefined;

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border/30 px-4 py-2.5",
          toolbarClassName,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          {slots?.header}
        </div>
        {slots?.primaryAction && (
          <div className="shrink-0">{slots.primaryAction}</div>
        )}
      </div>

      <div className={desktopWrapperClass}>
        <DataTable
          columns={columns}
          data={rows}
          tableContainerClassName={tableContainerClassName}
          loading={isLoading}
          sortingState={sortingState}
          onSortingChange={handleSortChange}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={onRowClick}
          rowActions={rowActions}
          getRowId={getRowId}
          density="comfortable"
          emptyMessage={emptyMessage}
          pinnedColumns={pinnedColumns}
          selectable={selectable}
          virtualized={virtualized}
          virtualRowEstimate={virtualRowEstimate}
          virtualOverscan={virtualOverscan}
          renderRowExpansion={renderRowExpansion}
          getIsRowExpanded={getIsRowExpanded}
          pageSize={paginationMode === "none" ? 0 : initialPageSize}
          {...(paginationMode === "server"
            ? {
                totalCount,
                currentPage: page,
                totalPages,
                onPageChange: setPage,
              }
            : {})}
        />
      </div>

      {mobileRows && (
        <MobileRowList
          rows={rows}
          resolveRowId={resolveRowId}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          onRowClick={onRowClick}
          entity={entity ?? null}
          currencyCode={currencyCode}
          loading={isLoading}
          config={mobileRows}
        />
      )}

      {slots?.footer}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile row branch
// ─────────────────────────────────────────────────────────────────────────────

function MobileRowList({
  rows,
  resolveRowId,
  rowSelection,
  setRowSelection,
  onRowClick,
  entity,
  currencyCode,
  loading,
  config,
}: {
  rows: Array<Record<string, unknown>>;
  resolveRowId: (row: Record<string, unknown>, index: number) => string;
  rowSelection: RowSelectionState;
  setRowSelection: (
    next: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
  entity: CompiledEntity | null;
  currencyCode?: string;
  loading: boolean;
  config: EmbeddedMobileRowsConfig;
}) {
  const loadingMessage = config.loadingMessage ?? "Loading…";
  const emptyMessage = config.emptyMessage ?? "No records";
  const shouldVirtualize = Boolean(config.virtualized && !loading && rows.length > 0);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualOverscan = config.virtualOverscan ?? 8;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => config.virtualRowEstimate ?? 88,
    overscan: virtualOverscan,
  });
  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  if (loading) {
    return (
      <div className="md:hidden flex h-24 items-center justify-center text-sm text-muted-foreground">
        {loadingMessage}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="md:hidden flex h-24 items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const renderRow = (row: Record<string, unknown>, index: number) => {
    const rowId = resolveRowId(row, index);
    const selected = Boolean(rowSelection[rowId]);
    const setSelected = (checked: boolean) => {
      setRowSelection((prev) => {
        const next = { ...prev };
        if (checked) next[rowId] = true;
        else delete next[rowId];
        return next;
      });
    };
    const openRow = () => {
      onRowClick?.(row);
    };
    return (
      <li key={rowId}>
        {config.renderRow({
          row,
          rowId,
          index,
          selected,
          setSelected,
          openRow,
          entity,
          currencyCode,
        })}
      </li>
    );
  };

  if (shouldVirtualize) {
    return (
      <div
        ref={parentRef}
        className="md:hidden max-h-[min(70dvh,42rem)] overflow-auto"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        <ul
          className={cn(
            "relative divide-y divide-border/40",
            config.listClassName,
          )}
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const rowId = resolveRowId(row, virtualRow.index);
            const selected = Boolean(rowSelection[rowId]);
            const setSelected = (checked: boolean) => {
              setRowSelection((prev) => {
                const next = { ...prev };
                if (checked) next[rowId] = true;
                else delete next[rowId];
                return next;
              });
            };
            const openRow = () => {
              onRowClick?.(row);
            };
            return (
              <li
                key={rowId}
                className="absolute left-0 right-0 top-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {config.renderRow({
                  row,
                  rowId,
                  index: virtualRow.index,
                  selected,
                  setSelected,
                  openRow,
                  entity,
                  currencyCode,
                })}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        "md:hidden divide-y divide-border/40",
        config.listClassName,
      )}
    >
      {rows.map(renderRow)}
    </ul>
  );
}
