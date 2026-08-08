// Canonical URL builder for the runtime SERVER surface (the URLs the
// runtime backend exposes on RUNTIME_API_URL after the runtime service
// rename). Symmetric to runtimePath (BFF-facing /api/runtime/v1/*) but
// emitted by BFF handlers as their fetch() upstream targets.
//
// Locked decisions:
//   - /api/runtime/v1/* is the canonical namespace for all routes the BFF
//     v1 handlers fetch as identity rewrites of their inbound URL.
//   - /api/metadata/lookups/[domain] STAYS canonical (semantic home);
//     metadataLookupDomain() encodes that. No /api/runtime/v1/lookup-domains/*
//     alias was ever added — the temporary-alias plan was waived because
//     the rename ran in one atomic deploy with no monitoring window.
//
// Hand-rolled URL strings in server or BFF code are rejected by the
// strict guard at server/scripts/check-runtime-server-paths.ts.

const RUNTIME_ROOT = "/api/runtime/v1";

function enc(part: string): string {
  return encodeURIComponent(part);
}

export const runtimeServerPath = {
  // Entity records — replaces /api/records/*.
  entityList: (entity: string) => `${RUNTIME_ROOT}/entities/${enc(entity)}`,
  entityCreate: (entity: string) => `${RUNTIME_ROOT}/entities/${enc(entity)}`,
  entityDetail: (entity: string, id: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/${enc(id)}`,
  processState: (entity: string, id: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/${enc(id)}/process-state`,

  // Merged rules projection — replaces the two-call pattern
  // (entity_field via records + entity_action_rule via metadata).
  // Server-side merge keeps the BFF rules handler thin.
  rules: (entity: string) => `${RUNTIME_ROOT}/entities/${enc(entity)}/rules`,

  // Descriptor relation/binding endpoints — replace
  // /api/metadata/document-runtime/{binding,lookup,relation}/*.
  binding: (code: string) => `${RUNTIME_ROOT}/bindings/${enc(code)}`,
  bindingRecords: (code: string, parentId: string) =>
    `${RUNTIME_ROOT}/bindings/${enc(code)}/records/${enc(parentId)}`,
  lookup: (lookupCode: string) => `${RUNTIME_ROOT}/lookups/${enc(lookupCode)}`,
  relationRecords: (entity: string, relation: string, parentId: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/relations/${enc(relation)}/records/${enc(parentId)}`,
  fieldOptions: (entity: string, field: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/fields/${enc(field)}/options`,
  submitPreflight: (entity: string, id: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/${enc(id)}/submit-preflight`,
  // Durable record events have not yet moved in the runtime service. Keeping
  // this compatibility URL in the central registry prevents BFF routes from
  // inventing internal origins or redirecting browsers to service addresses.
  documentEventStream: (entity: string, id: string) =>
    `/api/records/${enc(entity)}/${enc(id)}/stream`,
  documentEditSubmit: (entity: string, id: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/${enc(id)}/edit/submit`,
  action: (entity: string, id: string, code: string) =>
    `${RUNTIME_ROOT}/entities/${enc(entity)}/${enc(id)}/action/${enc(code)}`,

  // CANONICAL — /api/metadata/lookups/[domain] never moves. Use this
  // helper to express that intent so the strict guard recognizes the
  // path as canonical, not a legacy import.
  metadataLookupDomain: (domain: string) =>
    `/api/metadata/lookups/${enc(domain)}`,
} as const;

export type RuntimeServerPathBuilder = typeof runtimeServerPath;

