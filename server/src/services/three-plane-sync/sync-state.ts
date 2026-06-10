/**
 * Phase 5.5 — Three-Plane Permission Stack KC sync skeleton.
 *
 * State machine for the two scheduled jobs the program needs:
 *
 *   1. sync-tenant-memberships — keeps KC Organizations aligned with
 *      master.tenant. New tenant → create org; deleted tenant → archive org;
 *      tenant rename → patch org name.
 *
 *   2. sync-partner-bindings — keeps each mesh.principal's KC user attribute
 *      `mesh_account_grant_ids` aligned with their active mesh.account_grant
 *      rows. Grant revoke → drop the grant_id from the attribute. New
 *      active grant → append.
 *
 * This module is the **transition skeleton**: it exposes the per-step state
 * computations as pure functions so they can be unit tested today, and
 * documents the exact KC admin REST calls the real worker would make when
 * it lands. The actual workers will live under
 * server/packages/services/jobs/workers/ and consume these helpers.
 *
 * Until the real workers ship, operators run rb-16 procedures manually.
 * The functions here are still useful as the contract for what the
 * workers must compute.
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

export interface DbActiveGrant {
  grant_id: string;
  principal_id: string;
  account_id: string;
  status: string;
}

export interface KcUserAttribute {
  user_id: string;
  /** What KC currently has under `attributes.mesh_account_grant_ids`. */
  current_grant_ids: string[];
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

// ─── Partner binding sync ─────────────────────────────────────────────────────

export interface BindingAttributeDelta {
  /** KC user IDs whose `mesh_account_grant_ids` attribute must be updated. */
  updates: Array<{
    user_id: string;
    add: string[];
    remove: string[];
    final: string[];
  }>;
}

/**
 * Compute per-user grant_id attribute updates. The KC worker writes a single
 * PUT per affected user, replacing the entire `mesh_account_grant_ids`
 * attribute with the computed `final` array.
 *
 * `principal_id` and `user_id` are different identifiers — the caller maps
 * mesh.principal_id → KC user.id via mesh.principal_identity_binding.subject_id
 * before invoking this function.
 */
export function computeBindingAttributeDelta(
  dbActiveGrantsByUser: ReadonlyMap<string /* user_id */, readonly DbActiveGrant[]>,
  kcAttrs: ReadonlyMap<string /* user_id */, readonly string[]>,
): BindingAttributeDelta {
  const updates: BindingAttributeDelta["updates"] = [];

  const allUsers = new Set<string>([
    ...dbActiveGrantsByUser.keys(),
    ...kcAttrs.keys(),
  ]);

  for (const userId of allUsers) {
    const dbActive = new Set(
      (dbActiveGrantsByUser.get(userId) ?? [])
        .filter((g) => g.status === "active")
        .map((g) => g.grant_id),
    );
    const kcCurrent = new Set(kcAttrs.get(userId) ?? []);

    const add: string[] = [];
    const remove: string[] = [];
    for (const gid of dbActive) if (!kcCurrent.has(gid)) add.push(gid);
    for (const gid of kcCurrent) if (!dbActive.has(gid)) remove.push(gid);

    if (add.length === 0 && remove.length === 0) continue;

    updates.push({
      user_id: userId,
      add: add.sort(),
      remove: remove.sort(),
      final: [...dbActive].sort(),
    });
  }

  return { updates };
}

// ─── Documentation: what the real worker will do ──────────────────────────────

/**
 * KC admin REST calls the production worker will issue. Kept here as a
 * machine-readable spec until the worker lands.
 *
 * For each `TenantSyncDelta.toCreate`:
 *   POST /admin/realms/{realm}/organizations
 *   body: { alias: tenant.id, name: tenant.name, domains: [tenant.primary_domain] }
 *
 * For each `TenantSyncDelta.toRename`:
 *   PUT  /admin/realms/{realm}/organizations/{alias}
 *   body: { name: to }
 *
 * For each `TenantSyncDelta.toArchive`:
 *   DELETE /admin/realms/{realm}/organizations/{alias}
 *   (or set a `archived=true` attribute if soft-delete is preferred)
 *
 * For each `BindingAttributeDelta.updates`:
 *   PUT  /admin/realms/{realm}/users/{user_id}
 *   body: { attributes: { ...currentAttrs, mesh_account_grant_ids: update.final } }
 *
 * All calls bear the service account bearer token from the cached
 * KC admin token (see api.ts:775-803 for the existing pattern).
 */
export const REAL_WORKER_SPEC = Object.freeze({
  module: "server/packages/services/jobs/workers/three-plane-sync.worker.ts",
  status: "deferred-to-followup",
  documented_in: "docs/local/runbooks/rb-16-kc-org-sync-drift.md",
} as const);
