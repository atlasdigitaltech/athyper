/**
 * Display Policy Resolver
 *
 * Server-side utility for resolving how to display FK references.
 * L1 cache: in-process Map, 10-minute TTL.
 * L2 cache: Redis, 24h TTL (fail-open, graceful degradation).
 *
 * Resolution order:
 *   1. meta.entity.feature_flags.ui.displayTemplate
 *   2. meta.entity.feature_flags.ui.displayFields
 *   3. Heuristic fallback: code, name, title, label, display_name, description
 *   4. Last resort: primary key
 */

import { sql, type Kysely } from "kysely";

import type { DisplayPolicy } from "@/lib/entity-projection";
import type { CacheMetrics } from "@/lib/redis-cache";

import {
  getNamespaceVersion,
  dpKey,
  cacheGet,
  cacheSet,
  acquireComputeLock,
  waitForLock,
  bumpNamespaceVersion,
  REDIS_TTL,
} from "@/lib/redis-cache";

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  policy: DisplayPolicy;
  expiresAt: number;
}

const CACHE_TTL_MS = 600_000; // 10 minutes
const displayPolicyCache = new Map<string, CacheEntry>();

// Heuristic display column candidates in priority order
const HEURISTIC_COLUMNS = [
  "code",
  "name",
  "title",
  "label",
  "display_name",
  "description",
];

// ============================================================================
// Resolver
// ============================================================================

/**
 * Resolves the display policy for a target table.
 * After resolution, the `resolvedColumns` and `primaryKey` are cached
 * so subsequent calls only need the data SELECT (no schema introspection).
 */
