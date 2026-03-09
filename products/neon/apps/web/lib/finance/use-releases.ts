"use client";

// lib/finance/use-releases.ts
//
// Data-fetching hooks for Release Orchestration (207-208).

import { useState, useEffect, useCallback, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";

import type {
  ReleaseDashboardDTO,
  PackReleaseDTO,
  ReleaseDecisionLogDTO,
  ReleaseNotificationEventDTO,
  ReleaseSLASnapshotDTO,
  CloseOverrideDTO,
  PublicationManifestItemDTO,
  PackAuditChainDTO,
  ReleaseTimelineEventDTO,
  PreflightSummary,
  ReleaseKPIs,
  ReleaseAuditPackage,
  ReleaseExportLogDTO,
} from "./release-types";

// ---------------------------------------------------------------------------
// useReleaseDashboard — list releases from vw_pack_release_dashboard
// ---------------------------------------------------------------------------

export interface ReleaseDashboardFilters {
  entityCode?: string;
  fiscalYear?: number;
  status?: string;
}

export interface UseReleaseDashboardResult {
  releases: ReleaseDashboardDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseDashboard(
  filters: ReleaseDashboardFilters = {},
): UseReleaseDashboardResult {
  const [releases, setReleases] = useState<ReleaseDashboardDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const filterKey = JSON.stringify(filters);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.entityCode) params.set("entityCode", filters.entityCode);
      if (filters.fiscalYear) params.set("fiscalYear", String(filters.fiscalYear));
      if (filters.status) params.set("status", filters.status);

      const qs = params.toString();
      const data = await finGet<{ releases: ReleaseDashboardDTO[] }>(
        `/api/fin/releases${qs ? `?${qs}` : ""}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setReleases(data.releases);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load releases";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { releases, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseDetail — single release with joined component status
// ---------------------------------------------------------------------------

export interface UseReleaseDetailResult {
  release: (PackReleaseDTO & {
    packStatus: string | null;
    batchStatus: string | null;
    batchCode: string | null;
    manifestItemCount: number | null;
    manifestHash: string | null;
    certificationStatus: string | null;
    certifiedAt: string | null;
    certifiedBy: string | null;
  }) | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseDetail(
  releaseId: string | null,
): UseReleaseDetailResult {
  const [release, setRelease] = useState<UseReleaseDetailResult["release"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ release: UseReleaseDetailResult["release"] }>(
        `/api/fin/releases?releaseId=${releaseId}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setRelease(data.release);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load release";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, refreshCounter.current]);

  const refresh = useCallback(() => {
    refreshCounter.current += 1;
    fetchData();
  }, [fetchData]);

  return { release, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseDecisions — decision log for a release
// ---------------------------------------------------------------------------

export interface UseReleaseDecisionsResult {
  decisions: ReleaseDecisionLogDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseDecisions(
  releaseId: string | null,
): UseReleaseDecisionsResult {
  const [decisions, setDecisions] = useState<ReleaseDecisionLogDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ decisions: ReleaseDecisionLogDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=decisions`,
        controller.signal,
      );
      if (!controller.signal.aborted) setDecisions(data.decisions);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load decision log";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { decisions, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseNotifications — notification events for a release
// ---------------------------------------------------------------------------

export interface UseReleaseNotificationsResult {
  notifications: ReleaseNotificationEventDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseNotifications(
  releaseId: string | null,
): UseReleaseNotificationsResult {
  const [notifications, setNotifications] = useState<ReleaseNotificationEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ notifications: ReleaseNotificationEventDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=notifications`,
        controller.signal,
      );
      if (!controller.signal.aborted) setNotifications(data.notifications);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load notifications";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { notifications, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseSLA — SLA snapshot for a release
// ---------------------------------------------------------------------------

export interface UseReleaseSLAResult {
  sla: ReleaseSLASnapshotDTO | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseSLA(
  releaseId: string | null,
): UseReleaseSLAResult {
  const [sla, setSla] = useState<ReleaseSLASnapshotDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ sla: ReleaseSLASnapshotDTO | null }>(
        `/api/fin/releases?releaseId=${releaseId}&view=sla`,
        controller.signal,
      );
      if (!controller.signal.aborted) setSla(data.sla);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load SLA data";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { sla, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseOverrides — close overrides linked to a release's close run
// ---------------------------------------------------------------------------

export interface UseReleaseOverridesResult {
  overrides: CloseOverrideDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseOverrides(
  releaseId: string | null,
): UseReleaseOverridesResult {
  const [overrides, setOverrides] = useState<CloseOverrideDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ overrides: CloseOverrideDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=overrides`,
        controller.signal,
      );
      if (!controller.signal.aborted) setOverrides(data.overrides);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load overrides";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { overrides, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseManifest — publication manifest items for a release
// ---------------------------------------------------------------------------

export interface UseReleaseManifestResult {
  manifestItems: PublicationManifestItemDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseManifest(
  releaseId: string | null,
): UseReleaseManifestResult {
  const [manifestItems, setManifestItems] = useState<PublicationManifestItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ manifestItems: PublicationManifestItemDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=manifest`,
        controller.signal,
      );
      if (!controller.signal.aborted) setManifestItems(data.manifestItems);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load manifest";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { manifestItems, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseAuditChain — audit chain for a release's period scope
// ---------------------------------------------------------------------------

export interface UseReleaseAuditChainResult {
  auditChain: PackAuditChainDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseAuditChain(
  releaseId: string | null,
): UseReleaseAuditChainResult {
  const [auditChain, setAuditChain] = useState<PackAuditChainDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ auditChain: PackAuditChainDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=audit-chain`,
        controller.signal,
      );
      if (!controller.signal.aborted) setAuditChain(data.auditChain);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load audit chain";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { auditChain, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseTimeline — unified chronological event stream
// ---------------------------------------------------------------------------

export interface TimelineFilters {
  source?: string;
  severity?: string;
  q?: string;
  after?: string;
  before?: string;
  limit?: number;
}

export interface UseReleaseTimelineResult {
  timeline: ReleaseTimelineEventDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseTimeline(
  releaseId: string | null,
  filters: TimelineFilters = {},
): UseReleaseTimelineResult {
  const [timeline, setTimeline] = useState<ReleaseTimelineEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filterKey = JSON.stringify(filters);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        releaseId,
        view: "timeline",
      });
      if (filters.source) params.set("source", filters.source);
      if (filters.severity) params.set("severity", filters.severity);
      if (filters.q) params.set("q", filters.q);
      if (filters.after) params.set("after", filters.after);
      if (filters.before) params.set("before", filters.before);
      if (filters.limit) params.set("limit", String(filters.limit));

      const data = await finGet<{ timeline: ReleaseTimelineEventDTO[] }>(
        `/api/fin/releases?${params.toString()}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setTimeline(data.timeline);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load timeline";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId, filterKey]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { timeline, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleasePreflight — impact summary before destructive actions
// ---------------------------------------------------------------------------

export interface UseReleasePreflightResult {
  preflight: PreflightSummary | null;
  loading: boolean;
  error: string | null;
  fetch: (releaseId: string, action?: string) => Promise<PreflightSummary | null>;
}

export function useReleasePreflight(): UseReleasePreflightResult {
  const [preflight, setPreflight] = useState<PreflightSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (releaseId: string, action = "release"): Promise<PreflightSummary | null> => {
    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ preflight: PreflightSummary }>(
        `/api/fin/releases?releaseId=${releaseId}&view=preflight&action=${action}`,
      );
      setPreflight(data.preflight);
      return data.preflight;
    } catch (err) {
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load preflight";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { preflight, loading, error, fetch };
}

// ---------------------------------------------------------------------------
// useReleaseDetailWithPanels — coordinated refresh for detail + all panels
// ---------------------------------------------------------------------------
// After a command executes, call refreshAll() to sync all panels at once.
// This prevents stale mixed-state screens.

export interface UseReleaseDetailWithPanelsResult {
  detail: UseReleaseDetailResult;
  decisions: UseReleaseDecisionsResult;
  notifications: UseReleaseNotificationsResult;
  overrides: UseReleaseOverridesResult;
  timeline: UseReleaseTimelineResult;
  sla: UseReleaseSLAResult;
  manifest: UseReleaseManifestResult;
  refreshAll: () => void;
}

export function useReleaseDetailWithPanels(
  releaseId: string | null,
): UseReleaseDetailWithPanelsResult {
  const detail = useReleaseDetail(releaseId);
  const decisions = useReleaseDecisions(releaseId);
  const notifications = useReleaseNotifications(releaseId);
  const overrides = useReleaseOverrides(releaseId);
  const timeline = useReleaseTimeline(releaseId);
  const sla = useReleaseSLA(releaseId);
  const manifest = useReleaseManifest(releaseId);

  const refreshAll = useCallback(() => {
    detail.refresh();
    decisions.refresh();
    notifications.refresh();
    overrides.refresh();
    timeline.refresh();
    sla.refresh();
    manifest.refresh();
  }, [detail, decisions, notifications, overrides, timeline, sla, manifest]);

  return { detail, decisions, notifications, overrides, timeline, sla, manifest, refreshAll };
}

// ---------------------------------------------------------------------------
// useReleaseKPIs — dashboard-level aggregate metrics
// ---------------------------------------------------------------------------

export interface UseReleaseKPIsResult {
  kpis: ReleaseKPIs | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseKPIs(
  filters: ReleaseDashboardFilters = {},
): UseReleaseKPIsResult {
  const [kpis, setKpis] = useState<ReleaseKPIs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filterKey = JSON.stringify(filters);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ view: "kpis" });
      if (filters.entityCode) params.set("entityCode", filters.entityCode);
      if (filters.fiscalYear) params.set("fiscalYear", String(filters.fiscalYear));

      const data = await finGet<{ kpis: ReleaseKPIs }>(
        `/api/fin/releases?${params.toString()}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setKpis(data.kpis);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load KPIs";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { kpis, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useReleaseAuditPackage — on-demand fetch of bundled audit data
// ---------------------------------------------------------------------------

export interface UseReleaseAuditPackageResult {
  auditPackage: ReleaseAuditPackage | null;
  loading: boolean;
  error: string | null;
  fetch: (releaseId: string) => Promise<ReleaseAuditPackage | null>;
}

export function useReleaseAuditPackage(): UseReleaseAuditPackageResult {
  const [auditPackage, setAuditPackage] = useState<ReleaseAuditPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPkg = useCallback(async (releaseId: string): Promise<ReleaseAuditPackage | null> => {
    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ auditPackage: ReleaseAuditPackage }>(
        `/api/fin/releases?releaseId=${releaseId}&view=audit-package`,
      );
      setAuditPackage(data.auditPackage);
      return data.auditPackage;
    } catch (err) {
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load audit package";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { auditPackage, loading, error, fetch: fetchPkg };
}

// ---------------------------------------------------------------------------
// useReleaseExportHistory — governed audit export log for a release
// ---------------------------------------------------------------------------

export interface UseReleaseExportHistoryResult {
  exports: ReleaseExportLogDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReleaseExportHistory(
  releaseId: string | null,
): UseReleaseExportHistoryResult {
  const [exports, setExports] = useState<ReleaseExportLogDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!releaseId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await finGet<{ exports: ReleaseExportLogDTO[] }>(
        `/api/fin/releases?releaseId=${releaseId}&view=export-history`,
        controller.signal,
      );
      if (!controller.signal.aborted) setExports(data.exports);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (controller.signal.aborted) return;
      const message =
        err instanceof FinanceHttpError ? err.message
        : err instanceof Error ? err.message
        : "Failed to load export history";
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  const refresh = useCallback(() => { fetchData(); }, [fetchData]);

  return { exports, loading, error, refresh };
}
