"use client";

/**
 * @athyper/runtime-canvas — useDocumentRules
 *
 * Cleanup Plan v5 §4.7 + §5.7 + amendment 9.
 *
 * Fetches the field + action rules projection for an entity. Consumed
 * by `useDocumentAffordance` (action capability resolver) and by field-
 * level renderers (e.g. inline edit gates).
 *
 * Open decision O1 resolved to "single endpoint" — fewer round-trips
 * on cold page mount; rules change rarely so caching is easy.
 */

import { useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import { markDocumentEditPerformanceOnce } from "./document-edit-performance-marks";

// ─── Public types ────────────────────────────────────────────────────

export interface FieldRule {
  /** Status codes in which this field is editable. */
  editable_in_status: ReadonlyArray<string>;
}

export interface ActionRule {
  capability:          "allowed" | "denied" | "requires_permission";
  required_permission: string | null;
  reason:              string | null;
}

/**
 * Projection shape returned by /api/runtime/v1/entities/<entity>/rules.
 *
 * - field_rules[fieldName] — undefined means "no editable_in_status
 *   declared" (typically read-only)
 * - action_rules[actionCode][status] — undefined means
 *   "denied by default" per amendment 9
 */
export interface DocumentRuleSet {
  entity:       string;
  field_rules:  Readonly<Record<string, FieldRule>>;
  action_rules: Readonly<Record<string, Readonly<Record<string, ActionRule>>>>;
  version?: string;
}

export interface UseDocumentRulesOptions {
  /** Entity code (e.g. "purchase_invoice"). */
  entityCode: string;
  enabled?:   boolean;
  /** Per-query stale time. Default 5 minutes. */
  staleTimeMs?: number;
  identity?: DocumentRulesSecurityIdentity;
  rulesVersion?: string;
}

export interface DocumentRulesSecurityIdentity {
  tenantId: string;
  planeKey?: string;
  realmKey?: string;
  effectivePrincipal: string;
  permissionStamp: string;
}

export function buildDocumentRulesQueryKey(
  entityCode: string,
  identity: DocumentRulesSecurityIdentity | undefined,
  version: string,
) {
  return [
    "doc-rules",
    identity?.tenantId ?? "anonymous",
    identity?.planeKey ?? "",
    identity?.realmKey ?? "",
    identity?.effectivePrincipal ?? "",
    identity?.permissionStamp ?? "",
    entityCode,
    version,
  ] as const;
}

export interface DocumentRulesResult {
  rules:     DocumentRuleSet | null;
  isLoading: boolean;
  isError:   boolean;
  error:     Error | null;
  onRefresh: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDocumentRules(opts: UseDocumentRulesOptions): DocumentRulesResult {
  const { entityCode, enabled = true, staleTimeMs = 5 * 60_000, identity, rulesVersion = "unversioned" } = opts;

  const query: UseQueryResult<DocumentRuleSet, Error> = useQuery({
    queryKey: buildDocumentRulesQueryKey(entityCode, identity, rulesVersion),
    queryFn:  async () => {
      const res = await fetch(
        runtimePath.rules(entityCode),
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `Rules fetch failed (${res.status})`);
      }
      const body = await res.json() as {
        entity:       string;
        field_rules?: Record<string, FieldRule>;
        action_rules?: Record<string, Record<string, ActionRule>>;
        version?: unknown;
      };
      return {
        entity:       body.entity,
        field_rules:  body.field_rules ?? {},
        action_rules: body.action_rules ?? {},
        version: typeof body.version === "string"
          ? body.version
          : rulesVersion,
      };
    },
    enabled:   enabled && Boolean(entityCode),
    staleTime: staleTimeMs,
  });

  useEffect(() => {
    if (query.isSuccess && query.data) {
      markDocumentEditPerformanceOnce("rules-ready");
    }
  }, [query.data, query.isSuccess]);

  return {
    rules:     query.data ?? null,
    isLoading: query.isLoading,
    isError:   query.isError,
    error:     query.error ?? null,
    onRefresh: async () => { await query.refetch(); },
  };
}
