import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SESSION_POLICY_DEFAULTS, type SessionPolicyDefaults } from "../../../packages/shared/platform-auth/session-plane/src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogSql = readFileSync(
  resolve(__dirname, "../../db/seed/platform/003_control/085_control_parameter_definition.sql"),
  "utf8",
);

const LIVE_SESSION_POLICY_ROWS = [
  ["auth.session.absolute_ttl_seconds", "absoluteTtlSeconds"],
  ["auth.idle.timeout_seconds", "idleTimeoutSeconds"],
  ["auth.idle.warning_seconds", "idleWarningSeconds"],
  ["auth.heartbeat.interval_ms", "heartbeatIntervalMs"],
  ["auth.token.client_refresh_lead_seconds", "clientRefreshBeforeExpirySeconds"],
  ["auth.token.server_refresh_buffer_seconds", "serverRefreshBufferSeconds"],
  ["auth.refresh.lock_ttl_seconds", "refreshLockTtlSeconds"],
  ["auth.refresh.lock_wait_ms", "refreshLockWaitMs"],
  ["auth.refresh.sid_rotation_grace_seconds", "refreshRotationGraceSeconds"],
  ["auth.session.expired_redirect_countdown_seconds", "expiredRedirectCountdownSeconds"],
  ["auth.mfa.pending_ttl_seconds", "mfaPendingTtlSeconds"],
] as const satisfies readonly [string, keyof SessionPolicyDefaults][];

const PRE_SESSION_POLICY_ROWS = [
  ["auth.pkce.state_ttl_seconds", "pkceStateTtlSeconds"],
] as const satisfies readonly [string, keyof SessionPolicyDefaults][];

function catalogRow(code: string): string {
  const row = catalogSql.split(/\r?\n/).find((line) => line.includes(`('${code}'`));
  if (!row) throw new Error(`Missing catalog row for ${code}`);
  return row;
}

describe("auth session policy catalog", () => {
  it("keeps live session policy rows aligned with shared session policy defaults", () => {
    for (const [code, field] of LIVE_SESSION_POLICY_ROWS) {
      const row = catalogRow(code);
      const expected = String(SESSION_POLICY_DEFAULTS[field]);

      expect(row).toContain(`'${expected}', '${expected}'`);
      expect(row).toContain('"source":"packages/shared/platform-auth/session-plane/src/index.ts"');
      expect(row).toContain(`"fallback_constant":"SESSION_POLICY_DEFAULTS.${field}"`);
    }
  });

  it("documents pre-session login policy defaults separately from live session policy", () => {
    for (const [code, field] of PRE_SESSION_POLICY_ROWS) {
      const row = catalogRow(code);
      const expected = String(SESSION_POLICY_DEFAULTS[field]);

      expect(row).toContain(`'${expected}', '${expected}'`);
      expect(row).toContain('"source":"packages/shared/platform-auth/session-plane/src/index.ts"');
      expect(row).toContain(`"fallback_constant":"SESSION_POLICY_DEFAULTS.${field}"`);
    }
  });

  it("keeps refresh, idle-warning, and lock timing invariants valid", () => {
    expect(SESSION_POLICY_DEFAULTS.clientRefreshBeforeExpirySeconds).toBeLessThan(
      SESSION_POLICY_DEFAULTS.serverRefreshBufferSeconds,
    );
    expect(SESSION_POLICY_DEFAULTS.idleWarningSeconds).toBeLessThan(SESSION_POLICY_DEFAULTS.idleTimeoutSeconds);
    expect(SESSION_POLICY_DEFAULTS.refreshLockWaitMs).toBeLessThan(
      SESSION_POLICY_DEFAULTS.refreshLockTtlSeconds * 1000,
    );
  });
});

