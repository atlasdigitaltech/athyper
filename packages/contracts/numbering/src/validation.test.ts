import { describe, expect, it } from "vitest";
import {
  validateNumberingPolicy,
  previewNumberingPolicy,
  extractRequiredContextKeys,
  simulateSteps,
  parseFormattedNumber,
  type NumberingPolicyContract,
} from "./index.js";

const basePolicy: NumberingPolicyContract = {
  policyCode:    "business_partner.standard",
  policyRevision: 1,
  name:          "Business Partner",
  description:   null,
  formatTemplate: "BP-{yyyy}-{seq}",
  sequenceWidth:  6,
  padCharacter:  "0",
  startValue:    1,
  incrementBy:   1,
  maximumValue:  null,
  scopeKind:     "tenant",
  resetKind:     "calendar_year",
  timezoneCode:  "UTC",
  status:        "active",
};

// ─── validateNumberingPolicy ─────────────────────────────────────────────────

describe("validateNumberingPolicy", () => {
  it("accepts a valid policy", () => {
    expect(validateNumberingPolicy(basePolicy)).toEqual([]);
  });

  it("rejects unknown tokens", () => {
    expect(validateNumberingPolicy({ ...basePolicy, formatTemplate: "BP-{random}" }))
      .toEqual(expect.arrayContaining(["format_template.seq_once", "format_template.token_unknown"]));
  });

  it("rejects missing timezone when calendar token is used", () => {
    expect(validateNumberingPolicy({ ...basePolicy, timezoneCode: null }))
      .toContain("timezone.required");
  });

  it("rejects {scope} token when scopeKind is tenant", () => {
    expect(validateNumberingPolicy({ ...basePolicy, formatTemplate: "{scope}-{seq}" }))
      .toContain("scope_token.tenant_scope_conflict");
  });

  it("rejects invalid fiscalYearPattern regex", () => {
    expect(validateNumberingPolicy({ ...basePolicy, fiscalYearPattern: "[invalid" }))
      .toContain("fiscal_year_pattern.invalid_regex");
  });

  it("accepts {mmm} token", () => {
    expect(validateNumberingPolicy({ ...basePolicy, formatTemplate: "BP-{dd}{mmm}{yy}-{seq}" })).toEqual([]);
  });

  it("accepts {ctx.*} tokens", () => {
    expect(validateNumberingPolicy({
      ...basePolicy,
      formatTemplate: "{ctx.company_code}-{yyyy}-{seq}",
      scopeKind: "company_code",
    })).toEqual([]);
  });
});

// ─── previewNumberingPolicy ──────────────────────────────────────────────────

describe("previewNumberingPolicy", () => {
  it("previews without mutating a counter", () => {
    expect(previewNumberingPolicy(basePolicy, { nextValue: 42, occurredAt: "2026-08-05T00:00:00Z" }))
      .toEqual({
        formattedNumber:    "BP-2026-000042",
        sequenceText:       "000042",
        nextValue:          42,
        followingValue:     43,
        resetBucket:        "2026",
        displayResetBucket: "2026",
      });
  });

  it("renders {mmm} as uppercase month abbreviation", () => {
    const policy: NumberingPolicyContract = {
      ...basePolicy,
      formatTemplate: "BP-{dd}{mmm}{yy}-{seq}",
    };
    const result = previewNumberingPolicy(policy, { nextValue: 1, occurredAt: "2026-08-05T00:00:00Z" });
    expect(result.formattedNumber).toBe("BP-05AUG26-000001");
  });

  it("renders {ctx.*} tokens from contextFields", () => {
    const policy: NumberingPolicyContract = {
      ...basePolicy,
      formatTemplate: "AP-{ctx.company_code}-{yyyy}-{seq}",
      scopeKind: "company_code",
    };
    const result = previewNumberingPolicy(policy, {
      nextValue: 1, occurredAt: "2026-08-05T00:00:00Z",
      scopeKey: "COMP01", contextFields: { company_code: "COMP01" },
    });
    expect(result.formattedNumber).toBe("AP-COMP01-2026-000001");
  });

  it("throws when required contextField is missing", () => {
    const policy: NumberingPolicyContract = {
      ...basePolicy,
      formatTemplate: "{ctx.company_code}-{seq}",
      scopeKind: "company_code",
    };
    expect(() =>
      previewNumberingPolicy(policy, { nextValue: 1, occurredAt: "2026-08-05T00:00:00Z", scopeKey: "C1" }),
    ).toThrow("context_fields.missing:company_code");
  });

  it("respects displayResetKind for carry-forward pattern", () => {
    const policy: NumberingPolicyContract = {
      ...basePolicy,
      formatTemplate:   "INV-{yyyy}-{seq}",
      resetKind:        "never",
      displayResetKind: "calendar_year",
    };
    const result = previewNumberingPolicy(policy, { nextValue: 500, occurredAt: "2026-08-05T00:00:00Z" });
    expect(result.resetBucket).toBe("never");
    expect(result.displayResetBucket).toBe("2026");
  });

  it("throws when fiscalYear does not match fiscalYearPattern", () => {
    const policy: NumberingPolicyContract = {
      ...basePolicy,
      formatTemplate: "{fiscal_year}-{seq}",
      resetKind: "fiscal_year",
      timezoneCode: null,
      fiscalYearPattern: "^FY\\d{4}$",
    };
    expect(() =>
      previewNumberingPolicy(policy, { nextValue: 1, occurredAt: "2026-08-05T00:00:00Z", fiscalYear: "2025-26" }),
    ).toThrow("fiscal_year.pattern_mismatch");
  });

  it("increments followingValue by incrementBy", () => {
    const result = previewNumberingPolicy({ ...basePolicy, incrementBy: 10 }, { nextValue: 10, occurredAt: "2026-08-05T00:00:00Z" });
    expect(result.followingValue).toBe(20);
  });
});

