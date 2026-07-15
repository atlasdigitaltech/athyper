"use client";

/**
 * useReasonCodeCatalog — client-side cache of the finance.postability_reason
 * lookup domain.
 *
 * Every UI consumer (chips, inbox, workspace cards) resolves reason codes
 * via this hook — no hardcoded strings.
 *
 * Data source: control.lookup_value(domain_code='finance.postability_reason').
 * Loaded once per session; server-side change requires a refresh.
 */

import { useQuery } from "@tanstack/react-query";
import type {
  ReasonCodeEntry,
  ConflictSeverity,
  PostabilityChip,
} from "../lib/finance-setup.types";

interface RawEntry {
  code:        string;
  name:        string;
  description: string;
  sort_order:  number;
  metadata: {
    severity:   ConflictSeverity;
    chip_hint:  PostabilityChip;
    scope_kind: "period" | "account" | "both";
  };
}

async function fetchReasonCatalog(): Promise<ReasonCodeEntry[]> {
  const res = await fetch(
    `/api/relay/api/lookup/values?domain_code=finance.postability_reason`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Reason catalog fetch failed: ${res.status}`);
  const raw = await res.json() as RawEntry[];
  return raw.map((r) => ({
    code:        r.code,
    name:        r.name,
    description: r.description,
    severity:    r.metadata.severity,
    chipHint:    r.metadata.chip_hint,
    scopeKind:   r.metadata.scope_kind,
    sortOrder:   r.sort_order,
  }));
}

export function useReasonCodeCatalog() {
  return useQuery({
    queryKey: ["finance", "setup", "reason-catalog"],
    queryFn:  fetchReasonCatalog,
    staleTime: 60 * 60 * 1000,   // 1 hour
    gcTime:    24 * 60 * 60 * 1000,
  });
}

/**
 * Resolve a reason code to its display entry. Falls back to a synthetic
 * entry with the raw code when the catalog hasn't loaded or the code is unknown.
 */
export function resolveReasonEntry(
  code: string,
  catalog: ReasonCodeEntry[] | undefined,
): ReasonCodeEntry {
  const hit = catalog?.find((c) => c.code === code);
  if (hit) return hit;
  return {
    code,
    name:        code,
    description: code,
    severity:    "info",
    chipHint:    "postable",
    scopeKind:   "both",
    sortOrder:   999,
  };
}
