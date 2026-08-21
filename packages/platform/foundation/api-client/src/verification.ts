import type { Operation } from "./index";

export const VERIFICATION_PLANES = Object.freeze(["studio", "neon", "mesh"] as const);
export const VERIFICATION_STATUSES = Object.freeze(["passed", "failed", "skipped"] as const);
export type VerificationPlane = (typeof VERIFICATION_PLANES)[number];
export type VerificationCheckStatus = (typeof VERIFICATION_STATUSES)[number];
export type VerificationMode = "quick" | "functional";

export interface VerificationCheckResult {
  readonly id: string;
  readonly label: string;
  readonly category: "identity" | "database" | "cache" | "document" | "search" | "runtime" | "mail" | "observability" | "readiness";
  readonly status: VerificationCheckStatus;
  readonly durationMs: number;
  readonly detail: string;
  readonly cleanup?: "complete" | "not-required" | "failed";
}

export interface PlatformVerificationRun {
  readonly apiVersion: "athyper.io/v1alpha1";
  readonly kind: "PlatformVerificationRun";
  readonly runId: string;
  readonly mode: VerificationMode;
  readonly scope: "all" | VerificationPlane;
  readonly planeKey: VerificationPlane;
  readonly tenantId: string;
  readonly principalId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "passed" | "failed";
  readonly summary: Readonly<Record<VerificationCheckStatus, number>>;
  readonly checks: readonly VerificationCheckResult[];
  readonly evidence: { readonly correlationId: string; readonly logQuery: string; readonly grafanaExploreUrl?: string };
}

export const verificationSnapshotOperation: Operation<PlatformVerificationRun> = Object.freeze({ method: "GET", path: "/api/platform/verification", parse: parsePlatformVerificationRun, requestClass: "background", idempotency: "forbidden", response: "json" });
export const verificationFunctionalRunOperation: Operation<PlatformVerificationRun, { readonly mode: "functional" }> = Object.freeze({ method: "POST", path: "/api/platform/verification/runs", parse: parsePlatformVerificationRun, requestClass: "background", idempotency: "required", response: "json" });

export function parsePlatformVerificationRun(value: unknown): PlatformVerificationRun {
  const input = record(value, "verification run");
  if (input.apiVersion !== "athyper.io/v1alpha1" || input.kind !== "PlatformVerificationRun") throw new TypeError("verification run authority is invalid");
  const planeKey = one(input.planeKey, VERIFICATION_PLANES, "planeKey");
  const mode = one(input.mode, ["quick", "functional"] as const, "mode");
  const scope = input.scope === "all" ? "all" : one(input.scope, VERIFICATION_PLANES, "scope");
  const status = one(input.status, ["passed", "failed"] as const, "status");
  const checks = array(input.checks, "checks").map((item, index) => parseCheck(item, index));
  const summaryInput = record(input.summary, "summary");
  const evidenceInput = record(input.evidence, "evidence");
  return Object.freeze({
    apiVersion: "athyper.io/v1alpha1", kind: "PlatformVerificationRun", runId: text(input.runId, "runId"), mode, scope, planeKey,
    tenantId: text(input.tenantId, "tenantId"), principalId: text(input.principalId, "principalId"), startedAt: timestamp(input.startedAt, "startedAt"), completedAt: timestamp(input.completedAt, "completedAt"), status,
    summary: Object.freeze({ passed: integer(summaryInput.passed, "summary.passed"), failed: integer(summaryInput.failed, "summary.failed"), skipped: integer(summaryInput.skipped, "summary.skipped") }), checks: Object.freeze(checks),
    evidence: Object.freeze({ correlationId: text(evidenceInput.correlationId, "evidence.correlationId"), logQuery: text(evidenceInput.logQuery, "evidence.logQuery"), ...(typeof evidenceInput.grafanaExploreUrl === "string" ? { grafanaExploreUrl: safeUrl(evidenceInput.grafanaExploreUrl) } : {}) }),
  });
}

function parseCheck(value: unknown, index: number): VerificationCheckResult {
  const input = record(value, `checks[${index}]`);
  const categories = ["identity", "database", "cache", "document", "search", "runtime", "mail", "observability", "readiness"] as const;
  const cleanup = input.cleanup === undefined ? undefined : one(input.cleanup, ["complete", "not-required", "failed"] as const, `checks[${index}].cleanup`);
  return Object.freeze({ id: text(input.id, `checks[${index}].id`), label: text(input.label, `checks[${index}].label`), category: one(input.category, categories, `checks[${index}].category`), status: one(input.status, VERIFICATION_STATUSES, `checks[${index}].status`), durationMs: integer(input.durationMs, `checks[${index}].durationMs`), detail: text(input.detail, `checks[${index}].detail`), ...(cleanup ? { cleanup } : {}) });
}
function record(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`); return value; }
function text(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty`); return value.trim(); }
function integer(value: unknown, name: string): number { if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`); return value; }
function timestamp(value: unknown, name: string): string { const result = text(value, name); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${name} must be a timestamp`); return result; }
function one<const Values extends readonly string[]>(value: unknown, values: Values, name: string): Values[number] { if (typeof value !== "string" || !values.includes(value as Values[number])) throw new TypeError(`${name} is invalid`); return value as Values[number]; }
function safeUrl(value: string): string { const url = new URL(value); if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) throw new TypeError("Grafana URL is invalid"); return url.toString(); }
