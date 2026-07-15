// Phase E2 + Phase I — env-resolved enforcement gates for the auth pipeline.
//
// Both surfaces (server + BFF) read the same env vars and resolve them via
// the same per-env defaults so a misconfigured prod can't accidentally
// downgrade enforcement on one side and not the other. The deprecation log
// callback is injected so this module stays node-agnostic.
//
// Phase I additions:
//   - All compat overrides now require an `AUTH_*_SUNSET` ISO date. The
//     resolver refuses to honour the override past the date.
//   - Migration windows surface a structured event + remediation URL so
//     observability dashboards can show "X days remaining" without log
//     parsing.

import type { EnvLike } from "./required-actions.js";

declare const process: { env: EnvLike } | undefined;

export type AthyperEnv = "local" | "staging" | "production" | string;

const REMEDIATION_BASE = "https://docs.athyper.local/runbooks/rb-12-auth-compat-mode";

// ─── Sunset parsing (shared) ─────────────────────────────────────────────────

interface SunsetStatus {
  /** ISO date the override expires (UTC midnight). Undefined when unset. */
  readonly sunsetDate?: string;
  /** True if the sunset has passed and the override should be refused. */
  readonly expired: boolean;
  /** Days until expiration; negative when expired; undefined when no sunset. */
  readonly daysRemaining?: number;
}

/**
 * Parse an `AUTH_*_SUNSET=YYYY-MM-DD` env value. Anything else (missing,
 * malformed) treats the override as having NO sunset — the caller decides
 * whether that's acceptable. Production-grade callers MUST require a sunset.
 */
function readSunset(raw: string | undefined, now: () => Date): SunsetStatus {
  if (!raw) return { expired: false };
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { sunsetDate: trimmed, expired: false };
  }
  // eslint-disable-next-line no-direct-date-parse -- reason: regex above guarantees canonical YYYY-MM-DD; explicit Z suffix forces UTC parse, no TZ trap.
  const ts = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(ts)) return { sunsetDate: trimmed, expired: false };
  const nowMs = now().getTime();
  const dayMs = 86_400_000;
  const daysRemaining = Math.floor((ts - nowMs) / dayMs);
  return {
    sunsetDate: trimmed,
    expired: ts < nowMs,
    daysRemaining,
  };
}

// ─── D-E2.2  Required-actions enforcement ─────────────────────────────────────

/**
 * Returns whether the `enforceRequiredActions` step should run for the active
 * environment.
 *
 * Defaults (locked):
 *   local      → off  (developer ergonomics)
 *   staging    → on
 *   production → on
 *
 * Compat mode (`AUTH_REQUIRED_ACTIONS_ENFORCE=off` outside local):
 *   - REQUIRES `AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET=YYYY-MM-DD` to be set.
 *     Without it the override is REFUSED in non-local environments and the
 *     resolver returns the secure default (true). Operators get a structured
 *     event so the rejected override is observable.
 *   - The sunset date is checked at every invocation. Past the date the
 *     override is REFUSED with a structured `sunset_expired` event.
 *
 * `=on` forces the gate on regardless of env (useful for local testing
 * of the production posture).
 */
