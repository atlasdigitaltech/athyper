// server/src/kernel/__tests__/auth-flag-validator.test.ts
//
// Phase C unit tests — table-driven across each rule × {local, staging,
// production} so a regression in any one cell is impossible to ship without
// updating these expectations.

import { describe, it, expect, vi } from "vitest";

import {
  applyAuthFlagPostureValidation,
  readAuthFlagPosture,
  validateAuthFlagPosture,
  type AuthFlagPosture,
  type ServerEnv,
} from "@athyper/svc-iam";
import type { ResolvedKernelConfig } from "../../kernel-config.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePosture(
  serverEnv: ServerEnv,
  overrides: Partial<AuthFlagPosture> = {},
): AuthFlagPosture {
  return {
    serverEnv,
    AUTH_CLAIM_FIRST_CONTEXT: "on",
    AUTH_PLATFORM_CONTEXT_GATE: "on",
    AUTH_VERIFY_REQUIRE_PLANE: "off",
    AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "on",
    AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "on",
    AUTH_REQUIRED_ACTIONS_MATRIX_RAW: undefined,
    AUTH_ROLE_RECHECK_INTERVAL_S_RAW: undefined,
    AUTH_TOKEN_SCHEMA_MODE_RAW: undefined,
    ...overrides,
  };
}

