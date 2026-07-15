"use client";

/**
 * @athyper/runtime-canvas — useDocumentChildren
 *
 * Cleanup Plan v5 §5.6 + §6.2 + amendment 6.
 *
 * Single canonical source of truth for a document page's child
 * collections (lines, pricing_components, accounting_distributions,
 * etc.). All consumers — DocumentLineWaterfallDrawer, header strip,
 * postings preview, controlled LineItemsSurface — read from this
 * hook's return shape.
 *
 * Amendment 6: a single binding fetches ALL pricing_component rows
 * for a document; we split client-side into:
 *   - pricingComponents.headerScope   (source_line_id IS NULL)
 *   - pricingComponents.byLineId      (Map keyed by source_line_id)
 *
 * Single ownership (amendment 2): this hook owns child fetches.
 * LineItemsSurface accepts a controlled-data bundle backed by this
 * hook's output, never fetches its own copy.
 */

import { useEffect, useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type { ChildCollectionContract } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { markDocumentEditPerformanceOnce } from "./document-edit-performance-marks";
import {
  useOptionalDocumentEditCoordinator,
  useOptionalDocumentEditSection,
} from "./document-edit-coordinator";

// ─── Public types ────────────────────────────────────────────────────

/**
 * Legacy binding codes referenced from older descriptor
 * `polymorphic_pc_lines` surface config.
 */
export interface DocumentChildBindings {
  /** FK binding for the line entity (e.g. "purchase_invoice__purchase_invoice_line"). */
  line:              string;
  /** Polymorphic binding for pricing_component (e.g. "purchase_invoice__pricing_component"). */
  pricingComponent?: string;
  /** Polymorphic binding for accounting_distribution. */
  distribution?:     string;
}

/**
 * Descriptor relation names referenced from `polymorphic_pc_lines`
 * surface config. These resolve against `MetaEntityRuntimeDescriptor.relations`.
 */
export interface DocumentChildRelations {
  /** Relation for the line entity, usually "lines". */
  lines: string;
  /** Relation for pricing_component, usually "pricing_components". */
  pricingComponents?: string;
  /** Relation for accounting_distribution, usually "accounting_distributions". */
  distributions?: string;
  /** Relation for schedule_line, usually "schedules". */
  schedules?: string;
}

/**
 * Minimal projection of `pricing_component` needed for the split.
 * Consumers cast / project further per their needs.
 */
interface PricingComponentLike {
  source_line_id?: string | null;
  [k: string]: unknown;
}

/**
 * Minimal projection of `accounting_distribution` needed for the
 * per-line lookup map.
 */
interface AccountingDistributionLike {
  source_line_id?: string | null;
  [k: string]: unknown;
}

interface ScheduleLineLike {
  source_line_id?: string | null;
  [k: string]: unknown;
}

export interface DocumentChildrenResult {
  /** Raw line records — projection happens in the consumer. */
  lines: ReadonlyArray<RuntimeRecordRow>;

  pricingComponents: {
    all:         ReadonlyArray<RuntimeRecordRow>;
    headerScope: ReadonlyArray<RuntimeRecordRow>;
    byLineId:    ReadonlyMap<string, ReadonlyArray<RuntimeRecordRow>>;
  };

  distributions: {
    all:      ReadonlyArray<RuntimeRecordRow>;
    byLineId: ReadonlyMap<string, ReadonlyArray<RuntimeRecordRow>>;
  };

  schedules: {
    all:      ReadonlyArray<RuntimeRecordRow>;
    byLineId: ReadonlyMap<string, ReadonlyArray<RuntimeRecordRow>>;
  };

  isLoading: boolean;
  isError:   boolean;
  error:     Error | null;
  /** Invalidates every child query for this document. */
  onRefresh: () => Promise<void>;
}

export interface UseDocumentChildrenOptions {
  /**
   * The parent document's record id. When falsy the hook returns
   * empty collections without firing any fetch — useful for guarded
   * descriptor renders before the record loads.
   */
  parentId: string | null | undefined;
  entityCode?: string;
  relations?: DocumentChildRelations;
  bindings?: DocumentChildBindings;
  /** Per-query stale time. Default 30 seconds. */
  staleTimeMs?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDocumentChildren(opts: UseDocumentChildrenOptions): DocumentChildrenResult {
  const { parentId, relations, bindings, staleTimeMs = 30_000 } = opts;
  const entityCode = opts.entityCode ?? "";
  const enabled = Boolean(parentId);
  const coordinator = useOptionalDocumentEditCoordinator();

  const linesCoordinatorQuery = useCoordinatorChildCollectionQuery({
    ...(relations?.lines ? { relationName: relations.lines } : {}),
    ...(bindings?.line ? { bindingCode: bindings.line } : {}),
    enabled,
    preferredKeys: ["lines", "items", "line_items", "document_lines"],
  });

  const pcCoordinatorQuery = useCoordinatorChildCollectionQuery({
    ...(relations?.pricingComponents ? { relationName: relations.pricingComponents } : {}),
    ...(bindings?.pricingComponent ? { bindingCode: bindings.pricingComponent } : {}),
    enabled,
    preferredKeys: ["pricing_components", "components", "pricing"],
  });

  const adCoordinatorQuery = useCoordinatorChildCollectionQuery({
    ...(relations?.distributions ? { relationName: relations.distributions } : {}),
    ...(bindings?.distribution ? { bindingCode: bindings.distribution } : {}),
    enabled,
    preferredKeys: ["accounting_distributions", "distributions", "accounting"],
  });

  const scheduleCoordinatorQuery = useCoordinatorChildCollectionQuery({
    ...(relations?.schedules ? { relationName: relations.schedules } : {}),
    enabled,
    preferredKeys: ["schedules", "schedule_lines", "delivery_schedules"],
  });

  const linesQuery = useChildRelationQuery({
    entityCode,
    relationName: relations?.lines,
    bindingCode:  bindings?.line,
    parentId:    parentId ?? "",
    enabled:     enabled && !linesCoordinatorQuery.isActive && Boolean(relations?.lines || bindings?.line),
    staleTimeMs,
    queryKey:    ["doc-child-lines", entityCode, relations?.lines ?? bindings?.line ?? "", parentId ?? ""],
  });

  const pcQuery = useChildRelationQuery({
    entityCode,
    relationName: relations?.pricingComponents,
    bindingCode:  bindings?.pricingComponent,
    parentId:    parentId ?? "",
    enabled:     enabled && !pcCoordinatorQuery.isActive && Boolean(relations?.pricingComponents || bindings?.pricingComponent),
    staleTimeMs,
    queryKey:    ["doc-child-pc", entityCode, relations?.pricingComponents ?? bindings?.pricingComponent ?? "", parentId ?? ""],
  });

  const adQuery = useChildRelationQuery({
    entityCode,
    relationName: relations?.distributions,
    bindingCode:  bindings?.distribution,
    parentId:    parentId ?? "",
    enabled:     enabled && !adCoordinatorQuery.isActive && Boolean(relations?.distributions || bindings?.distribution),
    staleTimeMs,
    queryKey:    ["doc-child-ad", entityCode, relations?.distributions ?? bindings?.distribution ?? "", parentId ?? ""],
  });

  const scheduleQuery = useChildRelationQuery({
    entityCode,
    relationName: relations?.schedules,
    parentId:    parentId ?? "",
    enabled:     enabled && !scheduleCoordinatorQuery.isActive && Boolean(relations?.schedules),
    staleTimeMs,
    queryKey:    ["doc-child-schedules", entityCode, relations?.schedules ?? "", parentId ?? ""],
  });

  // ─── Amendment 6 split: header-scope vs by-line PC ─────────────────
  const linesRows = linesCoordinatorQuery.isActive
    ? linesCoordinatorQuery.rows ?? []
    : linesQuery.data ?? [];
  const pricingComponentRows = pcCoordinatorQuery.isActive
    ? pcCoordinatorQuery.rows ?? []
    : pcQuery.data ?? [];
  const distributionRows = adCoordinatorQuery.isActive
    ? adCoordinatorQuery.rows ?? []
    : adQuery.data ?? [];
  const scheduleRows = scheduleCoordinatorQuery.isActive
    ? scheduleCoordinatorQuery.rows ?? []
    : scheduleQuery.data ?? [];

  const pricingComponentSlices = useMemo(() => {
    const rows = pricingComponentRows;
    const headerScope: RuntimeRecordRow[] = [];
    const byLineId = new Map<string, RuntimeRecordRow[]>();
    for (const row of rows) {
      const flat = flattenRecord(row) as PricingComponentLike;
      const sourceLineId = flat.source_line_id;
      if (sourceLineId == null) {
        headerScope.push(row);
        continue;
      }
      const key = String(sourceLineId);
      const bucket = byLineId.get(key) ?? [];
      bucket.push(row);
      byLineId.set(key, bucket);
    }
    return { all: rows, headerScope, byLineId };
  }, [pricingComponentRows]);

  const distributionSlices = useMemo(() => {
    const rows = distributionRows;
    const byLineId = new Map<string, RuntimeRecordRow[]>();
    for (const row of rows) {
      const flat = flattenRecord(row) as AccountingDistributionLike;
      const sourceLineId = flat.source_line_id;
      if (sourceLineId == null) continue;
      const key = String(sourceLineId);
      const bucket = byLineId.get(key) ?? [];
      bucket.push(row);
      byLineId.set(key, bucket);
    }
    return { all: rows, byLineId };
  }, [distributionRows]);

  const scheduleSlices = useMemo(() => {
    const rows = scheduleRows;
    const byLineId = new Map<string, RuntimeRecordRow[]>();
    for (const row of rows) {
      const flat = flattenRecord(row) as ScheduleLineLike;
      const sourceLineId = flat.source_line_id;
      if (sourceLineId == null) continue;
      const key = String(sourceLineId);
      const bucket = byLineId.get(key) ?? [];
      bucket.push(row);
      byLineId.set(key, bucket);
    }
    return { all: rows, byLineId };
  }, [scheduleRows]);

  // ─── Aggregate loading / error state ───────────────────────────────
  const isLoading =
    (linesCoordinatorQuery.isActive ? linesCoordinatorQuery.isLoading : linesQuery.isLoading)
    || (pcCoordinatorQuery.isActive ? pcCoordinatorQuery.isLoading : pcQuery.isLoading)
    || (adCoordinatorQuery.isActive ? adCoordinatorQuery.isLoading : adQuery.isLoading)
    || (scheduleCoordinatorQuery.isActive ? scheduleCoordinatorQuery.isLoading : scheduleQuery.isLoading);
  const isError =
    (linesCoordinatorQuery.isActive ? linesCoordinatorQuery.isError : linesQuery.isError)
    || (pcCoordinatorQuery.isActive ? pcCoordinatorQuery.isError : pcQuery.isError)
    || (adCoordinatorQuery.isActive ? adCoordinatorQuery.isError : adQuery.isError)
    || (scheduleCoordinatorQuery.isActive ? scheduleCoordinatorQuery.isError : scheduleQuery.isError);
  const error =
    (linesCoordinatorQuery.isActive ? linesCoordinatorQuery.error : linesQuery.error)
    ?? (pcCoordinatorQuery.isActive ? pcCoordinatorQuery.error : pcQuery.error)
    ?? (adCoordinatorQuery.isActive ? adCoordinatorQuery.error : adQuery.error)
    ?? (scheduleCoordinatorQuery.isActive ? scheduleCoordinatorQuery.error : scheduleQuery.error)
    ?? null;

  useEffect(() => {
    if (!enabled) return;
    if (isLoading || isError) return;
    markDocumentEditPerformanceOnce("line-metadata-ready");
  }, [enabled, isError, isLoading]);

  const onRefresh = async () => {
    await Promise.all([
      linesCoordinatorQuery.isActive ? linesCoordinatorQuery.refetch() : linesQuery.refetch(),
      pcCoordinatorQuery.isActive ? pcCoordinatorQuery.refetch() : pcQuery.refetch(),
      adCoordinatorQuery.isActive ? adCoordinatorQuery.refetch() : adQuery.refetch(),
      scheduleCoordinatorQuery.isActive ? scheduleCoordinatorQuery.refetch() : scheduleQuery.refetch(),
      coordinator?.invalidateCore(),
    ]);
  };

  return {
    lines:             linesRows,
    pricingComponents: pricingComponentSlices,
    distributions:     distributionSlices,
    schedules:         scheduleSlices,
    isLoading,
    isError,
    error,
    onRefresh,
  };
}

// ─── Per-binding query wrapper ───────────────────────────────────────

interface CoordinatorChildCollectionQueryOptions {
  relationName?: string;
  bindingCode?: string;
  enabled: boolean;
  preferredKeys: readonly string[];
}

interface CoordinatorChildCollectionQueryResult {
  isActive: boolean;
  rows?: ReadonlyArray<RuntimeRecordRow>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

function useCoordinatorChildCollectionQuery(
  opts: CoordinatorChildCollectionQueryOptions,
): CoordinatorChildCollectionQueryResult {
  const coordinator = useOptionalDocumentEditCoordinator();
  const collection = useMemo(
    () => resolveCoordinatorChildCollection(
      coordinator?.contract.childCollections ?? [],
      opts,
      Boolean(coordinator),
    ),
    [
      coordinator?.contract.childCollections,
      opts.bindingCode,
      opts.relationName,
      opts.preferredKeys,
    ],
  );
  const sectionQuery = useOptionalDocumentEditSection(collection?.sectionKey, {
    enabled: opts.enabled && Boolean(collection) && collection?.loadPolicy === "eager_parallel",
  });
  const rows = useMemo(
    () => collection ? readSectionChildRows(sectionQuery.data?.data, collection.key) : undefined,
    [collection, sectionQuery.data],
  );

  return {
    isActive: Boolean(collection) || Boolean(coordinator && (opts.relationName || opts.bindingCode)),
    rows: sectionQuery.data?.status === "ok" ? rows ?? [] : undefined,
    isLoading: sectionQuery.isLoading,
    isError: sectionQuery.isError,
    error: sectionQuery.error ?? null,
    refetch: sectionQuery.refetch,
  };
}

interface ChildRelationQueryOptions {
  entityCode:    string;
  relationName?: string;
  bindingCode?:  string;
  parentId:      string;
  enabled:       boolean;
  staleTimeMs:   number;
  queryKey:      ReadonlyArray<unknown>;
}

function useChildRelationQuery(opts: ChildRelationQueryOptions): UseQueryResult<ReadonlyArray<RuntimeRecordRow>, Error> {
  return useQuery({
    queryKey:  opts.queryKey,
    queryFn:   async () => {
      if (!opts.parentId) return [];
      const href = opts.relationName && opts.entityCode
        ? runtimePath.relationRecords(opts.entityCode, opts.relationName, opts.parentId)
        : opts.bindingCode
          ? runtimePath.bindingRecords(opts.bindingCode, opts.parentId)
          : null;
      if (!href) return [];
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `${opts.relationName ?? opts.bindingCode}: ${res.status}`);
      }
      const body = await res.json() as { records?: ReadonlyArray<RuntimeRecordRow> };
      return Array.isArray(body.records) ? body.records : [];
    },
    enabled:    opts.enabled,
    staleTime:  opts.staleTimeMs,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveCoordinatorChildCollection(
  collections: readonly ChildCollectionContract[],
  opts: CoordinatorChildCollectionQueryOptions,
  workspaceEnabled: boolean,
): ChildCollectionContract | null {
  if (collections.length === 0) return null;

  if (opts.relationName) {
    const byRelation = collections.find((collection) => collection.relationName === opts.relationName);
    if (byRelation) return byRelation;
  }

  if (opts.bindingCode) {
    const byBinding = collections.find((collection) => collection.bindingCode === opts.bindingCode);
    if (byBinding) return byBinding;
  }

  if (workspaceEnabled) return null;

  for (const key of opts.preferredKeys) {
    const byKey = collections.find((collection) => collection.key === key);
    if (byKey) return byKey;
  }

  return null;
}

function readSectionChildRows(
  value: unknown,
  collectionKey: string,
): ReadonlyArray<RuntimeRecordRow> {
  if (!isRecord(value) || !Array.isArray(value["childCollections"])) return [];
  for (const candidate of value["childCollections"]) {
    if (!isRecord(candidate) || candidate["key"] !== collectionKey) continue;
    const records = candidate["records"];
    return Array.isArray(records) ? records.filter(isRecord) as RuntimeRecordRow[] : [];
  }
  return [];
}

function flattenRecord(record: RuntimeRecordRow): Record<string, unknown> {
  const data = record.data && typeof record.data === "object" ? record.data : {};
  return { ...record, ...(data as Record<string, unknown>) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
