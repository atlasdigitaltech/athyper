import type { RuntimeErrorBody } from "./runtime.types.js";

export type WorkflowRuntimeErrorCode =
  | "COMMAND_IN_PROGRESS"
  | "COMMAND_REPLAY_ERROR"
  | "FEATURE_FLAG_DISABLED"
  | "OPERATION_NOT_FOUND"
  | "OPERATION_DISABLED"
  | "OPERATION_DENIED"
  | "UNSUPPORTED_ENTITY"
  | "UNSUPPORTED_OPERATION"
  | "ENTITY_NOT_FOUND"
  | "LIFECYCLE_INSTANCE_MISSING"
  | "TRANSITION_DENIED"
  | "GATE_DENIED"
  | "GATE_NOT_IMPLEMENTED"
  | "WORKFLOW_DEFINITION_MISSING"
  | "CONFLICT"
  | "NOT_IMPLEMENTED"
  | "RUNTIME_ERROR";

export class WorkflowRuntimeError extends Error {
  readonly code: WorkflowRuntimeErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: WorkflowRuntimeErrorCode,
    message: string,
    statusCode = statusCodeForRuntimeError(code),
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkflowRuntimeError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toBody(): RuntimeErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class NotImplementedError extends WorkflowRuntimeError {
  constructor(method: string) {
    super("NOT_IMPLEMENTED", `${method} is not implemented in WorkflowLifecycleRuntime Phase 1`, 501, { method });
  }
}

export function statusCodeForRuntimeError(code: WorkflowRuntimeErrorCode): number {
  switch (code) {
    case "COMMAND_IN_PROGRESS":
    case "CONFLICT":
      return 409;
    case "FEATURE_FLAG_DISABLED":
    case "OPERATION_DENIED":
      return 403;
    case "OPERATION_NOT_FOUND":
    case "ENTITY_NOT_FOUND":
    case "LIFECYCLE_INSTANCE_MISSING":
      return 404;
    case "OPERATION_DISABLED":
    case "TRANSITION_DENIED":
    case "GATE_DENIED":
    case "GATE_NOT_IMPLEMENTED":
    case "UNSUPPORTED_ENTITY":
    case "UNSUPPORTED_OPERATION":
    case "WORKFLOW_DEFINITION_MISSING":
      return 422;
    case "NOT_IMPLEMENTED":
      return 501;
    default:
      return 500;
  }
}

export function normalizeRuntimeError(err: unknown): WorkflowRuntimeError {
  if (err instanceof WorkflowRuntimeError) return err;
  if (err && typeof err === "object") {
    const maybe = err as { code?: unknown; message?: unknown; statusCode?: unknown };
    if (typeof maybe.code === "string" && typeof maybe.message === "string") {
      return new WorkflowRuntimeError(
        normalizeCode(maybe.code),
        maybe.message,
        typeof maybe.statusCode === "number" ? maybe.statusCode : statusCodeForRuntimeError(normalizeCode(maybe.code)),
      );
    }
  }
  return new WorkflowRuntimeError(
    "RUNTIME_ERROR",
    err instanceof Error ? err.message : String(err),
    500,
  );
}

function normalizeCode(code: string): WorkflowRuntimeErrorCode {
  const known: WorkflowRuntimeErrorCode[] = [
    "COMMAND_IN_PROGRESS",
    "COMMAND_REPLAY_ERROR",
    "FEATURE_FLAG_DISABLED",
    "OPERATION_NOT_FOUND",
    "OPERATION_DISABLED",
    "OPERATION_DENIED",
    "UNSUPPORTED_ENTITY",
    "UNSUPPORTED_OPERATION",
    "ENTITY_NOT_FOUND",
    "LIFECYCLE_INSTANCE_MISSING",
    "TRANSITION_DENIED",
    "GATE_DENIED",
    "GATE_NOT_IMPLEMENTED",
    "WORKFLOW_DEFINITION_MISSING",
    "CONFLICT",
    "NOT_IMPLEMENTED",
    "RUNTIME_ERROR",
  ];
  return known.includes(code as WorkflowRuntimeErrorCode)
    ? code as WorkflowRuntimeErrorCode
    : "RUNTIME_ERROR";
}
