// server/src/kernel/auth-flag-validator.ts
//
// Phase C — Bootstrap-time auth flag posture validator.
//
// The audit flagged a real ops risk: every hardening control is gated by an
// env flag with a back-compat default of "off". Production can silently
// remain in legacy posture if the rollout step is missed during promotion.
// This module codifies the cross-flag invariants and refuses to start the
// server when a `production` env tries to launch in a knowingly unsafe
// configuration.
//
// Invariants enforced:
//
//   R1  AUTH_PLATFORM_CONTEXT_GATE=on requires AUTH_CLAIM_FIRST_CONTEXT in
//       {shadow, on}. Otherwise the gate calls the cross-check pipeline but
//       no mismatches are detected (every check returns ok). Treat as error
//       in any env because there is no scenario where you want the gate
//       running without the cross-check.
//
//   R2  Production envs MUST have AUTH_CLAIM_FIRST_CONTEXT=on. shadow is
//       observation-only; off is legacy. Either is fatal in prod.
//
//   R3  Production envs MUST have AUTH_BFF_REQUIRED_ACTIONS_BLOCK in
//       {on, undefined}. Explicit off is dev-only.
//
//   R4  AUTH_VERIFY_REQUIRE_PLANE=on requires every realm in kernelConfig
//       to declare a non-empty allowedAzp array. Otherwise plane binding
//       is unenforceable downstream. Error in prod, warn in staging.
//
//   R5  AUTH_REQUIRED_ACTIONS_MATRIX, when set, must be parseable JSON
//       and shaped as Record<string, string[]>. Warn (not fatal) — the
//       runtime falls back to the built-in default on bad config.
//
//   R6  AUTH_ROLE_RECHECK_INTERVAL_S, when set, must be a non-negative
//       finite integer. Warn (not fatal) — the runtime clamps to default.
//
//   R7  Production envs MUST have AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS=on
//       when AUTH_PLATFORM_CONTEXT_GATE=on. Inconsistent enforcement of
//       required-actions between BFF / API gateway is exactly the gap the
//       prior audit caught (Finding 2). Warn in staging; error in prod.
//
// Output:
//   - warnings  →  logger.warn + counter `auth_flag_posture_warning_total{rule, severity}`
//   - errors    →  throw an Error so bootstrap aborts and the orchestrator
//                  restarts (or, in K8s, marks the pod as CrashLoopBackOff
//                  so the bad deploy is obvious in dashboards).

import type { ResolvedKernelConfig } from "../kernel-config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ServerEnv = "local" | "staging" | "production";

/**
 * Trimmed snapshot of all auth-related env vars read by the runtime + BFF.
 * Pure data so unit tests can construct synthetic postures without touching
 * process.env.
 */
export interface AuthFlagPosture {
  readonly serverEnv: ServerEnv;

  readonly AUTH_CLAIM_FIRST_CONTEXT: "off" | "shadow" | "on";
  readonly AUTH_PLATFORM_CONTEXT_GATE: "off" | "on";
  readonly AUTH_VERIFY_REQUIRE_PLANE: "off" | "on";
  readonly AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "off" | "on";
  readonly AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "off" | "on";

  readonly AUTH_REQUIRED_ACTIONS_MATRIX_RAW: string | undefined;
  readonly AUTH_ROLE_RECHECK_INTERVAL_S_RAW: string | undefined;
  /** Phase E2 (D-E2.5) — controls how the verifier handles malformed tokens. */
  readonly AUTH_TOKEN_SCHEMA_MODE_RAW: string | undefined;
}

export type PostureSeverity = "warning" | "error";

export interface PostureViolation {
  readonly rule: string;
  readonly severity: PostureSeverity;
  readonly message: string;
  readonly detail?: Record<string, unknown>;
}

export interface ValidatePostureResult {
  readonly warnings: readonly PostureViolation[];
  readonly errors: readonly PostureViolation[];
}

// ─── Reader (env → posture) ──────────────────────────────────────────────────

function normalize3(raw: string | undefined): "off" | "shadow" | "on" {
  const v = (raw ?? "off").toLowerCase();
  return v === "shadow" || v === "on" ? v : "off";
}

function normalize2(
  raw: string | undefined,
  defaultValue: "off" | "on" = "off",
): "off" | "on" {
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() === "on" ? "on" : "off";
}

/**
 * Read all auth flags off the supplied env (defaults to process.env).
 *
 * Phase H/F2 — the runtime resolves required-actions enforcement via the
 * shared `resolveRequiredActionsEnforcement` helper (env-gates module). The
 * validator computes the SAME resolution so R7 doesn't false-positive when
 * `AUTH_REQUIRED_ACTIONS_ENFORCE` is unset in staging / production (where the
 * default is "on") and so R3 / R7 stay aligned with the runtime.
 */
