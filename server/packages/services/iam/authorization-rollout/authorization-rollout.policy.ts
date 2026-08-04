import {
  AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE,
  AUTHORIZATION_ROLLOUT_MODES,
  AUTHORIZATION_ROLLOUT_PLANES,
  type AuthorizationRolloutApproval,
  type AuthorizationRolloutAuthority,
  type AuthorizationRolloutContext,
  type AuthorizationRolloutMode,
  type AuthorizationRolloutPlane,
  type AuthorizationRolloutRule,
  type AuthorizationRolloutSelection,
  type AuthorizationRolloutSnapshot,
} from "./authorization-rollout.types.js";

export type AuthorizationRolloutPolicyValidationCode =
  | "NOT_AN_OBJECT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_PLANE"
  | "INVALID_AUTHORITY"
  | "CROSS_PLANE_AUTHORITY"
  | "INVALID_REVISION"
  | "NON_LEGACY_DEFAULT"
  | "INVALID_RULES"
  | "DUPLICATE_RULE"
  | "INVALID_RULE"
  | "INVALID_MODE"
  | "INVALID_PERMISSION"
  | "WILDCARD_PERMISSION"
  | "INVALID_SELECTOR"
  | "INVALID_APPROVAL"
  | "INVALID_CERTIFICATION"
  | "INVALID_TIME_WINDOW";

export class AuthorizationRolloutPolicyValidationError extends Error {
  readonly code: AuthorizationRolloutPolicyValidationCode;

  constructor(
    code: AuthorizationRolloutPolicyValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationRolloutPolicyValidationError";
    this.code = code;
  }
}

const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "planeKey",
  "authority",
  "revision",
  "defaultMode",
  "rules",
]);

const RULE_KEYS = new Set([
  "id",
  "cohortCode",
  "mode",
  "permissionCodes",
  "tenantIds",
  "principalIds",
  "effectiveFrom",
  "expiresAt",
  "approval",
]);

const APPROVAL_KEYS = new Set([
  "approvedBy",
  "approvedAt",
  "ticket",
  "rollbackOwner",
  "observationWindowEndsAt",
  "goldenCorpusSha256",
  "sourceDatabaseId",
  "minimumAppliedWatermark",
]);

/**
 * Strictly parse a caller-supplied policy revision. Unknown fields are
 * rejected so a percentage/hash rollout knob cannot be smuggled into a policy
 * and silently ignored.
 */
export function parseAuthorizationRolloutSnapshot(
  input: unknown,
): AuthorizationRolloutSnapshot {
  const source = requireObject(input, "snapshot");
  requireExactKeys(source, SNAPSHOT_KEYS, "snapshot");

  if (source["schemaVersion"] !== 1) {
    throw validationError(
      "INVALID_SCHEMA_VERSION",
      "Authorization rollout schemaVersion must be 1.",
    );
  }

  const planeKey = requireEnum(
    source["planeKey"],
    AUTHORIZATION_ROLLOUT_PLANES,
    "INVALID_PLANE",
    "planeKey",
  );
  const authority = requireEnum(
    source["authority"],
    ["neon", "mesh"] as const,
    "INVALID_AUTHORITY",
    "authority",
  );
  if (AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE[planeKey] !== authority) {
    throw validationError(
      "CROSS_PLANE_AUTHORITY",
      `Plane ${planeKey} cannot load authorization rollout policy from ${authority}.`,
    );
  }

  const revision = requireNonBlank(
    source["revision"],
    "INVALID_REVISION",
    "revision",
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(revision)) {
    throw validationError(
      "INVALID_REVISION",
      "revision must be a stable token without whitespace.",
    );
  }

  if (source["defaultMode"] !== "legacy") {
    throw validationError(
      "NON_LEGACY_DEFAULT",
      "Authorization rollout defaultMode must remain legacy.",
    );
  }

  if (!Array.isArray(source["rules"])) {
    throw validationError("INVALID_RULES", "rules must be an array.");
  }

  const seenRuleIds = new Set<string>();
  const rules = source["rules"].map((value, index) => {
    const rule = parseRule(value, index);
    if (seenRuleIds.has(rule.id)) {
      throw validationError(
        "DUPLICATE_RULE",
        `Duplicate authorization rollout rule id ${rule.id}.`,
      );
    }
    seenRuleIds.add(rule.id);
    return rule;
  });

  return Object.freeze({
    schemaVersion: 1,
    planeKey,
    authority,
    revision,
    defaultMode: "legacy",
    rules: Object.freeze(rules),
  });
}

