"use client";

// lib/finance/use-insight-graph.ts
//
// Data-fetching hook for the Atlas Insight Graph API.
// Returns the materialized relationship graph for a given entity+period.

import { useState, useEffect, useCallback, useRef } from "react";

import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Types (mirrors the insight-graph API response shape)
// ---------------------------------------------------------------------------

export interface InsightGraphNode {
  id: string;
  type: string;
  label: string;
  status: string;
  [key: string]: unknown;
}

export interface InsightGraphEdge {
  id: string;
  type: string;
  source: string;
  target: string;
  label: string;
  weight: number | null;
  metadata: Record<string, unknown> | null;
}

export interface InsightGraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  hotspots: Array<{
    nodeId: string;
    label: string;
    edgeCount: number;
  }>;
}

export interface InsightGraphProvenance {
  generator: string;
  generatorVersion: string;
  deterministic: boolean;
  graphHash: string;
  generatedAt: string;
}

export interface InsightGraphData {
  nodes: InsightGraphNode[];
  edges: InsightGraphEdge[];
  stats: InsightGraphStats;
  provenance: InsightGraphProvenance;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseInsightGraphParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  nodeLimit?: number;
}

export interface UseInsightGraphResult {
  data: InsightGraphData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useInsightGraph(
  params: UseInsightGraphParams | null,
): UseInsightGraphResult {
  const [data, setData] = useState<InsightGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const paramKey = params
    ? `${params.entityCode}:${params.fiscalYear}:${params.periodNumber}:${params.nodeLimit ?? 50}`
    : "";

  const fetchData = useCallback(async () => {
    if (!params) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({
        entityCode: params.entityCode,
        fiscalYear: String(params.fiscalYear),
        periodNumber: String(params.periodNumber),
      });
      if (params.nodeLimit) qs.set("nodeLimit", String(params.nodeLimit));

      const result = await finGet<{ data: InsightGraphData }>(
        `/api/fin/atlas/insight-graph?${qs.toString()}`,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setData(result.data);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setError(err?.message ?? "Failed to load insight graph");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [paramKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh };
}
