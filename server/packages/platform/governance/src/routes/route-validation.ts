import { parseBusinessDate } from "@athyper/platform-temporal";
import { HttpError } from "@athyper/server-runtime-http";

export function invalidRequest(message: string): HttpError {
  return new HttpError(400, "GOVERNANCE_INVALID_COMMAND", message);
}

export function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    Number.isNaN(parseBusinessDate(value.slice(0, 10))) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalidRequest("ISO timestamp with timezone required");
  }
  return new Date(value).toISOString();
}

export const optionalBody = {
  parse(value: unknown) {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw invalidRequest("JSON object required");
    return value;
  },
  toJSONSchema: () => ({ type: "object", additionalProperties: true }),
};

const statuses: Readonly<Record<string, number>> = {
  GOVERNANCE_INVALID_COMMAND: 400,
  GOVERNANCE_EVIDENCE_REQUIRED: 400,
  GOVERNANCE_TASK_RUN_MISMATCH: 400,
  GOVERNANCE_PARENT_CYCLE_PERIOD_INVALID: 400,
  GOVERNANCE_PERMISSION_DENIED: 403,
  GOVERNANCE_TASK_OWNER_REQUIRED: 403,
  GOVERNANCE_REVIEWER_SEPARATION_REQUIRED: 403,
  GOVERNANCE_TENANT_MISMATCH: 403,
  GOVERNANCE_NOT_FOUND: 404,
  GOVERNANCE_CYCLE_RUN_NOT_FOUND: 404,
  GOVERNANCE_CYCLE_TASK_NOT_FOUND: 404,
  GOVERNANCE_CYCLE_DEVIATION_NOT_FOUND: 404,
  GOVERNANCE_CYCLE_CERTIFICATION_NOT_FOUND: 404,
  GOVERNANCE_CYCLE_TEMPLATE_NOT_FOUND: 404,
  GOVERNANCE_PARENT_CYCLE_NOT_FOUND: 404,
  GOVERNANCE_INVALID_TRANSITION: 409,
  GOVERNANCE_IDEMPOTENCY_CONFLICT: 409,
  GOVERNANCE_EXPECTED_VERSION_CONFLICT: 409,
  GOVERNANCE_CERTIFICATION_EXISTS: 409,
  GOVERNANCE_CERTIFICATION_IMMUTABLE: 409,
  GOVERNANCE_CHILD_CYCLE_ACTIVE: 409,
  GOVERNANCE_CYCLE_IMMUTABLE: 409,
  GOVERNANCE_CYCLE_NOT_READY: 409,
  GOVERNANCE_CYCLE_RUN_NOT_ACTIVE: 409,
  GOVERNANCE_DEVIATION_IMMUTABLE: 409,
  GOVERNANCE_PARENT_CYCLE_INVALID: 409,
  GOVERNANCE_TASK_ALREADY_CLAIMED: 409,
  GOVERNANCE_REPORT_PACK_EXPIRED: 409,
  GOVERNANCE_EXACT_PLANE_REPOSITORY_UNAVAILABLE: 503,
};

/** Map only known domain failures; programming and infrastructure errors stay 500s. */
export function governanceHttpError(error: unknown): unknown {
  if (error instanceof HttpError) return error;
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    typeof error.code !== "string"
  )
    return error;
  if ("constraint" in error && typeof error.constraint === "string") {
    if (
      error.code === "23505" &&
      [
        "cycle_run_code_uq",
        "cycle_run_idempotency_uq",
        "cycle_certification_coordinate_uq",
        "cycle_deviation_carry_idempotency_uq",
        "legal_hold_code_uq",
        "legal_hold_manifest_resource_uq",
        "report_pack_code_uq",
      ].includes(error.constraint)
    ) {
      return new HttpError(
        409,
        "GOVERNANCE_CONFLICT",
        "Governance record already exists",
      );
    }
    if (
      error.code === "23503" &&
      [
        "cycle_run_owner_fk",
        "cycle_task_owner_fk",
        "legal_hold_owner_fk",
      ].includes(error.constraint)
    ) {
      return invalidRequest("Owner principal is unavailable in this tenant");
    }
  }
  const status = statuses[error.code];
  return status ? new HttpError(status, error.code, error.code) : error;
}