/**
 * Resolve one immutable policy snapshot. Zero or ambiguous matches select the
 * legacy evaluator. A rule is active only inside its approved time window.
 */
export function selectAuthorizationRollout(
  snapshot: AuthorizationRolloutSnapshot,
  context: AuthorizationRolloutContext,
  nowEpochMs: number,
): AuthorizationRolloutSelection {
  if (context.planeKey !== snapshot.planeKey) {
    return legacySelection(context, "context_plane_mismatch", {
      policyRevision: snapshot.revision,
    });
  }
  if (!isExactPermissionCode(context.permissionCode)) {
    return legacySelection(context, "invalid_context", {
      policyRevision: snapshot.revision,
    });
  }

  const matches = snapshot.rules.filter((rule) =>
    ruleMatches(rule, context, nowEpochMs)
  );

  if (matches.length === 0) {
    return legacySelection(context, "default_legacy", {
      policyRevision: snapshot.revision,
    });
  }
  if (matches.length !== 1) {
    return legacySelection(context, "ambiguous_match", {
      policyRevision: snapshot.revision,
    });
  }

  const rule = matches[0];
  if (!rule) {
    return legacySelection(context, "default_legacy", {
      policyRevision: snapshot.revision,
    });
  }

  return Object.freeze({
    mode: rule.mode,
    planeKey: context.planeKey,
    permissionCode: context.permissionCode,
    reason: "matched_rule",
    policyRevision: snapshot.revision,
    ruleId: rule.id,
    cohortCode: rule.cohortCode,
    certification: Object.freeze({
      goldenCorpusSha256: rule.approval.goldenCorpusSha256,
      sourceDatabaseId: rule.approval.sourceDatabaseId,
      appliedWatermark: context.certification!.appliedWatermark,
    }),
  });
}

