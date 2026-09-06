import { parseInstant } from "@athyper/platform-temporal";
import { ApiTransportError } from "@athyper/platform-api-client";

export type AppErrorKind =
  | "authentication"
  | "required-action"
  | "permission-denied"
  | "context-mismatch"
  | "conflict"
  | "validation"
  | "rate-limit"
  | "service-unavailable"
  | "network"
  | "offline"
  | "unexpected";

export type AppErrorAction = "login" | "complete-action" | "select-context" | "reload-compare" | "correct-fields" | "retry-later" | "retry" | "reset" | "none";

export interface AppErrorModel {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly title: string;
  readonly description: string;
  readonly action: AppErrorAction;
  readonly canRetry: boolean;
  readonly preserveInput: boolean;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly requiredActions: readonly string[];
}

export interface ClassifyAppErrorInput {
  readonly error: unknown;
  readonly online?: boolean;
  readonly requiredActions?: readonly string[];
  readonly retryAfter?: string;
  readonly now?: number;
}

const REQUIRED_ACTION_CODES = new Set(["AUTH_REQUIRED_ACTION", "REQUIRED_ACTION_PENDING", "MFA_REQUIRED", "STEP_UP_REQUIRED"]);

export function classifyAppError(input: ClassifyAppErrorInput): AppErrorModel {
  const facts = readSafeFacts(input.error);
  const requiredActions = cleanActions(input.requiredActions);
  const requestId = safeRequestId(facts.requestId);
  const common = { ...(facts.status ? { status: facts.status } : {}), ...(requestId ? { requestId } : {}), requiredActions };

  if (facts.status === 401 || facts.transportKind === "authentication") return model("authentication", "Sign in required", "Your session is no longer available. Sign in again to continue.", "login", false, false, common);
  if (facts.code === "AUTH_CONTEXT_MISMATCH") return model("context-mismatch", "Your access context changed", "Choose an active context before continuing.", "select-context", false, false, common);
  if ((facts.status === 403 && REQUIRED_ACTION_CODES.has(facts.code ?? "")) || requiredActions.length > 0) return model("required-action", "Action required", "Complete the required identity action before continuing.", "complete-action", false, true, common);
  if (facts.status === 403 || facts.transportKind === "authorization") return model("permission-denied", "Access denied", "You do not have permission to view this resource.", "none", false, false, common);
  if (facts.status === 409 || facts.transportKind === "conflict") return model("conflict", "This item changed", "Keep your input while you reload the latest version or compare changes.", "reload-compare", false, true, common);
  if (facts.status === 422 || facts.transportKind === "validation") return model("validation", "Check your entries", "Correct the highlighted fields and submit again. Your input has been kept.", "correct-fields", false, true, common);
  if (facts.status === 429 || facts.transportKind === "rate-limit") {
    const retryAfterSeconds = parseRetryAfter(input.retryAfter ?? facts.retryAfter, input.now);
    return model("rate-limit", "Too many requests", retryAfterSeconds ? `Try again in about ${retryAfterSeconds} seconds.` : "Wait briefly before trying again.", "retry-later", true, true, { ...common, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
  }
  if (input.online === false && (facts.transportKind === "network" || facts.status === undefined)) return model("offline", "You are offline", "Reconnect to continue. Any safe local draft can remain on this device.", "retry", true, true, common);
  if (facts.transportKind === "network" || facts.transportKind === "timeout") return model("network", "Connection problem", "The service could not be reached. Check your connection and try again.", "retry", true, true, common);
  if (facts.status === 503 || facts.transportKind === "dependency") return model("service-unavailable", "Service temporarily unavailable", "The service is unavailable right now. Try again shortly.", "retry", true, true, common);
  return model("unexpected", "Something went wrong", "The page could not be completed. You can safely try again.", "reset", true, false, common);
}

export interface RedactedBoundaryEvent { readonly name: "app_boundary_error"; readonly kind: AppErrorKind; readonly status?: number; readonly requestId?: string; readonly digest?: string; }
export function createRedactedBoundaryEvent(error: unknown, model: AppErrorModel): RedactedBoundaryEvent {
  const digest = safeDigest(readRecord(error)?.digest);
  return Object.freeze({ name: "app_boundary_error", kind: model.kind, ...(model.status ? { status: model.status } : {}), ...(model.requestId ? { requestId: model.requestId } : {}), ...(digest ? { digest } : {}) });
}

export function safeLocalReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return "/";
  return value;
}

export function safeLoginLocation(returnTo: string | undefined): string { return `/api/auth/login?returnTo=${encodeURIComponent(safeLocalReturnTo(returnTo))}`; }

function model(kind: AppErrorKind, title: string, description: string, action: AppErrorAction, canRetry: boolean, preserveInput: boolean, rest: Pick<AppErrorModel, "status" | "requestId" | "retryAfterSeconds" | "requiredActions">): AppErrorModel {
  return Object.freeze({ kind, title, description, action, canRetry, preserveInput, ...rest });
}
function readSafeFacts(error: unknown): { status?: number; code?: string; requestId?: string; retryAfter?: string; transportKind?: string } {
  if (error instanceof ApiTransportError) return { status: positiveStatus(error.status), code: error.problem?.code, requestId: error.requestId ?? error.problem?.requestId, retryAfter: error.retryAfter, transportKind: error.kind };
  const record = readRecord(error), problem = readRecord(record?.problem);
  return { status: positiveStatus(record?.status), code: canonicalCode(record?.code ?? problem?.code), requestId: text(record?.requestId ?? problem?.requestId), retryAfter: text(record?.retryAfter), transportKind: text(record?.kind) };
}
function readRecord(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function positiveStatus(value: unknown): number | undefined { return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599 ? value : undefined; }
function canonicalCode(value: unknown): string | undefined { return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,127}$/.test(value) ? value : undefined; }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function safeRequestId(value: unknown): string | undefined { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined; }
function safeDigest(value: unknown): string | undefined { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined; }
function cleanActions(values: readonly string[] | undefined): readonly string[] { return Object.freeze([...new Set((values ?? []).filter((value) => /^[A-Za-z0-9._:-]{1,80}$/.test(value)))]); }
function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : Math.ceil((parseInstant(value) - now) / 1_000);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : undefined;
}