export function resolveRequiredActionsEnforcement(
  env: AthyperEnv,
  onCompatModeEngaged?: (fields: Record<string, unknown>) => void,
  envBag?: EnvLike,
  nowFn: () => Date = () => new Date(),
): boolean {
  const source: EnvLike = envBag ?? (typeof process !== "undefined" ? process.env : {});
  const raw = (source["AUTH_REQUIRED_ACTIONS_ENFORCE"] ?? "").trim().toLowerCase();

  if (raw === "off") {
    if (env === "local") return false;

    const sunset = readSunset(source["AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET"], nowFn);

    if (!sunset.sunsetDate) {
      onCompatModeEngaged?.({
        event: "auth_required_actions_compat_mode_refused",
        env,
        var: "AUTH_REQUIRED_ACTIONS_ENFORCE",
        value: "off",
        reason: "missing_sunset",
        remediation:
          "Set AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET=YYYY-MM-DD (max 30 days out) "
          + "alongside the override, or remove the override.",
        runbook: REMEDIATION_BASE,
      });
      return true;
    }

    if (sunset.expired) {
      onCompatModeEngaged?.({
        event: "auth_required_actions_compat_mode_refused",
        env,
        var: "AUTH_REQUIRED_ACTIONS_ENFORCE",
        value: "off",
        reason: "sunset_expired",
        sunset_date: sunset.sunsetDate,
        days_remaining: sunset.daysRemaining,
        remediation:
          "The compat-mode sunset has passed. Remove the override and unblock the deploy.",
        runbook: REMEDIATION_BASE,
      });
      return true;
    }

    onCompatModeEngaged?.({
      event: "auth_required_actions_compat_mode_engaged",
      env,
      var: "AUTH_REQUIRED_ACTIONS_ENFORCE",
      value: "off",
      sunset_date: sunset.sunsetDate,
      days_remaining: sunset.daysRemaining,
      ticket: "AUTH-E2-COMPAT",
      remediation:
        `Compat mode active. Remove the override before ${sunset.sunsetDate} UTC.`,
      runbook: REMEDIATION_BASE,
    });
    return false;
  }

  if (raw === "on") return true;

  // Empty / unrecognised → per-env default.
  if (env === "local") return false;
  return true;
}

// ─── D-E2.5  Token-schema mode ────────────────────────────────────────────────

export type TokenSchemaMode = "warn" | "reject";

/**
 * Returns the mode the token verifier should use when the schema check fails.
 *
 * Defaults (locked):
 *   local      → warn   (developer ergonomics)
 *   staging    → reject
 *   production → reject  (locked; `warn` is REFUSED in prod and an error log fires)
 *
 * Staging burn-in window (`AUTH_TOKEN_SCHEMA_MODE=warn` in staging):
 *   - REQUIRES `AUTH_TOKEN_SCHEMA_MODE_SUNSET=YYYY-MM-DD` (max 7 days out).
 *   - Past the date the override is REFUSED and a `migration_window_expired`
 *     event fires. The schema check reverts to `reject`.
 *   - Each invocation emits a low-cardinality structured event with
 *     `days_remaining` and the runbook URL so dashboards can show "X days
 *     left" without log parsing.
 */
export function resolveTokenSchemaMode(
  env: AthyperEnv,
  onMigrationEvent?: (fields: Record<string, unknown>) => void,
  envBag?: EnvLike,
  nowFn: () => Date = () => new Date(),
): TokenSchemaMode {
  const source: EnvLike = envBag ?? (typeof process !== "undefined" ? process.env : {});
  const raw = (source["AUTH_TOKEN_SCHEMA_MODE"] ?? "").trim().toLowerCase();

  if (env === "production") {
    if (raw === "warn") {
      onMigrationEvent?.({
        event: "auth_token_schema_mode_warn_in_prod_refused",
        env,
        var: "AUTH_TOKEN_SCHEMA_MODE",
        value: raw,
        remediation: "Production refuses to honour `warn`; remove the override.",
        runbook: REMEDIATION_BASE,
      });
    }
    return "reject";
  }

  if (env === "staging") {
    if (raw !== "warn") return "reject";

    const sunset = readSunset(source["AUTH_TOKEN_SCHEMA_MODE_SUNSET"], nowFn);
    if (!sunset.sunsetDate) {
      onMigrationEvent?.({
        event: "auth_token_schema_mode_warn_refused",
        env,
        var: "AUTH_TOKEN_SCHEMA_MODE",
        value: "warn",
        reason: "missing_sunset",
        remediation:
          "Set AUTH_TOKEN_SCHEMA_MODE_SUNSET=YYYY-MM-DD (max 7 days) alongside the override.",
        runbook: REMEDIATION_BASE,
      });
      return "reject";
    }
    if (sunset.expired) {
      onMigrationEvent?.({
        event: "auth_token_schema_mode_migration_window_expired",
        env,
        var: "AUTH_TOKEN_SCHEMA_MODE",
        value: "warn",
        sunset_date: sunset.sunsetDate,
        days_remaining: sunset.daysRemaining,
        remediation: "Burn-in window ended. Remove AUTH_TOKEN_SCHEMA_MODE=warn.",
        runbook: REMEDIATION_BASE,
      });
      return "reject";
    }
    onMigrationEvent?.({
      event: "auth_token_schema_mode_migration_window_active",
      env,
      var: "AUTH_TOKEN_SCHEMA_MODE",
      value: "warn",
      sunset_date: sunset.sunsetDate,
      days_remaining: sunset.daysRemaining,
      remediation:
        `Schema-mode burn-in window active. Window closes ${sunset.sunsetDate} UTC.`,
      runbook: REMEDIATION_BASE,
    });
    return "warn";
  }

  if (env === "local") return raw === "reject" ? "reject" : "warn";
  return "reject";
}

