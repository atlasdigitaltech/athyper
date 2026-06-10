// Phase E2 — D-E2.8 surface-translation parity.
//
// `enforceRequiredActions` is the BFF-surface wrapper around the shared
// `matchRequiredActions` algorithm. Its job is to translate the generic
// `MatrixMatch` into a `SessionPipelineError` shape with deterministic
// status/message/blockingAction/detail propagation.
//
// The server runtime has a structurally identical wrapper at
// server/src/auth/auth-pipeline.ts:362-382 that emits the same
// REQUIRED_ACTION_PENDING shape (code, status:403, same message,
// same blockingAction passthrough, same detail passthrough). This test pins
// the BFF half of that contract; the server half is pinned in
// server/src/auth/__tests__/auth-pipeline.test.ts (enforceRequiredActions
// suite). The two together close the byte-identical loop.
//
// If you change the translation here, you MUST also update the server
// wrapper and its tests — and call this out in the PR description so a
// reviewer can verify both surfaces still agree.

import { describe, expect, it } from "vitest";

import {
  BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
  enforceRequiredActions,
  type SessionPipelineError,
} from "../auth-pipeline";

describe("enforceRequiredActions translation parity (D-E2.8)", () => {
  // ─ open path: passes through ───────────────────────────────────────────────

  it("empty requiredActions → ok with no error", () => {
    const result = enforceRequiredActions({
      requiredActions: [],
      route: { path: "/finance/post", method: "POST" },
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("read on matching prefix → ok (reads bypass)", () => {
    const result = enforceRequiredActions({
      requiredActions: ["UPDATE_PASSWORD"],
      route: { path: "/", method: "GET" },
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("action not in matrix → ok even on matching prefix", () => {
    const result = enforceRequiredActions({
      requiredActions: ["NOT_REGISTERED"],
      route: { path: "/finance/post", method: "POST" },
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // ─ blocked path: deterministic error shape ────────────────────────────────

  it("blocked with route → REQUIRED_ACTION_PENDING shape (full detail)", () => {
    const result = enforceRequiredActions({
      requiredActions: ["VERIFY_EMAIL"],
      route: { path: "/finance/post", method: "POST" },
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.ok).toBe(false);
    // Pin the EXACT translation shape — server wrapper must agree.
    const expected: SessionPipelineError = {
      code: "REQUIRED_ACTION_PENDING",
      status: 403,
      message: "Complete the pending account action before continuing.",
      blockingAction: "VERIFY_EMAIL",
      detail: {
        requiredActions: ["VERIFY_EMAIL"],
        route: "/finance/post",
        method: "POST",
      },
    };
    expect(result.error).toEqual(expected);
  });

  it("blocked without route → REQUIRED_ACTION_PENDING shape (route-less detail)", () => {
    const result = enforceRequiredActions({
      requiredActions: ["CONFIGURE_TOTP", "VERIFY_EMAIL"],
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.ok).toBe(false);
    const expected: SessionPipelineError = {
      code: "REQUIRED_ACTION_PENDING",
      status: 403,
      message: "Complete the pending account action before continuing.",
      blockingAction: "CONFIGURE_TOTP",
      detail: { requiredActions: ["CONFIGURE_TOTP", "VERIFY_EMAIL"] },
    };
    expect(result.error).toEqual(expected);
  });

  it("blocked passthrough preserves match.detail keys (route + method)", () => {
    const result = enforceRequiredActions({
      requiredActions: ["UPDATE_PASSWORD"],
      route: { path: "/anything", method: "DELETE" },
      matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
    });
    expect(result.error).toBeDefined();
    expect(result.error!.detail).toEqual({
      requiredActions: ["UPDATE_PASSWORD"],
      route: "/anything",
      method: "DELETE",
    });
    expect(result.error!.blockingAction).toBe("UPDATE_PASSWORD");
  });

  // ─ matrix override: caller supplies their own ──────────────────────────────

  it("respects a caller-supplied matrix instead of the default", () => {
    const customMatrix = { VERIFY_EMAIL: ["/custom/"] };
    const blocked = enforceRequiredActions({
      requiredActions: ["VERIFY_EMAIL"],
      route: { path: "/custom/path", method: "POST" },
      matrix: customMatrix,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.blockingAction).toBe("VERIFY_EMAIL");

    const allowed = enforceRequiredActions({
      requiredActions: ["VERIFY_EMAIL"],
      route: { path: "/finance/post", method: "POST" },
      matrix: customMatrix,
    });
    expect(allowed.ok).toBe(true);
  });

  // ─ contract invariants: code/status/message are constants ─────────────────

  it("every blocked translation uses code=REQUIRED_ACTION_PENDING / status=403", () => {
    const cases = [
      { requiredActions: ["UPDATE_PASSWORD"], route: { path: "/", method: "POST" } },
      { requiredActions: ["VERIFY_EMAIL"], route: { path: "/finance/x", method: "PATCH" } },
      { requiredActions: ["CONFIGURE_TOTP"], route: { path: "/workflow/x", method: "PUT" } },
      { requiredActions: ["UPDATE_PASSWORD"] }, // no route
    ] as const;

    for (const c of cases) {
      const result = enforceRequiredActions({
        ...c,
        matrix: BFF_DEFAULT_REQUIRED_ACTION_MATRIX,
      });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("REQUIRED_ACTION_PENDING");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Complete the pending account action before continuing.",
      );
    }
  });
});