export function readAuthFlagPosture(
  serverEnv: ServerEnv,
  env: NodeJS.ProcessEnv = process.env,
): AuthFlagPosture {
  // Mirror resolveRequiredActionsEnforcement: off in local default, on
  // elsewhere; `=off` explicit is honoured everywhere (compat path).
  const enforceRaw = (env.AUTH_REQUIRED_ACTIONS_ENFORCE ?? "").toLowerCase();
  let verifyEnforce: "off" | "on";
  if (enforceRaw === "on") verifyEnforce = "on";
  else if (enforceRaw === "off") verifyEnforce = "off";
  else verifyEnforce = serverEnv === "local" ? "off" : "on";

  return {
    serverEnv,
    AUTH_CLAIM_FIRST_CONTEXT: normalize3(env.AUTH_CLAIM_FIRST_CONTEXT),
    AUTH_PLATFORM_CONTEXT_GATE: normalize2(env.AUTH_PLATFORM_CONTEXT_GATE, "off"),
    AUTH_VERIFY_REQUIRE_PLANE: normalize2(env.AUTH_VERIFY_REQUIRE_PLANE, "off"),
    AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: verifyEnforce,
    // BFF default is "on" — only an explicit "off" relaxes; matches auth-bff/src/index.ts
    AUTH_BFF_REQUIRED_ACTIONS_BLOCK: normalize2(env.AUTH_BFF_REQUIRED_ACTIONS_BLOCK, "on"),
    AUTH_REQUIRED_ACTIONS_MATRIX_RAW: env.AUTH_REQUIRED_ACTIONS_MATRIX,
    AUTH_ROLE_RECHECK_INTERVAL_S_RAW: env.AUTH_ROLE_RECHECK_INTERVAL_S,
    AUTH_TOKEN_SCHEMA_MODE_RAW: env.AUTH_TOKEN_SCHEMA_MODE,
  };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

interface Rule {
  readonly id: string;
  readonly check: (
    posture: AuthFlagPosture,
    kernelConfig: ResolvedKernelConfig | null,
  ) => PostureViolation | null;
}

function violation(
  rule: string,
  severity: PostureSeverity,
  message: string,
  detail?: Record<string, unknown>,
): PostureViolation {
  return { rule, severity, message, ...(detail ? { detail } : {}) };
}

const R1_GATE_REQUIRES_CROSSCHECK: Rule = {
  id: "R1_GATE_REQUIRES_CROSSCHECK",
  check: (p) => {
    if (
      p.AUTH_PLATFORM_CONTEXT_GATE === "on"
      && p.AUTH_CLAIM_FIRST_CONTEXT === "off"
    ) {
      return violation(
        "R1_GATE_REQUIRES_CROSSCHECK",
        "error",
        "AUTH_PLATFORM_CONTEXT_GATE=on but AUTH_CLAIM_FIRST_CONTEXT=off. "
        + "The gate calls the cross-check pipeline but no mismatches are detected. "
        + "Set AUTH_CLAIM_FIRST_CONTEXT to shadow or on.",
        { gate: p.AUTH_PLATFORM_CONTEXT_GATE, claimFirst: p.AUTH_CLAIM_FIRST_CONTEXT },
      );
    }
    return null;
  },
};

const R2_PROD_CLAIM_FIRST_ON: Rule = {
  id: "R2_PROD_CLAIM_FIRST_ON",
  check: (p) => {
    if (p.serverEnv !== "production") return null;
    if (p.AUTH_CLAIM_FIRST_CONTEXT === "on") return null;
    return violation(
      "R2_PROD_CLAIM_FIRST_ON",
      "error",
      `Production env must have AUTH_CLAIM_FIRST_CONTEXT=on; saw "${p.AUTH_CLAIM_FIRST_CONTEXT}". `
      + "shadow is observation-only and off is legacy posture.",
      { claimFirst: p.AUTH_CLAIM_FIRST_CONTEXT },
    );
  },
};

const R3_PROD_BFF_BLOCK_ON: Rule = {
  id: "R3_PROD_BFF_BLOCK_ON",
  check: (p) => {
    if (p.serverEnv !== "production") return null;
    if (p.AUTH_BFF_REQUIRED_ACTIONS_BLOCK === "on") return null;
    return violation(
      "R3_PROD_BFF_BLOCK_ON",
      "error",
      "Production env must not set AUTH_BFF_REQUIRED_ACTIONS_BLOCK=off. "
      + "Cookie-based sessions would silently bypass the pending-action gate.",
      { bffBlock: p.AUTH_BFF_REQUIRED_ACTIONS_BLOCK },
    );
  },
};

const R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP: Rule = {
  id: "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP",
  check: (p, kernelConfig) => {
    if (p.AUTH_VERIFY_REQUIRE_PLANE !== "on") return null;
    if (!kernelConfig) {
      // No kernel config → no way to verify allowedAzp; warn only.
      return violation(
        "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP",
        "warning",
        "AUTH_VERIFY_REQUIRE_PLANE=on but no kernel config loaded; "
        + "cannot verify allowedAzp coverage on realms.",
      );
    }
    const offenders: string[] = [];
    for (const [realmKey, realm] of Object.entries(kernelConfig.iam.realms)) {
      const allowed = realm.iam.allowedAzp;
      if (!Array.isArray(allowed) || allowed.length === 0) {
        offenders.push(realmKey);
      }
    }
    if (offenders.length === 0) return null;
    return violation(
      "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP",
      p.serverEnv === "production" ? "error" : "warning",
      `AUTH_VERIFY_REQUIRE_PLANE=on but realm(s) lack allowedAzp: ${offenders.join(", ")}. `
      + "Without an allowlist the verify endpoint may admit unintended client tokens.",
      { offenders },
    );
  },
};

const R5_MATRIX_PARSEABLE: Rule = {
  id: "R5_MATRIX_PARSEABLE",
  check: (p) => {
    if (!p.AUTH_REQUIRED_ACTIONS_MATRIX_RAW) return null;
    // Phase E2 (D-E2.3): elevate to error outside local — a malformed prod
    // matrix is a config bug we must catch at boot, not paper over with the
    // built-in default. Local stays warn so devs can iterate.
    const severity: PostureSeverity = p.serverEnv === "local" ? "warning" : "error";
    try {
      const parsed = JSON.parse(p.AUTH_REQUIRED_ACTIONS_MATRIX_RAW) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return violation(
          "R5_MATRIX_PARSEABLE",
          severity,
          "AUTH_REQUIRED_ACTIONS_MATRIX is not a JSON object.",
        );
      }
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) {
          return violation(
            "R5_MATRIX_PARSEABLE",
            severity,
            `AUTH_REQUIRED_ACTIONS_MATRIX entry "${k}" is not string[].`,
          );
        }
      }
      return null;
    } catch (err) {
      return violation(
        "R5_MATRIX_PARSEABLE",
        severity,
        "AUTH_REQUIRED_ACTIONS_MATRIX is not parseable JSON.",
        { err: err instanceof Error ? err.message : String(err) },
      );
    }
  },
};

