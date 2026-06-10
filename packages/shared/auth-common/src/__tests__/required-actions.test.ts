// packages/shared/auth-common/src/__tests__/required-actions.test.ts

import { describe, expect, it } from "vitest";

import {
  extractRequiredActionsFromClaims,
  isMutatingMethod,
  loadMatrixFromEnv,
  matchRequiredActions,
} from "../required-actions.js";

// ─── matchRequiredActions ────────────────────────────────────────────────────

describe("matchRequiredActions", () => {
  const matrix = {
    UPDATE_PASSWORD: ["/api/"],
    VERIFY_EMAIL: ["/api/finance/"],
  };

  it("empty requiredActions: never blocked", () => {
    expect(
      matchRequiredActions({
        requiredActions: [],
        route: { path: "/api/finance/post", method: "POST" },
        matrix,
      }).blocked,
    ).toBe(false);
  });

  it("no route + pending action: blocked on the first action", () => {
    const r = matchRequiredActions({
      requiredActions: ["VERIFY_EMAIL", "CONFIGURE_TOTP"],
      matrix,
    });
    expect(r.blocked).toBe(true);
    expect(r.blockingAction).toBe("VERIFY_EMAIL");
  });

  it("GET on matching prefix: not blocked (reads stay open)", () => {
    expect(
      matchRequiredActions({
        requiredActions: ["UPDATE_PASSWORD"],
        route: { path: "/api/records/foo", method: "GET" },
        matrix,
      }).blocked,
    ).toBe(false);
  });

  it("POST on matching prefix: blocked", () => {
    const r = matchRequiredActions({
      requiredActions: ["UPDATE_PASSWORD"],
      route: { path: "/api/records/foo", method: "POST" },
      matrix,
    });
    expect(r.blocked).toBe(true);
    expect(r.blockingAction).toBe("UPDATE_PASSWORD");
    expect(r.detail).toMatchObject({ method: "POST", route: "/api/records/foo" });
  });

  it("action not in matrix: ignored even on matching path", () => {
    expect(
      matchRequiredActions({
        requiredActions: ["UNKNOWN_ACTION"],
        route: { path: "/api/finance/post", method: "POST" },
        matrix,
      }).blocked,
    ).toBe(false);
  });

  it("prefix scope is respected: VERIFY_EMAIL only blocks finance", () => {
    expect(
      matchRequiredActions({
        requiredActions: ["VERIFY_EMAIL"],
        route: { path: "/api/finance/post", method: "POST" },
        matrix,
      }).blocked,
    ).toBe(true);
    expect(
      matchRequiredActions({
        requiredActions: ["VERIFY_EMAIL"],
        route: { path: "/api/records/foo", method: "POST" },
        matrix,
      }).blocked,
    ).toBe(false);
  });
});

// ─── extractRequiredActionsFromClaims ────────────────────────────────────────

describe("extractRequiredActionsFromClaims", () => {
  it("returns [] when neither key is present", () => {
    expect(extractRequiredActionsFromClaims({})).toEqual([]);
  });

  it("prefers snake_case over camelCase", () => {
    expect(
      extractRequiredActionsFromClaims({
        required_actions: ["A"],
        requiredActions: ["B"],
      }),
    ).toEqual(["A"]);
  });

  it("falls back to camelCase", () => {
    expect(
      extractRequiredActionsFromClaims({ requiredActions: ["B"] }),
    ).toEqual(["B"]);
  });

  it("filters out non-string entries", () => {
    expect(
      extractRequiredActionsFromClaims({ required_actions: ["A", 42, null, "B"] }),
    ).toEqual(["A", "B"]);
  });
});

// ─── isMutatingMethod ────────────────────────────────────────────────────────

describe("isMutatingMethod", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "patch"]) {
    it(`treats ${m} as mutating`, () => expect(isMutatingMethod(m)).toBe(true));
  }
  for (const m of ["GET", "HEAD", "OPTIONS", "get", "TRACE"]) {
    it(`treats ${m} as non-mutating`, () => expect(isMutatingMethod(m)).toBe(false));
  }
});

// ─── loadMatrixFromEnv ───────────────────────────────────────────────────────

describe("loadMatrixFromEnv", () => {
  const fallback = { DEFAULT_ACTION: ["/default/"] };

  it("returns fallback when env var is unset", () => {
    expect(loadMatrixFromEnv("AUTH_X_MATRIX", fallback, {})).toEqual(fallback);
  });

  it("returns fallback when env JSON is malformed", () => {
    expect(
      loadMatrixFromEnv("AUTH_X_MATRIX", fallback, { AUTH_X_MATRIX: "{not json" }),
    ).toEqual(fallback);
  });

  it("returns fallback when JSON root is an array", () => {
    expect(
      loadMatrixFromEnv("AUTH_X_MATRIX", fallback, { AUTH_X_MATRIX: '["a","b"]' }),
    ).toEqual(fallback);
  });

  it("returns parsed matrix when JSON is well-shaped", () => {
    const env = { AUTH_X_MATRIX: '{"UPDATE_PASSWORD":["/api/"]}' };
    expect(loadMatrixFromEnv("AUTH_X_MATRIX", fallback, env)).toEqual({
      UPDATE_PASSWORD: ["/api/"],
    });
  });

  it("filters out entries whose value is not string[]", () => {
    const env = {
      AUTH_X_MATRIX: '{"UPDATE_PASSWORD":["/api/"],"BAD":[1,2]}',
    };
    expect(loadMatrixFromEnv("AUTH_X_MATRIX", fallback, env)).toEqual({
      UPDATE_PASSWORD: ["/api/"],
    });
  });
});
