/**
 * Lifecycle State Flags — metadata-driven replacement for hardcoded
 * `status IN (...)` lists.
 *
 * Consumers ask: "Which states in lifecycle X carry flag Y?" and use the
 * returned set to build parameterised WHERE clauses or in-memory checks.
 *
 * Behavioural flags currently defined (see control.lifecycle_state.state_flags
 * column comment for the canonical list):
 *
 *   is_transactable_source — commitment / invoice state accepts downstream
 *                            document creation from it
 *   is_payable_source      — invoice state qualifies for open-payable lists
 *                            + payment allocation
 *   is_mutable             — non-status field edits permitted (advisory)
 *
 * Adding a new flag requires:
 *   1. Extend the column comment in DDL.
 *   2. Seed the flag on the appropriate lifecycle_state rows.
 *   3. Update the KnownStateFlag union below.
 *   4. Callers use getLifecycleStatesWithFlag(db, lifecycleCode, flag).
 *
 * Cache
 * -----
 * Process-lifetime. Populated on first request per (lifecycleCode, flag)
 * pair. Rebuild on process restart. Later a POST /admin/lifecycle/refresh
 * endpoint can invalidate.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export type KnownStateFlag =
  | "is_transactable_source"
  | "is_payable_source"
  | "is_mutable"
  | "is_editable"
  | "is_committed"
  | "is_deletable"
  | "is_reversible";

// Two-level cache: lifecycleCode → flag → Set<state_code>.
const CACHE = new Map<string, Map<string, Set<string>>>();

/**
 * Return the set of `state.code` values for the given lifecycle where
 * `state_flags -> flag = true`. Returns an empty set when the lifecycle is
 * unknown or no state carries the flag.
 *
 * Callers should treat the returned Set as read-only; the same instance is
 * cached and reused across invocations.
 */
export async function getLifecycleStatesWithFlag(
  db:            AnyDb,
  lifecycleCode: string,
  flag:          KnownStateFlag | string,
): Promise<ReadonlySet<string>> {
  const byFlag = CACHE.get(lifecycleCode) ?? new Map<string, Set<string>>();
  const cached = byFlag.get(flag);
  if (cached) return cached;

  const rows = await sql<{ code: string }>`
    SELECT ls.code
      FROM control.lifecycle_state ls
      JOIN control.lifecycle lc ON lc.id = ls.lifecycle_id
     WHERE lc.code = ${lifecycleCode}::text
       AND lc.tenant_id IS NULL
       AND ls.tenant_id IS NULL
       AND COALESCE((ls.state_flags ->> ${flag}::text)::boolean, false) = true
  `.execute(db);

  const codes = new Set(rows.rows.map((r) => r.code));
  byFlag.set(flag, codes);
  CACHE.set(lifecycleCode, byFlag);
  return codes;
}

/**
 * TEST-ONLY: clears the process-lifetime cache.
 */
export function __resetLifecycleStateFlagsCache(): void {
  CACHE.clear();
}
