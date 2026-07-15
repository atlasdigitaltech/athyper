/**
 * Runtime consumer for control.entity.feature_flags.trigger_managed_children.
 *
 * Metadata shape (per entity_code):
 *   [{
 *     child_entity:          string,
 *     trigger_name:          string | null,  // null → service-owned
 *     refresh_trigger:       string | null,
 *     service_name:          string | null,  // set when trigger_name is null
 *     refresh_service_name:  string | null,
 *     writer_precedence:     string,
 *     except_by_lookup:      string | null,  // control.lookup_domain.code
 *     error_code_on_orphan:  string | null   // SQLSTATE raised by DB guard
 *   }, ...]
 *
 * Consumers:
 *   - verifyTriggerManagedChildren() → CI drift check (server/scripts/
 *     verify-trigger-managed-children.ts)
 *   - future: audit/reporting, delete-plan builder, docs generator
 *
 * NULL-tolerant: entries with trigger_name=null are service-owned; their
 * verification uses service_name instead of pg_trigger existence.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

export interface TriggerManagedChild {
  parentEntity:       string;
  childEntity:        string;
  triggerName:        string | null;
  refreshTrigger:     string | null;
  serviceName:        string | null;
  refreshServiceName: string | null;
  writerPrecedence:   string;
  exceptByLookup:     string | null;
  errorCodeOnOrphan:  string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function loadTriggerManagedChildren(
  db: AnyDb,
  parentEntityCode?: string,
): Promise<TriggerManagedChild[]> {
  const rows = parentEntityCode
    ? await sql<{ entity_code: string; child: Record<string, string | null> }>`
        SELECT e.entity_code,
               jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child
          FROM control.entity e
         WHERE e.tenant_id IS NULL
           AND e.feature_flags ? 'trigger_managed_children'
           AND e.entity_code = ${parentEntityCode}
      `.execute(db)
    : await sql<{ entity_code: string; child: Record<string, string | null> }>`
        SELECT e.entity_code,
               jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child
          FROM control.entity e
         WHERE e.tenant_id IS NULL
           AND e.feature_flags ? 'trigger_managed_children'
      `.execute(db);

  return rows.rows.map(r => ({
    parentEntity:       r.entity_code,
    childEntity:        (r.child["child_entity"]         as string) ?? "",
    triggerName:         r.child["trigger_name"]         ?? null,
    refreshTrigger:      r.child["refresh_trigger"]      ?? null,
    serviceName:         r.child["service_name"]         ?? null,
    refreshServiceName:  r.child["refresh_service_name"] ?? null,
    writerPrecedence:   (r.child["writer_precedence"]    as string) ?? "",
    exceptByLookup:      r.child["except_by_lookup"]     ?? null,
    errorCodeOnOrphan:   r.child["error_code_on_orphan"] ?? null,
  }));
}

/**
 * Verify that every non-null trigger_name / refresh_trigger claimed by
 * trigger_managed_children actually exists in pg_trigger. Returns the list
 * of missing trigger names (empty when all present).
 *
 * Service-owned children (trigger_name = null) are skipped here; their
 * verification lives in a separate CI check that inspects code exports.
 */
export async function verifyTriggerManagedChildren(
  db: AnyDb,
): Promise<{ ok: boolean; missing: string[] }> {
  const claims = await loadTriggerManagedChildren(db);
  const triggerNames = [
    ...new Set(
      claims.flatMap(c => {
        const names: string[] = [];
        if (c.triggerName)    names.push(c.triggerName);
        if (c.refreshTrigger) names.push(c.refreshTrigger);
        return names;
      }),
    ),
  ];
  if (triggerNames.length === 0) return { ok: true, missing: [] };

  const existing = await sql<{ tgname: string }>`
    SELECT tgname FROM pg_trigger WHERE tgname = ANY(${triggerNames}::text[])
  `.execute(db);
  const existingSet = new Set(existing.rows.map(r => r.tgname));
  const missing = triggerNames.filter(t => !existingSet.has(t));
  return { ok: missing.length === 0, missing };
}