const R6_RECHECK_INTERVAL_VALID: Rule = {
  id: "R6_RECHECK_INTERVAL_VALID",
  check: (p) => {
    const raw = p.AUTH_ROLE_RECHECK_INTERVAL_S_RAW;
    if (raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return violation(
        "R6_RECHECK_INTERVAL_VALID",
        "warning",
        `AUTH_ROLE_RECHECK_INTERVAL_S=${raw} is not a non-negative integer; runtime falls back to default 600s.`,
        { raw },
      );
    }
    return null;
  },
};

// ─── Phase E2 — D-E2.5 / D-E2.6 / D-E2.9 rules ───────────────────────────────

const R8_TOKEN_SCHEMA_MODE_VALID: Rule = {
  id: "R8_TOKEN_SCHEMA_MODE_VALID",
  check: (p) => {
    const raw = p.AUTH_TOKEN_SCHEMA_MODE_RAW;
    if (raw === undefined || raw === "") return null;
    const v = raw.toLowerCase();
    if (v !== "warn" && v !== "reject") {
      return violation(
        "R8_TOKEN_SCHEMA_MODE_VALID",
        "error",
        `AUTH_TOKEN_SCHEMA_MODE="${raw}" is not a valid mode. Use "warn" or "reject".`,
        { raw },
      );
    }
    // Production REFUSES warn; the runtime resolver downgrades silently but
    // we error at boot so the operator sees the misconfiguration.
    if (v === "warn" && p.serverEnv === "production") {
      return violation(
        "R8_TOKEN_SCHEMA_MODE_VALID",
        "error",
        "AUTH_TOKEN_SCHEMA_MODE=warn is refused in production. Remove the override or set =reject.",
        { raw, env: p.serverEnv },
      );
    }
    return null;
  },
};