function kernelConfigWithRealms(
  realms: Record<string, { allowedAzp?: string[] }>,
): ResolvedKernelConfig {
  const out: Record<string, unknown> = {};
  for (const [key, realm] of Object.entries(realms)) {
    out[key] = {
      iam: {
        issuerUrl: `https://iam.test/realms/${key}`,
        clientId: `${key}-svc`,
        clientSecret: "secret",
        allowedAzp: realm.allowedAzp ?? [],
      },
    };
  }
  return {
    env: "production",
    iam: {
      strategy: "multi-realm",
      defaultRealmKey: Object.keys(realms)[0] ?? "athyper",
      realms: out,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ─── readAuthFlagPosture (env → posture normalisation) ───────────────────────

describe("readAuthFlagPosture", () => {
  it("local: AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS defaults to off", () => {
    const posture = readAuthFlagPosture("local", {});
    expect(posture).toEqual({
      serverEnv: "local",
      AUTH_CLAIM_FIRST_CONTEXT: "off",
      AUTH_PLATFORM_CONTEXT_GATE: "off",
      AUTH_VERIFY_REQUIRE_PLANE: "off",
      AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "off", // local dev ergonomics
      AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "on", // BFF default is on
      AUTH_REQUIRED_ACTIONS_MATRIX_RAW: undefined,
      AUTH_ROLE_RECHECK_INTERVAL_S_RAW: undefined,
      AUTH_TOKEN_SCHEMA_MODE_RAW: undefined,
    });
  });

  // Phase H/F2 — secure-by-default in non-local environments.
  // Resolution via AUTH_REQUIRED_ACTIONS_ENFORCE (shared with the runtime
  // env-gate helper); default off in local, on in staging/production.
  it("staging: AUTH_REQUIRED_ACTIONS_ENFORCE defaults to on", () => {
    const posture = readAuthFlagPosture("staging", {});
    expect(posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS).toBe("on");
  });

  it("production: AUTH_REQUIRED_ACTIONS_ENFORCE defaults to on", () => {
    const posture = readAuthFlagPosture("production", {});
    expect(posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS).toBe("on");
  });

  it("production: explicit off is honoured (compat path) — runtime logs the deprecation event", () => {
    const posture = readAuthFlagPosture("production", {
      AUTH_REQUIRED_ACTIONS_ENFORCE: "off",
    });
    expect(posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS).toBe("off");
  });

  it("local: explicit off is honoured (dev ergonomics)", () => {
    const posture = readAuthFlagPosture("local", {
      AUTH_REQUIRED_ACTIONS_ENFORCE: "off",
    });
    expect(posture.AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS).toBe("off");
  });

  it("explicit on forces enforcement in any env", () => {
    expect(
      readAuthFlagPosture("local", { AUTH_REQUIRED_ACTIONS_ENFORCE: "on" })
        .AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS,
    ).toBe("on");
  });

  it("normalises 3-value flags and case-insensitive 2-value flags", () => {
    const posture = readAuthFlagPosture("staging", {
      AUTH_CLAIM_FIRST_CONTEXT: "Shadow",
      AUTH_PLATFORM_CONTEXT_GATE: "ON",
      AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "OFF",
    });
    expect(posture.AUTH_CLAIM_FIRST_CONTEXT).toBe("shadow");
    expect(posture.AUTH_PLATFORM_CONTEXT_GATE).toBe("on");
    expect(posture.AUTH_BFF_REQUIRED_ACTIONS_BLOCK).toBe("off");
  });

  it("coerces unknown 3-value strings to off", () => {
    const posture = readAuthFlagPosture("local", {
      AUTH_CLAIM_FIRST_CONTEXT: "true",
    });
    expect(posture.AUTH_CLAIM_FIRST_CONTEXT).toBe("off");
  });
});

// ─── R1: GATE without CROSSCHECK ─────────────────────────────────────────────

describe("R1_GATE_REQUIRES_CROSSCHECK", () => {
  for (const env of ["local", "staging", "production"] as const) {
    it(`${env}: errors when gate=on and claimFirst=off`, () => {
      const posture = makePosture(env, {
        AUTH_PLATFORM_CONTEXT_GATE: "on",
        AUTH_CLAIM_FIRST_CONTEXT: "off",
      });
      const result = validateAuthFlagPosture(posture, null);
      expect(result.errors.some((e) => e.rule === "R1_GATE_REQUIRES_CROSSCHECK")).toBe(true);
    });

    it(`${env}: ok when gate=on and claimFirst=shadow`, () => {
      const posture = makePosture(env, {
        AUTH_PLATFORM_CONTEXT_GATE: "on",
        AUTH_CLAIM_FIRST_CONTEXT: "shadow",
      });
      const result = validateAuthFlagPosture(posture, null);
      expect(result.errors.some((e) => e.rule === "R1_GATE_REQUIRES_CROSSCHECK")).toBe(false);
    });

    it(`${env}: ok when gate=off (regardless of claimFirst)`, () => {
      const posture = makePosture(env, {
        AUTH_PLATFORM_CONTEXT_GATE: "off",
        AUTH_CLAIM_FIRST_CONTEXT: "off",
      });
      const result = validateAuthFlagPosture(posture, null);
      expect(result.errors.some((e) => e.rule === "R1_GATE_REQUIRES_CROSSCHECK")).toBe(false);
    });
  }
});

// ─── R2: production claim-first ON ───────────────────────────────────────────

describe("R2_PROD_CLAIM_FIRST_ON", () => {
  it("local: shadow is fine", () => {
    const result = validateAuthFlagPosture(
      makePosture("local", { AUTH_CLAIM_FIRST_CONTEXT: "shadow" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R2_PROD_CLAIM_FIRST_ON")).toBe(false);
  });

  it("staging: shadow is fine", () => {
    const result = validateAuthFlagPosture(
      makePosture("staging", { AUTH_CLAIM_FIRST_CONTEXT: "shadow" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R2_PROD_CLAIM_FIRST_ON")).toBe(false);
  });

  it("production: shadow is fatal", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_CLAIM_FIRST_CONTEXT: "shadow" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R2_PROD_CLAIM_FIRST_ON")).toBe(true);
  });

  it("production: off is fatal", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_CLAIM_FIRST_CONTEXT: "off", AUTH_PLATFORM_CONTEXT_GATE: "off" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R2_PROD_CLAIM_FIRST_ON")).toBe(true);
  });

  it("production: on is ok", () => {
    const result = validateAuthFlagPosture(makePosture("production"), null);
    expect(result.errors.some((e) => e.rule === "R2_PROD_CLAIM_FIRST_ON")).toBe(false);
  });
});

// ─── R3: production BFF block ────────────────────────────────────────────────

describe("R3_PROD_BFF_BLOCK_ON", () => {
  it("local: off is fine", () => {
    const result = validateAuthFlagPosture(
      makePosture("local", { AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "off" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R3_PROD_BFF_BLOCK_ON")).toBe(false);
  });

  it("staging: off is fine (warn handled by other layers)", () => {
    const result = validateAuthFlagPosture(
      makePosture("staging", { AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "off" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R3_PROD_BFF_BLOCK_ON")).toBe(false);
  });

  it("production: off is fatal", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_BFF_REQUIRED_ACTIONS_BLOCK: "off" }),
      null,
    );
    expect(result.errors.some((e) => e.rule === "R3_PROD_BFF_BLOCK_ON")).toBe(true);
  });
});

// ─── R4: allowedAzp coverage ─────────────────────────────────────────────────

describe("R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP", () => {
  it("off: no check needed", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_VERIFY_REQUIRE_PLANE: "off" }),
      kernelConfigWithRealms({ athyper: { allowedAzp: [] } }),
    );
    expect(
      [...result.warnings, ...result.errors].some(
        (v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP",
      ),
    ).toBe(false);
  });

  it("on + missing kernelConfig: warning only", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_VERIFY_REQUIRE_PLANE: "on" }),
      null,
    );
    expect(
      result.warnings.some((v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP"),
    ).toBe(true);
    expect(result.errors.some((v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP")).toBe(false);
  });

  it("on + production realm without allowedAzp: error", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_VERIFY_REQUIRE_PLANE: "on" }),
      kernelConfigWithRealms({
        athyper: { allowedAzp: ["neon-web"] },
        mesh: { allowedAzp: [] }, // offender
      }),
    );
    const found = result.errors.find((v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP");
    expect(found).toBeDefined();
    expect(found?.detail?.["offenders"]).toEqual(["mesh"]);
  });

  it("on + staging realm without allowedAzp: warning (not fatal)", () => {
    const result = validateAuthFlagPosture(
      makePosture("staging", { AUTH_VERIFY_REQUIRE_PLANE: "on" }),
      kernelConfigWithRealms({
        athyper: { allowedAzp: [] },
      }),
    );
    expect(result.errors.some((v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP")).toBe(false);
    expect(result.warnings.some((v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP")).toBe(true);
  });

  it("on + all realms have allowedAzp: ok", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_VERIFY_REQUIRE_PLANE: "on" }),
      kernelConfigWithRealms({
        athyper: { allowedAzp: ["neon-web"] },
        mesh: { allowedAzp: ["mesh-web"] },
      }),
    );
    expect(
      [...result.warnings, ...result.errors].some(
        (v) => v.rule === "R4_VERIFY_REQUIRE_PLANE_NEEDS_AZP",
      ),
    ).toBe(false);
  });
});

// ─── R5: matrix parseability ─────────────────────────────────────────────────

describe("R5_MATRIX_PARSEABLE", () => {
  it("absent: no violation", () => {
    const result = validateAuthFlagPosture(makePosture("production"), null);
    expect(result.warnings.some((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBe(false);
  });

  it("valid JSON object → string[]: ok", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", {
        AUTH_REQUIRED_ACTIONS_MATRIX_RAW: '{"UPDATE_PASSWORD":["/api/"]}',
      }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBe(false);
  });

  // Phase E2 (D-E2.3): R5 elevated to error in non-local. Tests use `local`
  // for the warn-shape assertions; non-local cases live under the dedicated
  // "Phase E2 elevation" block further down the file.
  it("unparseable JSON: warning (local)", () => {
    const result = validateAuthFlagPosture(
      makePosture("local", { AUTH_REQUIRED_ACTIONS_MATRIX_RAW: "{not json" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBe(true);
  });

  it("non-object root: warning (local)", () => {
    const result = validateAuthFlagPosture(
      makePosture("local", { AUTH_REQUIRED_ACTIONS_MATRIX_RAW: '["a","b"]' }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBe(true);
  });

  it("value not string[]: warning (local)", () => {
    const result = validateAuthFlagPosture(
      makePosture("local", {
        AUTH_REQUIRED_ACTIONS_MATRIX_RAW: '{"UPDATE_PASSWORD":[1,2]}',
      }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBe(true);
  });
});

// ─── R6: recheck interval validity ───────────────────────────────────────────

describe("R6_RECHECK_INTERVAL_VALID", () => {
  it("absent: ok", () => {
    const result = validateAuthFlagPosture(makePosture("production"), null);
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(false);
  });

  it("integer: ok", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_ROLE_RECHECK_INTERVAL_S_RAW: "600" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(false);
  });

  it("0 (disabled): ok", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_ROLE_RECHECK_INTERVAL_S_RAW: "0" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(false);
  });

  it("negative: warning", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_ROLE_RECHECK_INTERVAL_S_RAW: "-1" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(true);
  });

  it("non-numeric: warning", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_ROLE_RECHECK_INTERVAL_S_RAW: "ten minutes" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(true);
  });

  it("fractional: warning", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", { AUTH_ROLE_RECHECK_INTERVAL_S_RAW: "1.5" }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R6_RECHECK_INTERVAL_VALID")).toBe(true);
  });
});

// ─── R7: production /api/auth/verify enforcement consistency ─────────────────

describe("R7_PROD_VERIFY_REQUIRED_ACTIONS", () => {
  it("gate=off: no violation", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", {
        AUTH_PLATFORM_CONTEXT_GATE: "off",
        AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "off",
        AUTH_CLAIM_FIRST_CONTEXT: "on",
      }),
      null,
    );
    expect(
      [...result.warnings, ...result.errors].some(
        (v) => v.rule === "R7_PROD_VERIFY_REQUIRED_ACTIONS",
      ),
    ).toBe(false);
  });

  it("gate=on, verify=off, production: error", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", {
        AUTH_PLATFORM_CONTEXT_GATE: "on",
        AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "off",
      }),
      null,
    );
    expect(result.errors.some((v) => v.rule === "R7_PROD_VERIFY_REQUIRED_ACTIONS")).toBe(true);
  });

  it("gate=on, verify=off, staging: warning", () => {
    const result = validateAuthFlagPosture(
      makePosture("staging", {
        AUTH_PLATFORM_CONTEXT_GATE: "on",
        AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "off",
      }),
      null,
    );
    expect(result.warnings.some((v) => v.rule === "R7_PROD_VERIFY_REQUIRED_ACTIONS")).toBe(true);
    expect(result.errors.some((v) => v.rule === "R7_PROD_VERIFY_REQUIRED_ACTIONS")).toBe(false);
  });

  it("gate=on, verify=on: ok", () => {
    const result = validateAuthFlagPosture(
      makePosture("production", {
        AUTH_PLATFORM_CONTEXT_GATE: "on",
        AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS: "on",
      }),
      null,
    );
    expect(
      [...result.warnings, ...result.errors].some(
        (v) => v.rule === "R7_PROD_VERIFY_REQUIRED_ACTIONS",
      ),
    ).toBe(false);
  });
});