// ─── extractRequiredContextKeys ──────────────────────────────────────────────

describe("extractRequiredContextKeys", () => {
  it("returns empty when no ctx tokens", () => {
    expect(extractRequiredContextKeys(basePolicy)).toEqual([]);
  });

  it("extracts unique ctx keys", () => {
    const policy = { ...basePolicy, formatTemplate: "{ctx.le_code}-{ctx.co_code}-{ctx.le_code}-{seq}" };
    expect(extractRequiredContextKeys(policy)).toEqual(["le_code", "co_code"]);
  });
});

// ─── simulateSteps ────────────────────────────────────────────────────────────

describe("simulateSteps", () => {
  it("generates the requested number of steps", () => {
    const steps = simulateSteps(basePolicy, { nextValue: 1, occurredAt: "2026-08-05T00:00:00Z" }, 3);
    expect(steps).toHaveLength(3);
    expect(steps[0]!.allocatedValue).toBe(1);
    expect(steps[1]!.allocatedValue).toBe(2);
    expect(steps[2]!.allocatedValue).toBe(3);
  });

  it("marks crossedBoundary on the first step of a new reset bucket", () => {
    const steps = simulateSteps(
      basePolicy,
      { nextValue: 999, occurredAt: "2025-12-31T12:00:00Z" },
      4,
      "2026-01-01T00:00:00Z",
    );
    const crossed = steps.filter((s) => s.crossedBoundary);
    expect(crossed).toHaveLength(1);
    expect(crossed[0]!.allocatedValue).toBe(1);
    expect(crossed[0]!.resetBucket).toBe("2026");
  });

  it("stops early if maximumValue is reached", () => {
    const policy = { ...basePolicy, maximumValue: 2 };
    const steps  = simulateSteps(policy, { nextValue: 1, occurredAt: "2026-08-05T00:00:00Z" }, 5);
    expect(steps.every((s) => s.allocatedValue <= 2)).toBe(true);
  });
});

// ─── parseFormattedNumber ─────────────────────────────────────────────────────

describe("parseFormattedNumber", () => {
  it("extracts the sequence value from a valid formatted number", () => {
    expect(parseFormattedNumber("BP-2026-000042", basePolicy)).toEqual({
      sequenceValue: 42,
      sequenceText:  "000042",
    });
  });

  it("returns null for a number that does not match the policy template", () => {
    expect(parseFormattedNumber("WRONG-FORMAT", basePolicy)).toBeNull();
  });

  it("extracts sequence from a template with {mmm}", () => {
    const policy = { ...basePolicy, formatTemplate: "BP-{dd}{mmm}{yy}-{seq}" };
    expect(parseFormattedNumber("BP-05AUG26-000001", policy)).toEqual({
      sequenceValue: 1,
      sequenceText:  "000001",
    });
  });
});