const R9_DEFAULT_REALM_REQUIRED: Rule = {
  id: "R9_DEFAULT_REALM_REQUIRED",
  check: (_p, kernelConfig) => {
    if (!kernelConfig) return null;  // legacy single-realm path uses config.iam.realm
    const key = kernelConfig.iam.defaultRealmKey;
    if (typeof key === "string" && key.trim().length > 0) return null;
    return violation(
      "R9_DEFAULT_REALM_REQUIRED",
      "error",
      "kernelConfig.iam.defaultRealmKey is empty. Refusing to fall back to an implicit realm key.",
      {
        remediation: "Set iam.defaultRealmKey in stack/config/apps/kernel.config.<env>.parameter.json.",
      },
    );
  },
};

const R10_REALM_KCBASEURL_PAIRED: Rule = {
  id: "R10_REALM_KCBASEURL_PAIRED",
  check: (_p, kernelConfig) => {
    if (!kernelConfig) return null;
    const offenders: string[] = [];
    for (const [key, realm] of Object.entries(kernelConfig.iam.realms)) {
      const issuerUrl = realm.iam.issuerUrl;
      if (typeof issuerUrl !== "string" || issuerUrl.trim().length === 0) {
        offenders.push(key);
      }
    }
    if (offenders.length === 0) return null;
    return violation(
      "R10_REALM_KCBASEURL_PAIRED",
      "error",
      `Realms missing iam.issuerUrl: ${offenders.join(", ")}. Every realm must declare its own KC base URL.`,
      { offenders },
    );
  },
};

const R7_PROD_VERIFY_REQUIRED_ACTIONS: Rule = {
  id: "R7_PROD_VERIFY_REQUIRED_ACTIONS",
  check: (p) => {
    if (p.AUTH_PLATFORM_CONTEXT_GATE !== "on") return null;
    if (p.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS === "on") return null;
    // Gate is on but the gateway-facing /api/auth/verify is NOT enforcing
    // required actions. Service-token integrations can bypass the matrix
    // via the verify endpoint while user-facing routes are gated. Warn in
    // staging, error in production.
    return violation(
      "R7_PROD_VERIFY_REQUIRED_ACTIONS",
      p.serverEnv === "production" ? "error" : "warning",
      "AUTH_PLATFORM_CONTEXT_GATE=on but AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS!=on. "
      + "Required-actions enforcement is asymmetric between the API gate and /api/auth/verify; "
      + "user-facing routes are blocked but gateway-relayed tokens are not.",
      {
        gate: p.AUTH_PLATFORM_CONTEXT_GATE,
        verify: p.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS,
      },
    );
  },
};

// Phase E2 additions: R8 (token schema mode), R9 (default realm required),
// R10 (every realm has issuerUrl). R5 promoted from warning to error outside
// local (D-E2.3). Existing R1-R7 unchanged.
const RULES: readonly Rule[] = [
  R1_GATE_REQUIRES_CROSSCHECK,
  R2_PROD_CLAIM_FIRST_ON,
  R3_PROD_BFF_BLOCK_ON,
  R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP,
  R5_MATRIX_PARSEABLE,
  R6_RECHECK_INTERVAL_VALID,
  R7_PROD_VERIFY_REQUIRED_ACTIONS,
  R8_TOKEN_SCHEMA_MODE_VALID,
  R9_DEFAULT_REALM_REQUIRED,
  R10_REALM_KCBASEURL_PAIRED,
];

// ─── Public entry ────────────────────────────────────────────────────────────

export function validateAuthFlagPosture(
  posture: AuthFlagPosture,
  kernelConfig: ResolvedKernelConfig | null,
): ValidatePostureResult {
  const warnings: PostureViolation[] = [];
  const errors: PostureViolation[] = [];
  for (const rule of RULES) {
    const result = rule.check(posture, kernelConfig);
    if (!result) continue;
    if (result.severity === "error") errors.push(result);
    else warnings.push(result);
  }
  return { warnings, errors };
}

// ─── Failure banner (Phase H/F6) ─────────────────────────────────────────────

const RULE_REMEDIATION: Record<string, string> = {
  R1_GATE_REQUIRES_CROSSCHECK:
    "Set AUTH_CLAIM_FIRST_CONTEXT to 'shadow' (observe drift) or 'on' (enforce). "
    + "AUTH_PLATFORM_CONTEXT_GATE=on requires the cross-check to actually run.",
  R2_PROD_CLAIM_FIRST_ON:
    "Set AUTH_CLAIM_FIRST_CONTEXT=on. Production must enforce claim/header cross-checks.",
  R3_PROD_BFF_BLOCK_ON:
    "Unset AUTH_BFF_REQUIRED_ACTIONS_BLOCK or set it to 'on'. "
    + "Cookie-based traffic must respect pending required actions in production.",
  R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP:
    "Add allowedAzp arrays to every realm in the kernel config. "
    + "AUTH_VERIFY_REQUIRE_PLANE=on requires each realm to declare its accepted *-web client ids.",
  R5_MATRIX_PARSEABLE:
    "Fix AUTH_REQUIRED_ACTIONS_MATRIX to be a JSON object of "
    + "{ ACTION: string[] } shape; current value falls back to the built-in default.",
  R6_RECHECK_INTERVAL_VALID:
    "Set AUTH_ROLE_RECHECK_INTERVAL_S to a non-negative integer "
    + "(or unset for the default 600s).",
  R7_PROD_VERIFY_REQUIRED_ACTIONS:
    "Set AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS=on. "
    + "When the API gate is on, /api/auth/verify must enforce required-actions symmetrically.",
};

