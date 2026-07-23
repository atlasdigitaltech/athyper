import { describe, expect, it } from "vitest";
import {
  deriveFoundationDomainStatus,
  evaluateFoundationReadiness,
  type FoundationCheck,
  type FoundationDomainCompletion,
} from "../services/finance-foundation.service.js";

const check = (passed: boolean): FoundationCheck => ({ key: "check", label: "Check", passed });

describe("finance foundation domain completion", () => {
  it("is complete only when every deterministic check passes", () => {
    expect(deriveFoundationDomainStatus([check(true), check(true)], true)).toBe("complete");
    expect(deriveFoundationDomainStatus([check(true), check(false)], true)).toBe("in_progress");
  });

  it("distinguishes an untouched domain from an incomplete started domain", () => {
    expect(deriveFoundationDomainStatus([check(false)], false)).toBe("not_started");
    expect(deriveFoundationDomainStatus([check(false)], true)).toBe("in_progress");
    expect(deriveFoundationDomainStatus([], false)).toBe("not_started");
  });
});

describe("finance foundation deterministic readiness", () => {
  const domains = (failed?: string): FoundationDomainCompletion[] =>
    (["organization", "accounts", "books", "calendar"] as const).map((key) => ({
      key,
      label: key,
      href: `/foundation/${key}`,
      status: key === failed ? "in_progress" : "complete",
      checks: [{ key: `${key}_check`, label: key, passed: key !== failed }],
    }));

  it("publishes exactly one deterministic outcome for each of the four domains", () => {
    const result = evaluateFoundationReadiness(domains(), null);
    expect(result.checks.map((item) => item.domain)).toEqual(["organization", "accounts", "books", "calendar"]);
    expect(result.deterministicComplete).toBe(true);
    expect(result.status).toBe("ready_for_certification");
  });

  it("cannot be ready when any domain check fails", () => {
    const result = evaluateFoundationReadiness(domains("books"), null);
    expect(result).toMatchObject({ deterministicComplete: false, status: "not_ready" });
    expect(result.checks.find((item) => item.domain === "books")?.failedCheckKeys).toEqual(["books_check"]);
  });

  it("distinguishes current and superseded certification evidence", () => {
    expect(evaluateFoundationReadiness(domains(), { id: "cert-1", status: "CERTIFIED" }).status).toBe("certified");
    expect(evaluateFoundationReadiness(domains(), { id: "cert-1", status: "SUPERSEDED" }).status).toBe("stale");
    expect(evaluateFoundationReadiness(domains("calendar"), { id: "cert-1", status: "CERTIFIED" }).status).toBe("stale");
  });
});
