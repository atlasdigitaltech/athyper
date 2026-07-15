import type { MutationResult } from "./entity-mutation.types.js";

export interface MutationHttpResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** Transport adapter only: mutation services never import Express. */
export function mapMutationResultToHttp(result: MutationResult): MutationHttpResponse {
  switch (result.kind) {
    case "Committed": {
      const headers: Record<string, string> = {};
      if (result.version !== undefined) headers["ETag"] = `"${result.version}"`;
      if (result.replayed) headers["X-Idempotency-Cache"] = "replay";
      return {
        status: result.action === "create" ? 201 : 200,
        body: result.warnings
          ? { ...(result.record ?? { id: result.recordId }), _mutation_warnings: result.warnings, _validation_metrics: result.validationMetrics }
          : result.record ?? { id: result.recordId },
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };
    }
    case "NotFound":
      return {
        status: 404,
        body: {
          error: result.recordId ? "RECORD_NOT_FOUND" : "ENTITY_NOT_FOUND",
          message: result.recordId
            ? `Record '${result.recordId}' not found`
            : `Entity '${result.entityCode}' not found`,
        },
      };
    case "CapabilityUnavailable":
      return { status: 503, body: { error: "ENTITY_CAPABILITY_UNAVAILABLE", message: `Entity '${result.entityCode}' has no compiled mutation capability.` } };
    case "IncompatibleAction":
      return { status: 403, body: { error: "ENTITY_ACTION_INCOMPATIBLE", message: result.reason } };
    case "Forbidden":
      return { status: 403, body: { error: "PERMISSION_DENIED", message: result.permissionCode ? `Permission '${result.permissionCode}' is required.` : "Mutation is forbidden." } };
    case "VersionRequired":
      return { status: 428, body: { error: "PRECONDITION_REQUIRED", message: "If-Match is required for this write." } };
    case "VersionConflict":
      return {
        status: 412,
        body: {
          error: "VERSION_CONFLICT",
          message: "Record was modified by another user. Reload and try again.",
          current_version: result.currentVersion,
          currentEtag: String(result.currentVersion),
        },
      };
    case "FieldsNotWritable":
      return {
        status: 422,
        body: {
          error: "FIELDS_NOT_WRITABLE",
          fields: result.fields,
        },
      };
    case "ValidationFailed":
      return {
        status: result.code === "EMPTY_PATCH" ? 400 : 422,
        body: { error: result.code, message: result.message, ...(result.fields ? { fields: result.fields } : {}) },
      };
    case "LockRequired":
      return {
        status: result.reason === "expired" ? 410 : 423,
        body: {
          error: result.reason === "expired" ? "LOCK_EXPIRED" : result.reason === "required" ? "LOCK_REQUIRED" : "LOCK_INVALID",
          message: result.reason === "required" ? "lock_token is required to edit this record" : "The supplied edit lock is not valid.",
          reason: result.reason,
        },
      };
    case "InvalidTransition":
      return { status: 422, body: { error: "INVALID_TRANSITION", message: result.reason, transition: result.transitionCode } };
    case "IdempotencyConflict":
      if (result.reason === "required") {
        return { status: 428, body: { error: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required for this write." } };
      }
      if (result.reason === "invalid") {
        return { status: 400, body: { error: "BAD_IDEMPOTENCY_KEY", message: "Idempotency-Key must not exceed 256 characters." } };
      }
      return {
        status: 409,
        body: {
          error: result.reason === "reused" ? "IDEMPOTENCY_KEY_REUSED" : "IDEMPOTENCY_IN_PROGRESS",
          message: result.reason === "reused"
            ? "Idempotency-Key was already used for a different mutation."
            : "An identical mutation is already in progress.",
        },
      };
    case "AggregateRejected":
      return { status: result.status, body: result.body };
  }
}
