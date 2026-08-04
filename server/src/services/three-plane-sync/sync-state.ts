/**
 * Canonical tenant-to-Keycloak organization reconciliation.
 *
 * Keeps Keycloak organizations aligned with active tenants. Authority and
 * Mesh admission are reconciled through their plane-local canonical services;
 * this module never projects authorization into Keycloak user attributes.
 */

// ─── Inputs ────────────────────────────────────────────────────────────────────

export interface DbTenantRow {
  id: string;
  name: string;
  status: string;
  realm_key: string | null;
}

export interface KcOrgRow {
  alias: string;
  name: string;
  attributes: Record<string, string[] | undefined>;
}

// ─── Tenant sync ──────────────────────────────────────────────────────────────

export interface TenantSyncDelta {
  /** Tenants present in DB but missing from KC — must `POST /organizations`. */
  toCreate: DbTenantRow[];
  /** Tenants in both DB and KC where name drifted — must `PUT /organizations/{alias}`. */
  toRename: Array<{ alias: string; from: string; to: string }>;
  /** Org aliases present in KC but missing/inactive in DB — must `DELETE /organizations/{alias}`. */
  toArchive: string[];
}

/**
 * Compute the tenant-org sync delta. Pure: takes both sides of the
 * authoritative state as input, returns the operations the sync job must
 * issue against KC. This is the function the BullMQ worker (when it lands)
 * calls before fanning out HTTP calls.
 */
export function computeTenantSyncDelta(
  dbTenants: readonly DbTenantRow[],
  kcOrgs: readonly KcOrgRow[],
): TenantSyncDelta {
  const dbActive = new Map<string, DbTenantRow>();
  for (const t of dbTenants) {
    if (t.status === "active") dbActive.set(t.id, t);
  }
  const kcByAlias = new Map<string, KcOrgRow>();
  for (const o of kcOrgs) kcByAlias.set(o.alias, o);

  const toCreate: DbTenantRow[] = [];
  const toRename: Array<{ alias: string; from: string; to: string }> = [];

  for (const [tenantId, tenant] of dbActive) {
    const org = kcByAlias.get(tenantId);
    if (!org) {
      toCreate.push(tenant);
      continue;
    }
    if (org.name !== tenant.name) {
      toRename.push({ alias: tenantId, from: org.name, to: tenant.name });
    }
  }

  const toArchive: string[] = [];
  for (const alias of kcByAlias.keys()) {
    if (!dbActive.has(alias)) toArchive.push(alias);
  }

  return { toCreate, toRename, toArchive };
}

// Worker metadata for the additive tenant-organization reconciler.
export const REAL_WORKER_SPEC = Object.freeze({
  module: "server/packages/services/jobs/workers/tenant-organization-sync.worker.ts",
  status: "deferred-to-followup",
  documented_in: "docs/local/runbooks/rb-16-kc-org-sync-drift.md",
} as const);