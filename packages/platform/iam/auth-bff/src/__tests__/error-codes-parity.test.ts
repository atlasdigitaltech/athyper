// Phase E2 — D-E2.7 parity test.
//
// `error-codes.ts` is the single source of truth for the auth-failure UX
// contract. All three planes (Neon / Admin / Mesh) consume it through
// `authFailurePresentation()` rather than maintaining their own copies, so the
// per-plane "handler coverage" the original review asked for collapses into a
// contract-level invariant: every code in the table must be renderable.
//
// Renderable here means:
//   - a non-empty user-facing `message`
//   - a `telemetryEvent` (so the UI surfacing can be correlated to server log)
//   - at least one render hint — a `description`, an `action`, or an
//     `autoNavigate` target — so the UI is never just a bare toast with no
//     way for the user to recover.
//
// We also exercise the helper surface (`authFailurePresentation`,
// `isAuthFailureCode`, `resolveAuthFailureHref`, `authSeverityToToastIntent`)
// so the contract drifts loudly the moment someone adds a code without
// thinking about presentation.

import { describe, expect, it } from "vitest";

import {
  authFailurePresentation,
  authSeverityToToastIntent,
  extractAuthFailureCode,
  isAuthFailureCode,
  listAuthFailureCodes,
  resolveAuthFailureHref,
  type AuthFailureCode,
  type AuthFailureSeverity,
} from "../error-codes";

const ALL_CODES = listAuthFailureCodes();

const VALID_SEVERITIES: ReadonlySet<AuthFailureSeverity> = new Set([
  "error",
  "warning",
  "info",
  "fatal",
]);

describe("error-codes parity (D-E2.7)", () => {
  it("registers at least one code (sanity)", () => {
    expect(ALL_CODES.length).toBeGreaterThan(0);
  });

  it.each(ALL_CODES)("[%s] has a non-empty user-facing message", (code) => {
    const p = authFailurePresentation(code);
    expect(p, `presentation lookup must succeed for ${code}`).not.toBeNull();
    expect(p!.message.trim().length).toBeGreaterThan(0);
  });

  it.each(ALL_CODES)("[%s] declares a telemetry event", (code) => {
    const p = authFailurePresentation(code)!;
    expect(p.telemetryEvent.trim().length).toBeGreaterThan(0);
    // Convention: telemetry events live under the `auth.failure.*` namespace
    // so observability dashboards can wildcard-match them.
    expect(p.telemetryEvent).toMatch(/^auth\.failure\./);
  });

  it.each(ALL_CODES)("[%s] uses a valid severity", (code) => {
    const p = authFailurePresentation(code)!;
    expect(VALID_SEVERITIES.has(p.severity)).toBe(true);
  });

  it.each(ALL_CODES)(
    "[%s] offers at least one render hint (description | action | autoNavigate)",
    (code) => {
      const p = authFailurePresentation(code)!;
      const hasHint =
        (p.description && p.description.trim().length > 0) ||
        p.action != null ||
        (p.autoNavigate && p.autoNavigate.trim().length > 0);
      expect(
        hasHint,
        `${code} must give the UI something to render beyond a bare message`,
      ).toBe(true);
    },
  );

  it.each(ALL_CODES)("[%s] keeps its action shape coherent when present", (code) => {
    const p = authFailurePresentation(code)!;
    if (!p.action) return;
    expect(p.action.label.trim().length).toBeGreaterThan(0);
    expect(p.action.href.trim().length).toBeGreaterThan(0);
    if (p.action.kcAction !== undefined) {
      expect(p.action.kcAction.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(ALL_CODES)(
    "[%s] surfaces correlation id when severity is fatal",
    (code) => {
      const p = authFailurePresentation(code)!;
      if (p.severity !== "fatal") return;
      // Fatal failures are full-page error screens — support can only triage
      // them when the request ID is visible. We enforce the convention here
      // rather than letting it drift across UI surfaces.
      expect(
        p.showCorrelationId,
        `${code} is fatal — set showCorrelationId so support can triage`,
      ).toBe(true);
    },
  );
});

describe("error-codes helpers", () => {
  it("isAuthFailureCode accepts known codes and rejects everything else", () => {
    for (const code of ALL_CODES) {
      expect(isAuthFailureCode(code)).toBe(true);
    }
    expect(isAuthFailureCode("DEFINITELY_NOT_A_CODE")).toBe(false);
    expect(isAuthFailureCode(null)).toBe(false);
    expect(isAuthFailureCode(undefined)).toBe(false);
    expect(isAuthFailureCode(42)).toBe(false);
    expect(isAuthFailureCode({})).toBe(false);
  });

  it("authFailurePresentation returns null for unknown codes", () => {
    expect(authFailurePresentation(null)).toBeNull();
    expect(authFailurePresentation(undefined)).toBeNull();
    expect(authFailurePresentation("")).toBeNull();
    expect(authFailurePresentation("NOPE")).toBeNull();
  });

  it("resolveAuthFailureHref interpolates {plane} and {returnUrl}", () => {
    const href = resolveAuthFailureHref(
      "{plane}/login?returnUrl={returnUrl}",
      { planeRoot: "/admin", returnUrl: "/inbox?q=foo" },
    );
    expect(href).toBe(
      `/admin/login?returnUrl=${encodeURIComponent("/inbox?q=foo")}`,
    );
  });

  it("resolveAuthFailureHref falls back to safe defaults", () => {
    expect(resolveAuthFailureHref("{plane}/x", {})).toBe(`/x`);
    expect(
      resolveAuthFailureHref("{plane}/r?u={returnUrl}", { planeRoot: "" }),
    ).toBe(`/r?u=${encodeURIComponent("/")}`);
  });

  it("authSeverityToToastIntent maps fatal+error to error", () => {
    expect(authSeverityToToastIntent("error")).toBe("error");
    expect(authSeverityToToastIntent("fatal")).toBe("error");
    expect(authSeverityToToastIntent("warning")).toBe("warning");
    expect(authSeverityToToastIntent("info")).toBe("info");
  });

  it("extractAuthFailureCode pulls known codes off a JSON-ish body", () => {
    const sample: AuthFailureCode = ALL_CODES[0]!;
    expect(extractAuthFailureCode({ error: sample })).toBe(sample);
    expect(extractAuthFailureCode({ error: "NOPE" })).toBeNull();
    expect(extractAuthFailureCode({})).toBeNull();
    expect(extractAuthFailureCode(null)).toBeNull();
    expect(extractAuthFailureCode("string body")).toBeNull();
  });
});