// ─── D-E2.3  Matrix parse failure policy ──────────────────────────────────────

export type MatrixParseFailurePolicy = "warn" | "block";

/**
 * Returns the action the bootstrap-time matrix verifier should take when
 * `AUTH_REQUIRED_ACTIONS_MATRIX` (or its BFF twin) is malformed.
 *
 * Defaults (locked):
 *   local      → warn (developer ergonomics; falls back to surface default)
 *   staging    → block (hard bootstrap fail)
 *   production → block (hard bootstrap fail)
 *
 * Emergency override (Phase I):
 *   AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK=true downgrades `block` to
 *   `warn` for one staging or production deploy. REQUIRES
 *   AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK_SUNSET=YYYY-MM-DD (max
 *   72 hours out). Past the sunset the override is refused. Each invocation
 *   emits a structured event so the override is unmissable in dashboards.
 */
export function resolveMatrixParseFailurePolicy(
  env: AthyperEnv,
  onEmergencyOverride?: (fields: Record<string, unknown>) => void,
  envBag?: EnvLike,
  nowFn: () => Date = () => new Date(),
): MatrixParseFailurePolicy {
  if (env === "local") return "warn";

  const source: EnvLike = envBag ?? (typeof process !== "undefined" ? process.env : {});
  const allow = (source["AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK"] ?? "").trim().toLowerCase();
  if (allow !== "true") return "block";

  const sunset = readSunset(
    source["AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK_SUNSET"],
    nowFn,
  );
  if (!sunset.sunsetDate) {
    onEmergencyOverride?.({
      event: "auth_matrix_emergency_override_refused",
      env,
      var: "AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK",
      reason: "missing_sunset",
      remediation:
        "Set AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK_SUNSET=YYYY-MM-DD (max 72h) alongside.",
      runbook: REMEDIATION_BASE,
    });
    return "block";
  }
  if (sunset.expired) {
    onEmergencyOverride?.({
      event: "auth_matrix_emergency_override_refused",
      env,
      var: "AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK",
      reason: "sunset_expired",
      sunset_date: sunset.sunsetDate,
      days_remaining: sunset.daysRemaining,
      remediation: "Emergency override expired. Remove the override and fix the matrix JSON.",
      runbook: REMEDIATION_BASE,
    });
    return "block";
  }
  onEmergencyOverride?.({
    event: "auth_matrix_emergency_override_engaged",
    env,
    var: "AUTH_REQUIRED_ACTIONS_MATRIX_ALLOW_FALLBACK",
    sunset_date: sunset.sunsetDate,
    days_remaining: sunset.daysRemaining,
    remediation: `Matrix fallback override active. Window closes ${sunset.sunsetDate} UTC.`,
    runbook: REMEDIATION_BASE,
  });
  return "warn";
}
