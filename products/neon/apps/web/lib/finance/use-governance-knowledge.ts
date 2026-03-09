"use client";

// lib/finance/use-governance-knowledge.ts
//
// Hooks for Phase 20: Governance Knowledge Graph & Control Memory.
// Graph edges, control memory, proposal provenance, governance pathways.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { finGet } from "./fetcher";

// ---------------------------------------------------------------------------
// Graph DTOs
// ---------------------------------------------------------------------------

export interface GraphEdgeDTO {
  sourceKind: string;
  sourceId: string;
  sourceLabel: string | null;
  targetKind: string;
  targetId: string | null;
  edgeType: string;
  edgeState: string | null;
  edgeWeight: string | null;
  edgeCreatedAt: string;
  fiscalYear: number | null;
  periodNumber: number | null;
}

export interface GraphNodeDTO {
  kind: string;
  id: string;
  label: string;
  edgeCount: number;
}

export interface GraphDataDTO {
  edges: GraphEdgeDTO[];
  nodes: GraphNodeDTO[];
  totalEdges: number;
  totalNodes: number;
}

// ---------------------------------------------------------------------------
// Memory DTOs
// ---------------------------------------------------------------------------

export interface ControlMemoryDTO {
  objectKind: string;
  objectKey: string;
  objectSubtype: string;
  objectLabel: string;
  occurrenceCount: number;
  programsCreated: number;
  programsCompleted: number;
  everResolved: boolean;
  memoryData: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Provenance DTOs
// ---------------------------------------------------------------------------

export interface ProposalProvenanceDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  proposalSource: string;
  suggestedProgramType: string;
  suggestedPriority: string;
  suggestedTitle: string;
  rationale: string;
  fingerprint: string;
  gapKey: string;
  evidenceData: Record<string, any>;
  gapOccurrenceCount: number;
  gapProgramsEverCreated: number;
  gapProgramsEverCompleted: number;
  gapEverResolved: boolean;
  gapMemory: Record<string, any> | null;
  similarProgramCount: number;
  similarCompleted: number;
  similarCancelled: number;
  similarHealthy: number;
  similarAvgDays: number | null;
  similarAvgMilestonePct: string | null;
  similarSuccessRate: string | null;
  timesPreviouslyProposed: number;
  timesPreviouslyAccepted: number;
  timesPreviouslyDismissed: number;
  lastDismissReason: string | null;
  confidenceLevel: string;
}

// ---------------------------------------------------------------------------
// Pathway DTOs
// ---------------------------------------------------------------------------

export interface GovernancePathwayDTO {
  issueSource: string;
  issueType: string;
  issueKey: string;
  issueLabel: string;
  issueSeverityCount: number;
  recommendationType: string | null;
  policyArea: string | null;
  recommendationTitle: string | null;
  recommendationPriority: string | null;
  programId: string | null;
  programCode: string | null;
  programTitle: string | null;
  programType: string | null;
  programStatus: string | null;
  programPriority: string | null;
  programHealth: string | null;
  milestoneCompletionPct: string | null;
  elapsedDays: number | null;
  outcomeMetric: string | null;
  baselineValue: string | null;
  baselineTrafficLight: string | null;
  currentValue: string | null;
  currentTrafficLight: string | null;
  outcomeDirection: string | null;
  pathwayStage: string;
  pathwaySuccessful: boolean;
}

export interface PathwayStatsDTO {
  total: number;
  stageDistribution: Record<string, number>;
  successRate: string;
}

export interface PathwayDataDTO {
  pathways: GovernancePathwayDTO[];
  stats: PathwayStatsDTO;
}

// ---------------------------------------------------------------------------
// Summary DTOs
// ---------------------------------------------------------------------------

export interface GraphSummaryEdgeTypeDTO {
  sourceKind: string;
  targetKind: string;
  edgeType: string;
  count: number;
}