export async function resolveDisplayPolicy(
  db: Kysely<any>,
  schema: string,
  table: string,
  entityFeatureFlags?: Record<string, unknown> | null,
  metrics?: CacheMetrics,
): Promise<DisplayPolicy> {
  // ── L1 check ──
  const l1Key = `${schema}.${table}`;
  const cached = displayPolicyCache.get(l1Key);
  if (cached && cached.expiresAt > Date.now()) return cached.policy;

  // ── L2 check ──
  try {
    const ns = await getNamespaceVersion();
    const redisKey = dpKey(ns, schema, table);
    const l2 = await cacheGet<DisplayPolicy>(redisKey);
    if (l2) {
      displayPolicyCache.set(l1Key, {
        policy: l2,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      if (metrics) metrics.dp = "hit";
      return l2;
    }
    if (metrics) metrics.dp = "miss";

    // Lock-lite: prevent cross-worker stampede
    const lockKey = `ep:lock:dp:${schema}.${table}`;
    const acquired = await acquireComputeLock(lockKey, 5);
    if (!acquired) {
      await waitForLock("dp");
      const retry = await cacheGet<DisplayPolicy>(redisKey);
      if (retry) {
        displayPolicyCache.set(l1Key, {
          policy: retry,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return retry;
      }
    }
  } catch {
    if (metrics) metrics.redis_errors++;
  }

  // ── Compute from DB ──
  // Check entity-level UI config
  const ui = (entityFeatureFlags as any)?.ui as
    | Record<string, unknown>
    | undefined;
  const template = ui?.displayTemplate as string | undefined;
  const fields = ui?.displayFields as string[] | undefined;

  // Introspect actual columns on the target table
  const colResult = await sql<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = ${schema}
          AND table_name = ${table}
    `.execute(db);

  const availableCols = new Set(colResult.rows.map((r) => r.column_name));

  let resolvedColumns: string[];

  if (template) {
    // Extract column names from template tokens: {{column_name}}
    const tokens = extractTemplateTokens(template);
    resolvedColumns = tokens.filter((t) => availableCols.has(t));
  } else if (fields && fields.length > 0) {
    resolvedColumns = fields.filter((f) => availableCols.has(f));
  } else {
    // Heuristic: find the highest-priority display column that exists
    const heuristic = HEURISTIC_COLUMNS.filter((c) => availableCols.has(c));
    resolvedColumns = heuristic.length > 0 ? heuristic : [];
  }

  // Detect actual primary key column(s)
  const pkResult = await sql<{ column_name: string }>`
        SELECT a.attname AS column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema}
          AND c.relname = ${table}
          AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
    `.execute(db);

  const pkColumns = pkResult.rows.map((r) => r.column_name);
  // Use single-column PK if available, otherwise fall back to "id"
  const primaryKey = pkColumns.length === 1 ? pkColumns[0] : "id";
  const isCompositePk = pkColumns.length > 1;

  const policy: DisplayPolicy = {
    template: template && resolvedColumns.length > 0 ? template : undefined,
    fields:
      !template && fields
        ? fields.filter((f) => availableCols.has(f))
        : undefined,
    resolvedColumns,
    primaryKey,
    isCompositePk,
  };

  // ── Write L1 + L2 ──
  displayPolicyCache.set(l1Key, {
    policy,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  try {
    const ns = await getNamespaceVersion();
    const bytes = await cacheSet(
      dpKey(ns, schema, table),
      policy,
      REDIS_TTL.displayPolicy,
    );
    if (metrics)
      metrics.payload_bytes = Math.max(metrics.payload_bytes ?? 0, bytes);
  } catch {
    if (metrics) metrics.redis_errors++;
  }

  return policy;
}

// ============================================================================
// Template Rendering
// ============================================================================

/** Regex for safe template tokens: only alphanumeric + underscore */
const TOKEN_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

/**
 * Extract column names from template tokens.
 * Only allows safe identifiers: {{[a-zA-Z0-9_]+}}
 */
function extractTemplateTokens(template: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_REGEX.source, "g");
  while ((match = re.exec(template)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

/**
 * Render a display label from a template and row data.
 *
 * Safety:
 *   - Tokens must match {{[a-zA-Z0-9_]+}} only (no eval, no dynamic code)
 *   - After substitution, trims dangling separators (" - ", " / ", trailing whitespace)
 *     that result from null/empty column values
 */
export function renderDisplayLabel(
  template: string,
  row: Record<string, unknown>,
): string {
  let result = template.replace(TOKEN_REGEX, (_, token) => {
    const val = row[token];
    return val != null && val !== "" ? String(val) : "";
  });

  // Trim dangling separators from empty substitutions
  result = result
    .replace(/\s*[-/|]\s*$/g, "") // trailing separator
    .replace(/^\s*[-/|]\s*/g, "") // leading separator
    .replace(/\s*[-/|]\s*[-/|]\s*/g, " - ") // double separators
    .trim();

  return result;
}

/**
 * Build a display label for a row using a DisplayPolicy.
 *
 * Uses the first available strategy:
 *   1. Template rendering
 *   2. Fields join with " - "
 *   3. First resolved column
 *   4. Primary key fallback
 */
export function buildDisplayLabel(
  policy: DisplayPolicy,
  row: Record<string, unknown>,
): string {
  // Template
  if (policy.template && policy.resolvedColumns.length > 0) {
    const label = renderDisplayLabel(policy.template, row);
    if (label) return label;
  }

  // Fields join
  if (policy.fields && policy.fields.length > 0) {
    const parts = policy.fields
      .map((f) => row[f])
      .filter((v) => v != null && v !== "")
      .map(String);
    if (parts.length > 0) return parts.join(" - ");
  }

  // Resolved columns fallback
  if (policy.resolvedColumns.length > 0) {
    const parts = policy.resolvedColumns
      .map((c) => row[c])
      .filter((v) => v != null && v !== "")
      .map(String);
    if (parts.length > 0) return parts.join(" - ");
  }

  // Ultimate fallback: primary key
  const pk = row[policy.primaryKey];
  return pk != null ? String(pk) : "";
}

/**
 * Invalidate the display policy cache for a specific table or all tables.
 * Clears L1 in-process cache directly, and bumps namespace version for L2.
 */
export async function invalidateDisplayPolicyCache(
  schema?: string,
  table?: string,
): Promise<void> {
  if (schema && table) {
    displayPolicyCache.delete(`${schema}.${table}`);
  } else {
    displayPolicyCache.clear();
  }
  await bumpNamespaceVersion();
}
