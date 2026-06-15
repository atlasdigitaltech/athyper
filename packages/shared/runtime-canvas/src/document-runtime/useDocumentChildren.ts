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

import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";

// ─── Public types ────────────────────────────────────────────────────

/**
 * Binding codes referenced from descriptor `polymorphic_pc_lines`
 * surface config. Each must exist in `control.polymorphic_child_binding`.
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
  bindings: DocumentChildBindings;
  /** Per-query stale time. Default 30 seconds. */
  staleTimeMs?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDocumentChildren(opts: UseDocumentChildrenOptions): DocumentChildrenResult {
  const { parentId, bindings, staleTimeMs = 30_000 } = opts;
  const enabled = Boolean(parentId);

  const linesQuery = useBindingQuery({
    bindingCode: bindings.line,
    parentId:    parentId ?? "",
    enabled,
    staleTimeMs,
    queryKey:    ["doc-child-lines", bindings.line, parentId ?? ""],
  });

  const pcQuery = useBindingQuery({
    bindingCode: bindings.pricingComponent,
    parentId:    parentId ?? "",
    enabled:     enabled && Boolean(bindings.pricingComponent),
    staleTimeMs,
    queryKey:    ["doc-child-pc", bindings.pricingComponent ?? "", parentId ?? ""],
  });

  const adQuery = useBindingQuery({
    bindingCode: bindings.distribution,
    parentId:    parentId ?? "",
    enabled:     enabled && Boolean(bindings.distribution),
    staleTimeMs,
    queryKey:    ["doc-child-ad", bindings.distribution ?? "", parentId ?? ""],
  });

  // ─── Amendment 6 split: header-scope vs by-line PC ─────────────────
  const pricingComponentSlices = useMemo(() => {
    const rows = pcQuery.data ?? [];
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
  }, [pcQuery.data]);

  const distributionSlices = useMemo(() => {
    const rows = adQuery.data ?? [];
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
  }, [adQuery.data]);

  // ─── Aggregate loading / error state ───────────────────────────────
  const isLoading = linesQuery.isLoading || pcQuery.isLoading || adQuery.isLoading;
  const isError   = linesQuery.isError   || pcQuery.isError   || adQuery.isError;
  const error     = linesQuery.error ?? pcQuery.error ?? adQuery.error ?? null;

  const onRefresh = async () => {
    await Promise.all([
      linesQuery.refetch(),
      pcQuery.refetch(),
      adQuery.refetch(),
    ]);
  };

  return {
    lines:             linesQuery.data ?? [],
    pricingComponents: pricingComponentSlices,
    distributions:     distributionSlices,
    isLoading,
    isError,
    error,
    onRefresh,
  };
}

// ─── Per-binding query wrapper ───────────────────────────────────────

interface BindingQueryOptions {
  bindingCode: string | undefined;
  parentId:    string;
  enabled:     boolean;
  staleTimeMs: number;
  queryKey:    ReadonlyArray<unknown>;
}

function useBindingQuery(opts: BindingQueryOptions): UseQueryResult<ReadonlyArray<RuntimeRecordRow>, Error> {
  return useQuery({
    queryKey:  opts.queryKey,
    queryFn:   async () => {
      if (!opts.bindingCode || !opts.parentId) return [];
      const res = await fetch(
        `/api/document-runtime/binding/${encodeURIComponent(opts.bindingCode)}`
        + `/records/${encodeURIComponent(opts.parentId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `${opts.bindingCode}: ${res.status}`);
      }
      const body = await res.json() as { records?: ReadonlyArray<RuntimeRecordRow> };
      return Array.isArray(body.records) ? body.records : [];
    },
    enabled:    opts.enabled,
    staleTime:  opts.staleTimeMs,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function flattenRecord(record: RuntimeRecordRow): Record<string, unknown> {
  const data = record.data && typeof record.data === "object" ? record.data : {};
  return { ...record, ...(data as Record<string, unknown>) };
}
