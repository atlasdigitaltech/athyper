// Phase E2 — env-gate resolver tests.
//
// Locks the per-env defaults that production safety relies on.

import { describe, expect, it, vi } from "vitest";

import {
  resolveMatrixParseFailurePolicy,
  resolveRequiredActionsEnforcement,
  resolveTokenSchemaMode,
} from "../env-gates.js";

// ──────────────────────────────────────────────────────────────────────────────
// D-E2.2  resolveRequiredActionsEnforcement
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveRequiredActionsEnforcement", () => {
  it("local defaults to off", () => {
    expect(resolveRequiredActionsEnforcement("local", undefined, {})).toBe(false);
  });

  it("staging defaults to on", () => {
    expect(resolveRequiredActionsEnforcement("staging", undefined, {})).toBe(true);
  });

  it("production defaults to on", () => {
    expect(resolveRequiredActionsEnforcement("production", undefined, {})).toBe(true);
  });

  it("explicit AUTH_REQUIRED_ACTIONS_ENFORCE=on forces on in local", () => {
    expect(resolveRequiredActionsEnforcement("local", undefined, {
      AUTH_REQUIRED_ACTIONS_ENFORCE: "on",
    })).toBe(true);
  });

  it("explicit AUTH_REQUIRED_ACTIONS_ENFORCE=off downgrades staging + production WHEN sunset is set", () => {
    // Phase I: sunset is required. Pick a date well in the future for the test.
    const now = () => new Date("2026-01-01T00:00:00Z");
    const env = {
      AUTH_REQUIRED_ACTIONS_ENFORCE: "off",
      AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET: "2026-01-15",
    };
    expect(resolveRequiredActionsEnforcement("staging",    undefined, env, now)).toBe(false);
    expect(resolveRequiredActionsEnforcement("production", undefined, env, now)).toBe(false);
  });

  it("REFUSES =off without a sunset and returns the secure default", () => {
    const onEvent = vi.fn();
    const result = resolveRequiredActionsEnforcement(
      "staging",
      onEvent,
      { AUTH_REQUIRED_ACTIONS_ENFORCE: "off" },
    );
    expect(result).toBe(true); // secure default returned
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      event: "auth_required_actions_compat_mode_refused",
      env: "staging",
      var: "AUTH_REQUIRED_ACTIONS_ENFORCE",
      value: "off",
      reason: "missing_sunset",
    });
  });

  it("REFUSES =off when the sunset has passed", () => {
    const onEvent = vi.fn();
    const now = () => new Date("2026-06-01T00:00:00Z");
    const result = resolveRequiredActionsEnforcement(
      "staging",
      onEvent,
      {
        AUTH_REQUIRED_ACTIONS_ENFORCE: "off",
        AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET: "2026-01-15",
      },
      now,
    );
    expect(result).toBe(true);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      event: "auth_required_actions_compat_mode_refused",
      reason: "sunset_expired",
    });
  });

  it("emits the engaged event when =off + valid sunset is honoured", () => {
    const onEvent = vi.fn();
    const now = () => new Date("2026-01-01T00:00:00Z");
    resolveRequiredActionsEnforcement(
      "staging",
      onEvent,
      {
        AUTH_REQUIRED_ACTIONS_ENFORCE: "off",
        AUTH_REQUIRED_ACTIONS_ENFORCE_SUNSET: "2026-01-15",
      },
      now,
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      event: "auth_required_actions_compat_mode_engaged",
      env: "staging",
      var: "AUTH_REQUIRED_ACTIONS_ENFORCE",
      value: "off",
      sunset_date: "2026-01-15",
    });
  });

  it("does NOT log a deprecation event for local =off", () => {
    const compat = vi.fn();
    resolveRequiredActionsEnforcement("local", compat, { AUTH_REQUIRED_ACTIONS_ENFORCE: "off" });
    expect(compat).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// D-E2.5  resolveTokenSchemaMode
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveTokenSchemaMode", () => {
  it("local defaults to warn", () => {
    expect(resolveTokenSchemaMode("local", undefined, {})).toBe("warn");
  });

  it("staging defaults to reject", () => {
    expect(resolveTokenSchemaMode("staging", undefined, {})).toBe("reject");
  });

  it("production defaults to reject", () => {
    expect(resolveTokenSchemaMode("production", undefined, {})).toBe("reject");
  });

  it("AUTH_TOKEN_SCHEMA_MODE=warn is honoured in staging WHEN sunset is set", () => {
    // Phase I: staging burn-in requires AUTH_TOKEN_SCHEMA_MODE_SUNSET=YYYY-MM-DD.
    const now = () => new Date("2026-01-01T00:00:00Z");
    expect(
      resolveTokenSchemaMode(
        "staging",
        undefined,
        { AUTH_TOKEN_SCHEMA_MODE: "warn", AUTH_TOKEN_SCHEMA_MODE_SUNSET: "2026-01-05" },
        now,
      ),
    ).toBe("warn");
  });

  it("AUTH_TOKEN_SCHEMA_MODE=warn in staging WITHOUT sunset reverts to reject", () => {
    const onEvent = vi.fn();
    const result = resolveTokenSchemaMode(
      "staging",
      onEvent,
      { AUTH_TOKEN_SCHEMA_MODE: "warn" },
    );
    expect(result).toBe("reject");
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      event: "auth_token_schema_mode_warn_refused",
      reason: "missing_sunset",
    });
  });

  it("AUTH_TOKEN_SCHEMA_MODE=warn in staging with EXPIRED sunset reverts to reject", () => {
    const onEvent = vi.fn();
    const now = () => new Date("2026-06-01T00:00:00Z");
    const result = resolveTokenSchemaMode(
      "staging",
      onEvent,
      { AUTH_TOKEN_SCHEMA_MODE: "warn", AUTH_TOKEN_SCHEMA_MODE_SUNSET: "2026-01-05" },
      now,
    );
    expect(result).toBe("reject");
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      event: "auth_token_schema_mode_migration_window_expired",
    });
  });

  it("AUTH_TOKEN_SCHEMA_MODE=warn is REFUSED in production and logs an error", () => {
    const refused = vi.fn();
    expect(resolveTokenSchemaMode("production", refused, { AUTH_TOKEN_SCHEMA_MODE: "warn" })).toBe("reject");
    expect(refused).toHaveBeenCalledTimes(1);
    expect(refused.mock.calls[0]![0]).toMatchObject({
      event: "auth_token_schema_mode_warn_in_prod_refused",
      env: "production",
    });
  });

  it("AUTH_TOKEN_SCHEMA_MODE=reject upgrades local", () => {
    expect(resolveTokenSchemaMode("local", undefined, { AUTH_TOKEN_SCHEMA_MODE: "reject" })).toBe("reject");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// D-E2.3  resolveMatrixParseFailurePolicy
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveMatrixParseFailurePolicy", () => {
  it("local → warn", () => {
    expect(resolveMatrixParseFailurePolicy("local")).toBe("warn");
  });

  it("staging → block", () => {
    expect(resolveMatrixParseFailurePolicy("staging")).toBe("block");
  });

  it("production → block", () => {
    expect(resolveMatrixParseFailurePolicy("production")).toBe("block");
  });

  it("unknown env → block (fail-safe)", () => {
    expect(resolveMatrixParseFailurePolicy("preview")).toBe("block");
  });
});