function parseRule(input: unknown, index: number): AuthorizationRolloutRule {
  const source = requireObject(input, `rules[${index}]`);
  requireExactKeys(source, RULE_KEYS, `rules[${index}]`);

  const id = requireNonBlank(source["id"], "INVALID_RULE", `rules[${index}].id`);
  const cohortCode = requireNonBlank(
    source["cohortCode"],
    "INVALID_RULE",
    `rules[${index}].cohortCode`,
  );
  const mode = requireEnum(
    source["mode"],
    AUTHORIZATION_ROLLOUT_MODES,
    "INVALID_MODE",
    `rules[${index}].mode`,
  );
  const permissionCodes = requireStringArray(
    source["permissionCodes"],
    "INVALID_PERMISSION",
    `rules[${index}].permissionCodes`,
  );
  for (const code of permissionCodes) {
    if (!isExactPermissionCode(code)) {
      throw validationError(
        code.includes("*") || code.includes("%")
          ? "WILDCARD_PERMISSION"
          : "INVALID_PERMISSION",
        `Rule ${id} contains non-exact permission code ${JSON.stringify(code)}.`,
      );
    }
  }

  const tenantIds = optionalNonEmptyStringArray(
    source["tenantIds"],
    "INVALID_SELECTOR",
    `rules[${index}].tenantIds`,
  );
  const principalIds = optionalNonEmptyStringArray(
    source["principalIds"],
    "INVALID_SELECTOR",
    `rules[${index}].principalIds`,
  );
  const effectiveFrom = optionalDate(
    source["effectiveFrom"],
    `rules[${index}].effectiveFrom`,
  );
  const expiresAt = optionalDate(
    source["expiresAt"],
    `rules[${index}].expiresAt`,
  );
  if (
    effectiveFrom !== undefined
    && expiresAt !== undefined
    && Date.parse(expiresAt) <= Date.parse(effectiveFrom)
  ) {
    throw validationError(
      "INVALID_TIME_WINDOW",
      `Rule ${id} expiresAt must be after effectiveFrom.`,
    );
  }

  const approval = parseApproval(source["approval"], index);

  return Object.freeze({
    id,
    cohortCode,
    mode,
    permissionCodes: Object.freeze(permissionCodes),
    ...(tenantIds ? { tenantIds: Object.freeze(tenantIds) } : {}),
    ...(principalIds ? { principalIds: Object.freeze(principalIds) } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    approval,
  });
}

function parseApproval(
  input: unknown,
  ruleIndex: number,
): AuthorizationRolloutApproval {
  const source = requireObject(input, `rules[${ruleIndex}].approval`);
  requireExactKeys(source, APPROVAL_KEYS, `rules[${ruleIndex}].approval`);

  const approvedAt = requireDate(
    source["approvedAt"],
    `rules[${ruleIndex}].approval.approvedAt`,
  );
  const observationWindowEndsAt = requireDate(
    source["observationWindowEndsAt"],
    `rules[${ruleIndex}].approval.observationWindowEndsAt`,
  );
  if (Date.parse(observationWindowEndsAt) <= Date.parse(approvedAt)) {
    throw validationError(
      "INVALID_APPROVAL",
      "observationWindowEndsAt must be after approvedAt.",
    );
  }

  return Object.freeze({
    approvedBy: requireNonBlank(
      source["approvedBy"],
      "INVALID_APPROVAL",
      `rules[${ruleIndex}].approval.approvedBy`,
    ),
    approvedAt,
    ticket: requireNonBlank(
      source["ticket"],
      "INVALID_APPROVAL",
      `rules[${ruleIndex}].approval.ticket`,
    ),
    rollbackOwner: requireNonBlank(
      source["rollbackOwner"],
      "INVALID_APPROVAL",
      `rules[${ruleIndex}].approval.rollbackOwner`,
    ),
    observationWindowEndsAt,
    goldenCorpusSha256: requireSha256(
      source["goldenCorpusSha256"],
      `rules[${ruleIndex}].approval.goldenCorpusSha256`,
    ),
    sourceDatabaseId: requireUuid(
      source["sourceDatabaseId"],
      `rules[${ruleIndex}].approval.sourceDatabaseId`,
    ),
    minimumAppliedWatermark: requireWatermark(
      source["minimumAppliedWatermark"],
      `rules[${ruleIndex}].approval.minimumAppliedWatermark`,
    ),
  });
}

function ruleMatches(
  rule: AuthorizationRolloutRule,
  context: AuthorizationRolloutContext,
  nowEpochMs: number,
): boolean {
  if (!rule.permissionCodes.includes(context.permissionCode)) return false;
  // A named rule never becomes plane-global because a caller omitted the
  // cohort. Missing or mismatched cohort evidence safely selects legacy.
  if (!context.cohortCode || context.cohortCode !== rule.cohortCode) return false;
  if (rule.tenantIds && (
    !context.tenantId || !rule.tenantIds.includes(context.tenantId)
  )) return false;
  if (rule.principalIds && (
    !context.principalId || !rule.principalIds.includes(context.principalId)
  )) return false;
  const certification = context.certification;
  if (
    !certification ||
    certification.goldenCorpusSha256 !== rule.approval.goldenCorpusSha256 ||
    certification.sourceDatabaseId !== rule.approval.sourceDatabaseId ||
    !/^\d+$/.test(certification.appliedWatermark) ||
    BigInt(certification.appliedWatermark) <
      BigInt(rule.approval.minimumAppliedWatermark)
  ) return false;
  if (Date.parse(rule.approval.approvedAt) > nowEpochMs) return false;
  if (Date.parse(rule.approval.observationWindowEndsAt) <= nowEpochMs) {
    return false;
  }
  if (rule.effectiveFrom && Date.parse(rule.effectiveFrom) > nowEpochMs) {
    return false;
  }
  if (rule.expiresAt && Date.parse(rule.expiresAt) <= nowEpochMs) return false;
  return true;
}

function legacySelection(
  context: AuthorizationRolloutContext,
  reason: AuthorizationRolloutSelection["reason"],
  extras: {
    readonly policyRevision?: string;
    readonly diagnosticCode?: string;
  } = {},
): AuthorizationRolloutSelection {
  return Object.freeze({
    mode: "legacy",
    planeKey: context.planeKey,
    permissionCode: context.permissionCode,
    reason,
    ...extras,
  });
}

function requireObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("NOT_AN_OBJECT", `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw validationError(
        "UNKNOWN_FIELD",
        `${path} contains unsupported field ${JSON.stringify(key)}.`,
      );
    }
  }
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  code: AuthorizationRolloutPolicyValidationCode,
  path: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) {
    throw validationError(
      code,
      `${path} must be one of ${allowed.join(", ")}.`,
    );
  }
  return value as T[number];
}

function requireNonBlank(
  value: unknown,
  code: AuthorizationRolloutPolicyValidationCode,
  path: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw validationError(code, `${path} must be a non-blank string.`);
  }
  return value;
}

function requireStringArray(
  value: unknown,
  code: AuthorizationRolloutPolicyValidationCode,
  path: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw validationError(code, `${path} must be a non-empty string array.`);
  }
  const result = value.map((item, index) =>
    requireNonBlank(item, code, `${path}[${index}]`)
  );
  if (new Set(result).size !== result.length) {
    throw validationError(code, `${path} cannot contain duplicates.`);
  }
  return result;
}

function optionalNonEmptyStringArray(
  value: unknown,
  code: AuthorizationRolloutPolicyValidationCode,
  path: string,
): string[] | undefined {
  return value === undefined
    ? undefined
    : requireStringArray(value, code, path);
}

function requireDate(value: unknown, path: string): string {
  const text = requireNonBlank(value, "INVALID_TIME_WINDOW", path);
  if (!Number.isFinite(Date.parse(text))) {
    throw validationError(
      "INVALID_TIME_WINDOW",
      `${path} must be an ISO-8601 timestamp.`,
    );
  }
  return text;
}

function optionalDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireDate(value, path);
}

function requireSha256(value: unknown, path: string): string {
  const text = requireNonBlank(value, "INVALID_CERTIFICATION", path);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw validationError(
      "INVALID_CERTIFICATION",
      `${path} must be a lowercase SHA-256 digest.`,
    );
  }
  return text;
}

function requireUuid(value: unknown, path: string): string {
  const text = requireNonBlank(value, "INVALID_CERTIFICATION", path);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(text)
  ) {
    throw validationError(
      "INVALID_CERTIFICATION",
      `${path} must be a UUID.`,
    );
  }
  return text;
}

function requireWatermark(value: unknown, path: string): string {
  const text = requireNonBlank(value, "INVALID_CERTIFICATION", path);
  if (!/^\d+$/.test(text)) {
    throw validationError(
      "INVALID_CERTIFICATION",
      `${path} must be a non-negative integer string.`,
    );
  }
  return text;
}

function isExactPermissionCode(value: string): boolean {
  return value.trim() === value
    && value.length > 0
    && !value.includes("*")
    && !value.includes("%");
}

function validationError(
  code: AuthorizationRolloutPolicyValidationCode,
  message: string,
): AuthorizationRolloutPolicyValidationError {
  return new AuthorizationRolloutPolicyValidationError(code, message);
}
