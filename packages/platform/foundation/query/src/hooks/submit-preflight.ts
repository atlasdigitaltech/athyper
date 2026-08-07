"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimePath } from "@athyper/platform-api-client";
import { queryKeys } from "../query-keys";

export interface SubmitPreflightIssue {
  code:     string;
  message:  string;
  section?: string;
  details?: Record<string, unknown>;
}

export interface SubmitPreflightResult {
  ok:       boolean;
  blockers: SubmitPreflightIssue[];
  warnings: SubmitPreflightIssue[];
}

const EMPTY_RESULT: SubmitPreflightResult = { ok: true, blockers: [], warnings: [] };

function isPreflightShape(value: unknown): value is SubmitPreflightResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["ok"] === "boolean"
    && Array.isArray(v["blockers"])
    && Array.isArray(v["warnings"]);
}

async function fetchPreflight(
  entityCode: string,
  recordId:   string,
): Promise<SubmitPreflightResult> {
  const res = await fetch(runtimePath.submitPreflight(entityCode, recordId));
  if (!res.ok) return EMPTY_RESULT;
  const json = await res.json() as unknown;
  return isPreflightShape(json) ? json : EMPTY_RESULT;
}

/**
 * Pre-submit blocker/warning list for a record.
 * Falls back to EMPTY_RESULT on any server error — preflight is advisory.
 * The actual submit handler runs the same checks authoritatively.
 * Callers should refetch() immediately after saving to surface fresh state.
 */
export function useSubmitPreflight(
  entityCode: string,
  recordId:   string | null,
  opts?:      { enabled?: boolean },
) {
  return useQuery({
    queryKey:  queryKeys.submitPreflight.byRecord(entityCode, recordId ?? ""),
    queryFn:   () => fetchPreflight(entityCode, recordId!),
    enabled:   Boolean(recordId) && (opts?.enabled ?? true),
    staleTime: 30 * 1000,
  });
}