function buildPostureFailureBanner(
  serverEnv: ServerEnv,
  posture: AuthFlagPosture,
  errors: readonly PostureViolation[],
): string {
  const lines = [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  AUTH FLAG POSTURE VALIDATION FAILED — bootstrap aborted",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `  env: ${serverEnv}`,
    `  errors: ${errors.length}`,
    "",
    "  Resolved posture:",
    `    AUTH_CLAIM_FIRST_CONTEXT              = ${posture.AUTH_CLAIM_FIRST_CONTEXT}`,
    `    AUTH_PLATFORM_CONTEXT_GATE            = ${posture.AUTH_PLATFORM_CONTEXT_GATE}`,
    `    AUTH_VERIFY_REQUIRE_PLANE             = ${posture.AUTH_VERIFY_REQUIRE_PLANE}`,
    `    AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS  = ${posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS}`,
    `    AUTH_BFF_REQUIRED_ACTIONS_BLOCK       = ${posture.AUTH_BFF_REQUIRED_ACTIONS_BLOCK}`,
    "",
    "  Failing rules:",
  ];
  for (const e of errors) {
    lines.push(`    [${e.rule}]`);
    lines.push(`      ${e.message}`);
    const remediation = RULE_REMEDIATION[e.rule];
    if (remediation) lines.push(`      Fix: ${remediation}`);
  }
  lines.push("");
  lines.push(
    "  See `auth_flag_posture_warning_total{severity=\"error\"}` for dashboards.",
  );
  lines.push(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  return lines.join("\n");
}

/**
 * Convenience wrapper for bootstrap: reads the posture, validates, logs
 * warnings + counter, throws on errors. Returns the posture for downstream
 * consumers that want to log the resolved values.
 */
export function applyAuthFlagPostureValidation(
  serverEnv: ServerEnv,
  kernelConfig: ResolvedKernelConfig | null,
  hooks: {
    logger: {
      info(event: string, fields?: Record<string, unknown>): void;
      warn(event: string, fields?: Record<string, unknown>): void;
      error(event: string, fields?: Record<string, unknown>): void;
    };
    recordWarning?: (rule: string, severity: PostureSeverity) => void;
  },
): AuthFlagPosture {
  const posture = readAuthFlagPosture(serverEnv);
  const result = validateAuthFlagPosture(posture, kernelConfig);

  for (const w of result.warnings) {
    hooks.logger.warn("auth_flag_posture_warning", {
      rule: w.rule,
      message: w.message,
      ...(w.detail ? { detail: w.detail } : {}),
    });
    hooks.recordWarning?.(w.rule, "warning");
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) {
      hooks.logger.error("auth_flag_posture_error", {
        rule: e.rule,
        message: e.message,
        ...(e.detail ? { detail: e.detail } : {}),
      });
      hooks.recordWarning?.(e.rule, "error");
    }
    // Phase H/F6 — multi-line banner with the resolved posture + per-rule
    // remediation so on-call doesn't have to grep the structured log to
    // see why bootstrap aborted. Keeps the rule ids stable so dashboards /
    // runbooks can pattern-match.
    throw new Error(buildPostureFailureBanner(serverEnv, posture, result.errors));
  }

  hooks.logger.info("auth_flag_posture_ok", {
    serverEnv,
    AUTH_CLAIM_FIRST_CONTEXT: posture.AUTH_CLAIM_FIRST_CONTEXT,
    AUTH_PLATFORM_CONTEXT_GATE: posture.AUTH_PLATFORM_CONTEXT_GATE,
    AUTH_VERIFY_REQUIRE_PLANE: posture.AUTH_VERIFY_REQUIRE_PLANE,
    AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS,
    AUTH_BFF_REQUIRED_ACTIONS_BLOCK: posture.AUTH_BFF_REQUIRED_ACTIONS_BLOCK,
    warnings: result.warnings.length,
  });

  return posture;
}