export interface MemoryObjectSummaryDTO {
  objectKind: string;
  count: number;
  totalOccurrences: number;
  resolvedCount: number;
  withPrograms: number;
}

export interface PathwayStageSummaryDTO {
  stage: string;
  count: number;
  successful: number;
}

export interface KnowledgeSummaryDTO {
  graph: {
    totalEdges: number;
    uniqueEdgeTypes: number;
    uniqueNodeKinds: number;
    topEdgeTypes: GraphSummaryEdgeTypeDTO[];
  };
  memory: {
    objects: MemoryObjectSummaryDTO[];
  };
  pathways: {
    stages: PathwayStageSummaryDTO[];
  };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface KnowledgeGraphFilters {
  entityCode: string;
}

// ---------------------------------------------------------------------------
// useGovernanceGraph — graph edges + nodes
// ---------------------------------------------------------------------------

export interface UseGovernanceGraphResult {
  graph: GraphDataDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGovernanceGraph(
  filters: KnowledgeGraphFilters | null,
  options?: { sourceKind?: string; targetKind?: string },
): UseGovernanceGraphResult {
  const [graph, setGraph] = useState<GraphDataDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode, view: "graph" });
    if (options?.sourceKind) qs.set("sourceKind", options.sourceKind);
    if (options?.targetKind) qs.set("targetKind", options.targetKind);
    return `/api/fin/assurance/knowledge-graph?${qs}`;
  }, [filters?.entityCode, options?.sourceKind, options?.targetKind]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: GraphDataDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setGraph(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load graph");
        setGraph(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { graph, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useControlMemory — historical context cards
// ---------------------------------------------------------------------------

export interface UseControlMemoryResult {
  memory: ControlMemoryDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useControlMemory(
  filters: KnowledgeGraphFilters | null,
  objectKind?: string,
): UseControlMemoryResult {
  const [memory, setMemory] = useState<ControlMemoryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode, view: "memory" });
    if (objectKind) qs.set("objectKind", objectKind);
    return `/api/fin/assurance/knowledge-graph?${qs}`;
  }, [filters?.entityCode, objectKind]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ControlMemoryDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setMemory(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load memory");
        setMemory([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { memory, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useProposalProvenance — enriched proposals with context
// ---------------------------------------------------------------------------

export interface UseProposalProvenanceResult {
  provenance: ProposalProvenanceDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProposalProvenance(
  filters: KnowledgeGraphFilters | null,
): UseProposalProvenanceResult {
  const [provenance, setProvenance] = useState<ProposalProvenanceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    return `/api/fin/assurance/knowledge-graph?entityCode=${filters.entityCode}&view=provenance`;
  }, [filters?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ProposalProvenanceDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setProvenance(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load provenance");
        setProvenance([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { provenance, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useGovernancePathways — issue→recommendation→program→outcome
// ---------------------------------------------------------------------------

export interface UseGovernancePathwaysResult {
  data: PathwayDataDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGovernancePathways(
  filters: KnowledgeGraphFilters | null,
  stage?: string,
): UseGovernancePathwaysResult {
  const [data, setData] = useState<PathwayDataDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode, view: "pathways" });
    if (stage) qs.set("stage", stage);
    return `/api/fin/assurance/knowledge-graph?${qs}`;
  }, [filters?.entityCode, stage]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: PathwayDataDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setData(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load pathways");
        setData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { data, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useKnowledgeSummary — combined summary
// ---------------------------------------------------------------------------

export interface UseKnowledgeSummaryResult {
  summary: KnowledgeSummaryDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKnowledgeSummary(
  filters: KnowledgeGraphFilters | null,
): UseKnowledgeSummaryResult {
  const [summary, setSummary] = useState<KnowledgeSummaryDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    return `/api/fin/assurance/knowledge-graph?entityCode=${filters.entityCode}&view=summary`;
  }, [filters?.entityCode]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: KnowledgeSummaryDTO }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setSummary(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load summary");
        setSummary(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { summary, loading, error, refresh };
}
