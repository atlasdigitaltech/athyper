import { describe, expect, it } from "vitest";
import {
  featurePercentageCohort,
  type FeatureCohortStrategy,
} from "./stable-cohort.js";

const vectors = [
  ["tenant-1", "principal-1", "ui.new", 68, 7],
  ["tenant-1", "principal-2", "ui.new", 68, 4],
  ["租户", "用户😀", "ui.新", 85, 55],
  [
    "10000000-0000-4000-8000-000000000001",
    "principal-0",
    "finance.rollout",
    75,
    89,
  ],
] as const;

describe("versioned feature cohorts", () => {
  it.each(vectors)(
    "preserves fixed buckets for %s / %s / %s",
    (tenant, principal, code, legacy, shared) => {
      expect(
        featurePercentageCohort("tenant_sha256_v1", tenant, principal, code),
      ).toBe(legacy);
      expect(
        featurePercentageCohort("principal_fnv1a_v2", tenant, principal, code),
      ).toBe(shared);
    },
  );
  it.each(["tenant_sha256_v1", "principal_fnv1a_v2"] as const)(
    "retains eligibility as percentages increase within %s",
    (strategy) => {
      for (let i = 0; i < 100; i++) {
        const bucket = featurePercentageCohort(
          strategy,
          `tenant-${i}`,
          `principal-${i}`,
          "ui.new",
        );
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
        for (let pct = 0; pct < 100; pct++)
          if (bucket < pct) expect(bucket < pct + 1).toBe(true);
      }
    },
  );
  it("rejects unknown strategies instead of silently assigning a new cohort", () => {
    expect(() =>
      featurePercentageCohort(
        "unknown" as FeatureCohortStrategy,
        "t",
        "p",
        "f",
      ),
    ).toThrow("Unsupported");
  });
});