// ─── End-to-end: applyAuthFlagPostureValidation ──────────────────────────────

describe("applyAuthFlagPostureValidation (e2e)", () => {
  it("logs warnings and returns posture when no errors (local env keeps R5 as warn per D-E2.3)", () => {
    const logger = makeLogger();
    const record = vi.fn();
    process.env.AUTH_CLAIM_FIRST_CONTEXT = "on";
    process.env.AUTH_PLATFORM_CONTEXT_GATE = "on";
    process.env.AUTH_REQUIRED_ACTIONS_ENFORCE = "on";
    process.env.AUTH_BFF_REQUIRED_ACTIONS_BLOCK = "on";
    process.env.AUTH_REQUIRED_ACTIONS_MATRIX = "not json"; // R5 warning in local
    try {
      const posture = applyAuthFlagPostureValidation("local", null, {
        logger,
        recordWarning: record,
      });
      expect(posture.AUTH_CLAIM_FIRST_CONTEXT).toBe("on");
      expect(logger.warn).toHaveBeenCalledWith(
        "auth_flag_posture_warning",
        expect.objectContaining({ rule: "R5_MATRIX_PARSEABLE" }),
      );
      expect(record).toHaveBeenCalledWith("R5_MATRIX_PARSEABLE", "warning");
      expect(logger.info).toHaveBeenCalledWith(
        "auth_flag_posture_ok",
        expect.objectContaining({ serverEnv: "local" }),
      );
    } finally {
      delete process.env.AUTH_CLAIM_FIRST_CONTEXT;
      delete process.env.AUTH_PLATFORM_CONTEXT_GATE;
      delete process.env.AUTH_REQUIRED_ACTIONS_ENFORCE;
      delete process.env.AUTH_BFF_REQUIRED_ACTIONS_BLOCK;
      delete process.env.AUTH_REQUIRED_ACTIONS_MATRIX;
    }
  });

  it("throws and records counter when production has a fatal posture", () => {
    const logger = makeLogger();
    const record = vi.fn();
    process.env.AUTH_CLAIM_FIRST_CONTEXT = "shadow"; // R2 error in prod
    process.env.AUTH_PLATFORM_CONTEXT_GATE = "off";
    process.env.AUTH_BFF_REQUIRED_ACTIONS_BLOCK = "on";
    try {
      expect(() => {
        applyAuthFlagPostureValidation("production", null, {
          logger,
          recordWarning: record,
        });
      }).toThrow(/R2_PROD_CLAIM_FIRST_ON/);
      expect(logger.error).toHaveBeenCalledWith(
        "auth_flag_posture_error",
        expect.objectContaining({ rule: "R2_PROD_CLAIM_FIRST_ON" }),
      );
      expect(record).toHaveBeenCalledWith("R2_PROD_CLAIM_FIRST_ON", "error");
    } finally {
      delete process.env.AUTH_CLAIM_FIRST_CONTEXT;
      delete process.env.AUTH_PLATFORM_CONTEXT_GATE;
      delete process.env.AUTH_BFF_REQUIRED_ACTIONS_BLOCK;
    }
  });

  it("local: every flag default → no errors", () => {
    const logger = makeLogger();
    applyAuthFlagPostureValidation("local", null, { logger });
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase E2 — D-E2.3 R5 elevation
// ──────────────────────────────────────────────────────────────────────────────

describe("R5_MATRIX_PARSEABLE — Phase E2 elevation (D-E2.3)", () => {
  it("local: malformed matrix → warning (devs iterate)", () => {
    const posture = makePosture("local", { AUTH_REQUIRED_ACTIONS_MATRIX_RAW: "{not-json" });
    const result = validateAuthFlagPosture(posture, null);
    const r5 = [...result.warnings, ...result.errors].find((v) => v.rule === "R5_MATRIX_PARSEABLE");
    expect(r5?.severity).toBe("warning");
    expect(result.errors.find((e) => e.rule === "R5_MATRIX_PARSEABLE")).toBeUndefined();
  });

  it("staging: malformed matrix → error (block boot)", () => {
    const posture = makePosture("staging", { AUTH_REQUIRED_ACTIONS_MATRIX_RAW: "{not-json" });
    const result = validateAuthFlagPosture(posture, null);
    const r5 = result.errors.find((e) => e.rule === "R5_MATRIX_PARSEABLE");
    expect(r5).toBeDefined();
    expect(r5?.severity).toBe("error");
  });

  it("production: malformed matrix → error", () => {
    const posture = makePosture("production", { AUTH_REQUIRED_ACTIONS_MATRIX_RAW: "{not-json" });
    const result = validateAuthFlagPosture(posture, null);
    expect(result.errors.find((e) => e.rule === "R5_MATRIX_PARSEABLE")).toBeDefined();
  });

  it("production: wrong-shape matrix → error", () => {
    const posture = makePosture("production", {
      AUTH_REQUIRED_ACTIONS_MATRIX_RAW: JSON.stringify({ UPDATE_PASSWORD: "not-array" }),
    });
    const result = validateAuthFlagPosture(posture, null);
    expect(result.errors.find((e) => e.rule === "R5_MATRIX_PARSEABLE")).toBeDefined();
  });

  it("production: well-formed matrix → no R5", () => {
    const posture = makePosture("production", {
      AUTH_REQUIRED_ACTIONS_MATRIX_RAW: JSON.stringify({ UPDATE_PASSWORD: ["/api/"] }),
    });
    const result = validateAuthFlagPosture(posture, null);
    expect([...result.warnings, ...result.errors].find((v) => v.rule === "R5_MATRIX_PARSEABLE")).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase E2 — D-E2.5 R8 token-schema-mode rule
// ──────────────────────────────────────────────────────────────────────────────

describe("R8_TOKEN_SCHEMA_MODE_VALID", () => {
  it("unset → no violation in any env", () => {
    for (const env of ["local", "staging", "production"] as const) {
      const posture = makePosture(env, { AUTH_TOKEN_SCHEMA_MODE_RAW: undefined });
      const result = validateAuthFlagPosture(posture, null);
      expect([...result.warnings, ...result.errors].find((v) => v.rule === "R8_TOKEN_SCHEMA_MODE_VALID")).toBeUndefined();
    }
  });

  it("invalid value → error in any env", () => {
    const posture = makePosture("local", { AUTH_TOKEN_SCHEMA_MODE_RAW: "loose" });
    const result = validateAuthFlagPosture(posture, null);
    const r8 = result.errors.find((e) => e.rule === "R8_TOKEN_SCHEMA_MODE_VALID");
    expect(r8).toBeDefined();
  });

  it("=warn allowed in staging", () => {
    const posture = makePosture("staging", { AUTH_TOKEN_SCHEMA_MODE_RAW: "warn" });
    const result = validateAuthFlagPosture(posture, null);
    expect([...result.warnings, ...result.errors].find((v) => v.rule === "R8_TOKEN_SCHEMA_MODE_VALID")).toBeUndefined();
  });

  it("=warn REFUSED in production (R8 fires error)", () => {
    const posture = makePosture("production", { AUTH_TOKEN_SCHEMA_MODE_RAW: "warn" });
    const result = validateAuthFlagPosture(posture, null);
    const r8 = result.errors.find((e) => e.rule === "R8_TOKEN_SCHEMA_MODE_VALID");
    expect(r8).toBeDefined();
    expect(r8?.message).toMatch(/refused in production/i);
  });

  it("=reject allowed everywhere", () => {
    for (const env of ["local", "staging", "production"] as const) {
      const posture = makePosture(env, { AUTH_TOKEN_SCHEMA_MODE_RAW: "reject" });
      const result = validateAuthFlagPosture(posture, null);
      expect([...result.warnings, ...result.errors].find((v) => v.rule === "R8_TOKEN_SCHEMA_MODE_VALID")).toBeUndefined();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase E2 — D-E2.6 + D-E2.9: R9 default realm + R10 realm/issuer
// ──────────────────────────────────────────────────────────────────────────────

describe("R9_DEFAULT_REALM_REQUIRED (D-E2.9 — no implicit athyper)", () => {
  it("kernel config with defaultRealmKey set → no violation", () => {
    const cfg = kernelConfigWithRealms({ athyper: { allowedAzp: ["x-web"] } });
    const result = validateAuthFlagPosture(makePosture("production"), cfg);
    expect(result.errors.find((e) => e.rule === "R9_DEFAULT_REALM_REQUIRED")).toBeUndefined();
  });

  it("kernel config with empty defaultRealmKey → error", () => {
    const cfg = kernelConfigWithRealms({ athyper: { allowedAzp: ["x-web"] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cfg.iam as any).defaultRealmKey = "";
    const result = validateAuthFlagPosture(makePosture("production"), cfg);
    expect(result.errors.find((e) => e.rule === "R9_DEFAULT_REALM_REQUIRED")).toBeDefined();
  });

  it("kernel config with whitespace defaultRealmKey → error", () => {
    const cfg = kernelConfigWithRealms({ athyper: { allowedAzp: ["x-web"] } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cfg.iam as any).defaultRealmKey = "   ";
    const result = validateAuthFlagPosture(makePosture("production"), cfg);
    expect(result.errors.find((e) => e.rule === "R9_DEFAULT_REALM_REQUIRED")).toBeDefined();
  });

  it("legacy single-realm path (no kernelConfig) → R9 silent", () => {
    const result = validateAuthFlagPosture(makePosture("production"), null);
    expect(result.errors.find((e) => e.rule === "R9_DEFAULT_REALM_REQUIRED")).toBeUndefined();
  });
});

describe("R10_REALM_KCBASEURL_PAIRED (D-E2.6)", () => {
  it("all realms have issuerUrl → no violation", () => {
    const cfg = kernelConfigWithRealms({
      athyper: { allowedAzp: ["x-web"] },
      "platform-control": { allowedAzp: ["x-web"] },
    });
    const result = validateAuthFlagPosture(makePosture("production"), cfg);
    expect(result.errors.find((e) => e.rule === "R10_REALM_KCBASEURL_PAIRED")).toBeUndefined();
  });

  it("realm missing issuerUrl → error with offender list", () => {
    const cfg = kernelConfigWithRealms({
      athyper: { allowedAzp: ["x-web"] },
      "platform-control": { allowedAzp: ["x-web"] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cfg.iam.realms["platform-control"]!.iam as any).issuerUrl = "";
    const result = validateAuthFlagPosture(makePosture("production"), cfg);
    const r10 = result.errors.find((e) => e.rule === "R10_REALM_KCBASEURL_PAIRED");
    expect(r10).toBeDefined();
    expect(r10?.detail?.["offenders"]).toEqual(["platform-control"]);
  });
});
