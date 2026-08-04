// Canonical URL builder for the /api/runtime/v1/* surface.
// Single source of truth — every caller goes through these helpers so a future
// rename (e.g. v2) is a one-file change. Hand-rolled URL strings in callers
// are rejected by scripts/policy/verify-runtime-api-paths.ts.

const ROOT = "/api/runtime/v1";

function enc(part: string): string {
  return encodeURIComponent(part);
}

export const runtimePath = {
  // ── Entity CRUD ────────────────────────────────────────────────────────────
  list: (entity: string) => `${ROOT}/entities/${enc(entity)}`,
  create: (entity: string) => `${ROOT}/entities/${enc(entity)}`,
  detail: (entity: string, id: string) => `${ROOT}/entities/${enc(entity)}/${enc(id)}`,
  processState: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/process-state`,
  rules: (entity: string) => `${ROOT}/entities/${enc(entity)}/rules`,
  referenceLabelsResolve: () => `${ROOT}/reference-labels/resolve`,

  // ── Per-record sub-resources (served via the /[...path] BFF catchall) ──────
  action: (entity: string, id: string, code: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/action/${enc(code)}`,
  lock: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lock`,
  lockHeartbeat: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lock/heartbeat`,
  lockForce: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lock/force`,
  lines: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lines`,
  line: (entity: string, id: string, lineId: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lines/${enc(lineId)}`,
  lineDistributions: (entity: string, id: string, lineId: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lines/${enc(lineId)}/distributions`,
  lineDistribution: (entity: string, id: string, lineId: string, distId: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/lines/${enc(lineId)}/distributions/${enc(distId)}`,
  distributions: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/distributions`,
  submitPreflight: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/submit-preflight`,
  versions: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/versions`,
  version: (entity: string, id: string, versionNo: string | number) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/versions/${enc(String(versionNo))}`,
  // Snapshots — graph checkpoints from snapshot.document_snapshot.
  // Distinct from versions: versions = lifecycle transitions (Lifecycle tab),
  // snapshots = full graph at each gate event (Versions tab).
  entitySnapshots: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/snapshots`,
  snapshotChildContracts: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/snapshot-child-contracts`,
  /** Detail — full graph payload for one snapshot. Powers View Snapshot,
   *  and the future Compare / Restore flows. */
  entitySnapshot: (entity: string, id: string, snapshotId: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/snapshots/${enc(snapshotId)}`,
  /** Compare — server-side diff between two snapshots of the same record.
   *  POST body: { leftSnapshotId, rightSnapshotId }. Response always reads
   *  older → newer regardless of caller order. */
  entitySnapshotCompare: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/snapshots/compare`,
  /** Restore — destructive replay of a snapshot's graph back into live
   *  tables. Only allowed in draft/rejected/proforma; writes a
   *  reason-coded audit entry; fresh UUIDs for child rows (per
   *  Phase 9b D1). */
  entitySnapshotRestore: (entity: string, id: string, snapshotId: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/snapshots/${enc(snapshotId)}/restore`,
  // Change reason codes — controlled-vocabulary lookup for high-risk audit
  // entries. Tenant-scoped (not per-record). Optional category filter:
  // workflow / accounting / financial / snapshot.
  changeReasonCodes: (category?: string) => category
    ? `${ROOT}/change-reason-codes?category=${enc(category)}`
    : `${ROOT}/change-reason-codes`,
  // Per-record audit log — column-level mutation history from log.audit_log
  // (operation, old/new values, changed_fields, reason_code). Powers the
  // Audit tab. Distinct from versions (state transitions) and snapshots
  // (graph checkpoints).
  entityAuditLog: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/audit-log`,
  stream: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/stream`,
  workflow: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/workflow`,
  approvals: (entity: string, id: string) =>
    `${ROOT}/entities/${enc(entity)}/${enc(id)}/approvals`,

  // ── Per-entity (collection-scope) sub-resources ────────────────────────────
  bulkPreflight: (entity: string) => `${ROOT}/entities/${enc(entity)}/bulk-preflight`,
  bulkAction:    (entity: string) => `${ROOT}/entities/${enc(entity)}/bulk-action`,
  bulkCrud:      (entity: string) => `${ROOT}/entities/${enc(entity)}/bulk`,

  // ── Descriptor + relation helpers ──────────────────────────────────────────
  relationRecords: (entity: string, relation: string, parentId: string) =>
    `${ROOT}/entities/${enc(entity)}/relations/${enc(relation)}/records/${enc(parentId)}`,
  defaultsResolve: (entity: string) =>
    `${ROOT}/entities/${enc(entity)}/defaults/resolve`,
  fieldOptions: (entity: string, field: string) =>
    `${ROOT}/entities/${enc(entity)}/fields/${enc(field)}/options`,
  lookup: (lookupCode: string) => `${ROOT}/lookups/${enc(lookupCode)}`,
  bindingRecords: (bindingCode: string, parentId: string) =>
    `${ROOT}/bindings/${enc(bindingCode)}/records/${enc(parentId)}`,

  // ── Pricing-component actions ──────────────────────────────────────────────
  componentSave: () => `${ROOT}/components/save`,
  componentUpdate: () => `${ROOT}/components/update`,
  componentDelete: () => `${ROOT}/components/delete`,

  // ── Cascade rederive resolvers ─────────────────────────────────────────────
  // POST {inputs} → {value}. Powers `on_source_change.action="rederive"`.
  // Backend: server/packages/services/shared/resolvers/resolver-route.ts
  resolver: (code: string) => `${ROOT}/resolvers/${enc(code)}`,
} as const;

export type RuntimePathBuilder = typeof runtimePath;
