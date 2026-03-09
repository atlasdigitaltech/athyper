"use client";

// lib/finance/use-cfo-actions.ts
//
// Hooks for Phase 12: CFO Action Workspace & Commentary Loop.
// Commentary, action items, decisions, carry-forward.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { FinanceHttpError } from "./errors";
import { finGet, finPost, finPatch } from "./fetcher";

// ---------------------------------------------------------------------------
// Commentary DTOs
// ---------------------------------------------------------------------------

export interface CommentaryDTO {
  id: string;
  target_kind: string;
  target_id: string;
  pack_instance_item_id: string | null;
  statement_line_code: string | null;
  commentary_type: string;
  title: string | null;
  body: string;
  version: number;
  is_current: boolean;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseCommentaryResult {
  items: CommentaryDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  save: (input: CommentarySaveInput) => Promise<void>;
  saving: boolean;
}

export interface CommentarySaveInput {
  commentaryType?: string;
  title?: string;
  body: string;
  packInstanceItemId?: string;
  statementLineCode?: string;
}

// ---------------------------------------------------------------------------
// Action Item DTOs
// ---------------------------------------------------------------------------

export interface ActionItemDTO {
  id: string;
  entity_code: string;
  target_kind: string;
  target_id: string | null;
  title: string;
  detail: string | null;
  severity: "critical" | "high" | "medium" | "low" | "info";
  priority: number | null;
  category: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  assigned_at: string | null;
  due_at: string | null;
  status: "open" | "acknowledged" | "in_progress" | "resolved" | "dismissed";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  source: string;
  source_ref: string | null;
  fiscal_year: number | null;
  period_number: number | null;
  structured_data: Record<string, unknown> | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItemFilters {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
  status?: string;
  severity?: string;
  targetKind?: string;
  includeResolved?: boolean;
}

export interface UseActionItemsResult {
  items: ActionItemDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface ActionItemCreateInput {
  entityCode: string;
  targetKind: string;
  targetId?: string;
  title: string;
  detail?: string;
  severity?: string;
  priority?: number;
  category?: string;
  assignedTo?: string;
  assignedRole?: string;
  dueAt?: string;
  fiscalYear?: number;
  periodNumber?: number;
  source?: string;
  sourceRef?: string;
  structuredData?: Record<string, unknown>;
}

export interface UseActionItemMutationsResult {
  create: (input: ActionItemCreateInput) => Promise<string>;
  updateStatus: (id: string, action: string, resolutionNote?: string) => Promise<void>;
  assign: (id: string, assignedTo?: string, assignedRole?: string) => Promise<void>;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Decision DTOs
// ---------------------------------------------------------------------------

export interface DecisionDTO {
  id: string;
  entity_code: string;
  target_kind: string;
  target_id: string | null;
  decision_type: string;
  title: string;
  rationale: string | null;
  context_snapshot: Record<string, unknown> | null;
  related_item_id: string | null;
  related_item_title: string | null;
  related_item_status: string | null;
  fiscal_year: number | null;
  period_number: number | null;
  decided_by: string;
  decided_by_name: string | null;
  decided_at: string;
}

export interface DecisionFilters {
  entityCode: string;
  fiscalYear?: number;
  periodNumber?: number;
  targetKind?: string;
  targetId?: string;
  decisionType?: string;
}

export interface UseDecisionLogResult {
  decisions: DecisionDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface DecisionCreateInput {
  entityCode: string;
  targetKind: string;
  targetId?: string;
  decisionType: string;
  title: string;
  rationale?: string;
  contextSnapshot?: Record<string, unknown>;
  relatedItemId?: string;
  fiscalYear?: number;
  periodNumber?: number;
}

export interface UseRecordDecisionResult {
  record: (input: DecisionCreateInput) => Promise<string>;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Carry-Forward DTOs
// ---------------------------------------------------------------------------

export interface FollowupLinkDTO {
  id: string;
  source_kind: string;
  source_id: string;
  source_period: number;
  source_fy: number;
  target_period: number;
  target_fy: number;
  reason: string;
  carry_note: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_ref: string | null;
  created_by_name: string | null;
  created_at: string;
  source_title: string | null;
  source_severity: string | null;
  source_status: string | null;
  source_detail?: string | null;
}

export interface CarryForwardFilters {
  entityCode: string;
  targetFy: number;
  targetPeriod: number;
}

export interface UseCarryForwardResult {
  items: FollowupLinkDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  resolve: (id: string) => Promise<void>;
  resolving: boolean;
}

// ---------------------------------------------------------------------------
// useCommentary
// ---------------------------------------------------------------------------

export function useCommentary(
  targetKind: string | null,
  targetId: string | null,
): UseCommentaryResult {
  const [items, setItems] = useState<CommentaryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!targetKind || !targetId) return null;
    const qs = new URLSearchParams({ targetKind, targetId });
    return `/api/fin/commentary?${qs}`;
  }, [targetKind, targetId]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: CommentaryDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setItems(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load commentary");
        setItems([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  const save = useCallback(
    async (input: CommentarySaveInput) => {
      if (!targetKind || !targetId) return;
      setSaving(true);
      try {
        await finPost("/api/fin/commentary", {
          targetKind,
          targetId,
          commentaryType: input.commentaryType ?? "NARRATIVE",
          title: input.title,
          body: input.body,
          packInstanceItemId: input.packInstanceItemId,
          statementLineCode: input.statementLineCode,
        });
        refresh();
      } finally {
        setSaving(false);
      }
    },
    [targetKind, targetId, refresh],
  );

  return { items, loading, error, refresh, save, saving };
}

// ---------------------------------------------------------------------------
// useActionItems
// ---------------------------------------------------------------------------

export function useActionItems(
  filters: ActionItemFilters | null,
): UseActionItemsResult {
  const [items, setItems] = useState<ActionItemDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    if (filters.status) qs.set("status", filters.status);
    if (filters.severity) qs.set("severity", filters.severity);
    if (filters.targetKind) qs.set("targetKind", filters.targetKind);
    if (filters.includeResolved) qs.set("includeResolved", "true");
    return `/api/fin/action-items?${qs}`;
  }, [
    filters?.entityCode,
    filters?.fiscalYear,
    filters?.periodNumber,
    filters?.status,
    filters?.severity,
    filters?.targetKind,
    filters?.includeResolved,
  ]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: ActionItemDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setItems(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load action items");
        setItems([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { items, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useActionItemMutations
// ---------------------------------------------------------------------------

export function useActionItemMutations(
  onSuccess?: () => void,
): UseActionItemMutationsResult {
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (input: ActionItemCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string } }>("/api/fin/action-items", input);
        onSuccess?.();
        return res.data.id;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const updateStatus = useCallback(
    async (id: string, action: string, resolutionNote?: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/action-items/${id}`, { action, resolutionNote });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  const assign = useCallback(
    async (id: string, assignedTo?: string, assignedRole?: string) => {
      setLoading(true);
      try {
        await finPatch(`/api/fin/action-items/${id}`, { action: "assign", assignedTo, assignedRole });
        onSuccess?.();
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { create, updateStatus, assign, loading };
}

// ---------------------------------------------------------------------------
// useDecisionLog
// ---------------------------------------------------------------------------

export function useDecisionLog(
  filters: DecisionFilters | null,
): UseDecisionLogResult {
  const [decisions, setDecisions] = useState<DecisionDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({ entityCode: filters.entityCode });
    if (filters.fiscalYear) qs.set("fiscalYear", String(filters.fiscalYear));
    if (filters.periodNumber) qs.set("periodNumber", String(filters.periodNumber));
    if (filters.targetKind) qs.set("targetKind", filters.targetKind);
    if (filters.targetId) qs.set("targetId", filters.targetId);
    if (filters.decisionType) qs.set("decisionType", filters.decisionType);
    return `/api/fin/decisions?${qs}`;
  }, [
    filters?.entityCode,
    filters?.fiscalYear,
    filters?.periodNumber,
    filters?.targetKind,
    filters?.targetId,
    filters?.decisionType,
  ]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: DecisionDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setDecisions(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load decisions");
        setDecisions([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  return { decisions, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// useRecordDecision
// ---------------------------------------------------------------------------

export function useRecordDecision(
  onSuccess?: () => void,
): UseRecordDecisionResult {
  const [loading, setLoading] = useState(false);

  const record = useCallback(
    async (input: DecisionCreateInput): Promise<string> => {
      setLoading(true);
      try {
        const res = await finPost<{ data: { id: string } }>("/api/fin/decisions", input);
        onSuccess?.();
        return res.data.id;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { record, loading };
}

// ---------------------------------------------------------------------------
// useCarryForward
// ---------------------------------------------------------------------------

export function useCarryForward(
  filters: CarryForwardFilters | null,
): UseCarryForwardResult {
  const [items, setItems] = useState<FollowupLinkDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const url = useMemo(() => {
    if (!filters) return null;
    const qs = new URLSearchParams({
      entityCode: filters.entityCode,
      targetFy: String(filters.targetFy),
      targetPeriod: String(filters.targetPeriod),
    });
    return `/api/fin/carryforward?${qs}`;
  }, [filters?.entityCode, filters?.targetFy, filters?.targetPeriod]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!url) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    finGet<{ data: FollowupLinkDTO[] }>(url, controller.signal)
      .then((res) => { if (!controller.signal.aborted) setItems(res.data); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load carry-forward items");
        setItems([]);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [url, refreshKey]);

  const resolve = useCallback(
    async (id: string) => {
      setResolving(true);
      try {
        await finPatch(`/api/fin/carryforward/${id}`, {});
        refresh();
      } finally {
        setResolving(false);
      }
    },
    [refresh],
  );

  return { items, loading, error, refresh, resolve, resolving };
}
