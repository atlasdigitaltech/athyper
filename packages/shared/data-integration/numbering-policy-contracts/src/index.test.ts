import { describe, expect, it } from "vitest";
import { previewNumberingPolicy, validateNumberingPolicy, type NumberingPolicyContract } from "./index";

const policy: NumberingPolicyContract = {
  policyCode: "business_partner.standard",
  policyRevision: 1,
  name: "Business Partner",
  description: null,
  formatTemplate: "BP-{yyyy}-{seq}",
  sequenceWidth: 6,
  padCharacter: "0",
  startValue: 1,
  incrementBy: 1,
  maximumValue: null,
  scopeKind: "tenant",
  resetKind: "calendar_year",
  timezoneCode: "UTC",
  status: "active",
};

describe("numbering policy contract", () => {
  it("previews without mutating a counter", () => {
    expect(previewNumberingPolicy(policy, { nextValue: 42, occurredAt: "2026-08-02T00:00:00Z" })).toEqual({
      formattedNumber: "BP-2026-000042",
      sequenceText: "000042",
      nextValue: 42,
      followingValue: 43,
      resetBucket: "2026",
    });
  });

  it("rejects unknown tokens and missing sequence ownership", () => {
    expect(validateNumberingPolicy({ ...policy, formatTemplate: "BP-{random}" })).toEqual(expect.arrayContaining([
      "format_template.seq_once",
      "format_template.token_unknown",
    ]));
  });
});
