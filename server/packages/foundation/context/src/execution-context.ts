/**
 * Canonical plane identifiers.
 * "athyper" is the admin/platform plane (replaces legacy "admin" label at this boundary).
 */
export type PlaneKey = "neon" | "mesh" | "athyper";

/**
 * Minimal neutral context propagated through AsyncLocalStorage.
 * No IAM types, no HTTP headers, no database handles.
 * IAM-enriched contexts (VerifiedRequestContext, etc.) are built on top
 * of this interface in platform/iam and runtime/http.
 */
export interface ExecutionContext {
  requestId: string;
  correlationId?: string;
  planeKey?: PlaneKey;
  tenantId?: string;
  principalId?: string;
}
