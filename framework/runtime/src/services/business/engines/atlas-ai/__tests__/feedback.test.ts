// atlas-ai/__tests__/feedback.test.ts
//
// Tests for Phase 6 — Adaptive Learning feedback and calibration logic.

import { describe, it, expect } from "vitest";

import { generateCalibrationSuggestions } from "../services/feedback.service.js";
import type {
  FalsePositiveRate,
  ThresholdCalibration,
  CalibrationSuggestion,
} from "../domain/feedback-types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeFpRate(overrides: Partial<FalsePositiveRate> = {}): FalsePositiveRate {
  return {
    entityCode: "ACME",
    anomalyType: "AMOUNT_OUTLIER",
    accountCode: null,
    totalFeedback: 10,
    falsePositiveCount: 4,
    confirmedCount: 5,
    falsePositivePct: "40.00",
    topFpReason: "SEASONAL_PATTERN",
    latestFeedbackAt: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeCalibration(overrides: Partial<ThresholdCalibration> = {}): ThresholdCalibration {
  return {
    id: "cal-001",
    tenantId: "t-001",
    entityCode: "ACME",
    accountCode: null,
    anomalyType: "AMOUNT_OUTLIER",
    warningZThreshold: "2.50",
    criticalZThreshold: "3.00",
    status: "APPROVED",
    source: "FEEDBACK",
    falsePositiveRate: "35.00",
    sampleSize: 10,
    confidence: "65",
    suggestedAt: "2026-02-15T00:00:00Z",
    suggestedBy: "atlas.calibration.service",
    approvedBy: "user-001",
    approvedAt: "2026-02-16T00:00:00Z",
    rejectionReason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateCalibrationSuggestions
// ---------------------------------------------------------------------------

describe("generateCalibrationSuggestions", () => {
  it("returns empty when no false positive rates are provided", () => {
    const result = generateCalibrationSuggestions([], []);
    expect(result).toEqual([]);
  });

  it("skips when sample size is below minimum (5)", () => {
    const fp = makeFpRate({ totalFeedback: 3, falsePositiveCount: 2, falsePositivePct: "66.67" });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result).toEqual([]);
  });

  it("suggests loosening when false positive rate >= 30%", () => {
    const fp = makeFpRate({
      totalFeedback: 10,
      falsePositiveCount: 4,
      confirmedCount: 5,
      falsePositivePct: "40.00",
    });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result).toHaveLength(1);

    const suggestion = result[0];
    expect(suggestion.anomalyType).toBe("AMOUNT_OUTLIER");
    expect(Number(suggestion.suggestedWarningThreshold)).toBeGreaterThan(2.5);
    expect(Number(suggestion.suggestedCriticalThreshold)).toBeGreaterThan(3.0);
    expect(suggestion.rationale).toContain("False positive rate");
    expect(suggestion.rationale).toContain("40.00%");
  });

  it("suggests tightening when confirmed rate >= 90% with 10+ samples", () => {
    const fp = makeFpRate({
      totalFeedback: 12,
      falsePositiveCount: 0,
      confirmedCount: 11,
      falsePositivePct: "0.00",
    });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result).toHaveLength(1);

    const suggestion = result[0];
    expect(Number(suggestion.suggestedWarningThreshold)).toBeLessThan(2.5);
    expect(Number(suggestion.suggestedCriticalThreshold)).toBeLessThan(3.0);
    expect(suggestion.rationale).toContain("Confirmed rate");
  });

  it("does not suggest tightening if less than 10 samples even with high confirmed rate", () => {
    const fp = makeFpRate({
      totalFeedback: 8,
      falsePositiveCount: 0,
      confirmedCount: 8,
      falsePositivePct: "0.00",
    });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result).toEqual([]);
  });

  it("respects minimum thresholds (warning >= 1.5, critical >= 2.0)", () => {
    // Use an existing approved calibration with already-low thresholds
    const existing = makeCalibration({
      warningZThreshold: "1.60",
      criticalZThreshold: "2.10",
    });
    const fp = makeFpRate({
      totalFeedback: 15,
      falsePositiveCount: 0,
      confirmedCount: 14,
      falsePositivePct: "0.00",
    });
    const result = generateCalibrationSuggestions([fp], [existing]);
    if (result.length > 0) {
      expect(Number(result[0].suggestedWarningThreshold)).toBeGreaterThanOrEqual(1.5);
      expect(Number(result[0].suggestedCriticalThreshold)).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("uses existing approved calibration thresholds as baseline", () => {
    const existing = makeCalibration({
      warningZThreshold: "3.00",
      criticalZThreshold: "3.50",
    });
    const fp = makeFpRate({
      anomalyType: "AMOUNT_OUTLIER",
      totalFeedback: 10,
      falsePositiveCount: 5,
      falsePositivePct: "50.00",
    });
    const result = generateCalibrationSuggestions([fp], [existing]);
    expect(result).toHaveLength(1);
    // Should start from 3.00/3.50, not default 2.50/3.00
    expect(Number(result[0].currentWarningThreshold)).toBe(3.0);
    expect(Number(result[0].currentCriticalThreshold)).toBe(3.5);
    expect(Number(result[0].suggestedWarningThreshold)).toBeGreaterThan(3.0);
  });

  it("produces no suggestion for middle-ground FP rates (< 30%)", () => {
    const fp = makeFpRate({
      totalFeedback: 20,
      falsePositiveCount: 4,
      confirmedCount: 12,
      falsePositivePct: "20.00",
    });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result).toEqual([]);
  });

  it("handles multiple anomaly types independently", () => {
    const fpAmount = makeFpRate({
      anomalyType: "AMOUNT_OUTLIER",
      totalFeedback: 10,
      falsePositiveCount: 5,
      falsePositivePct: "50.00",
    });
    const fpRecon = makeFpRate({
      anomalyType: "RECON_VARIANCE",
      totalFeedback: 10,
      falsePositiveCount: 1,
      confirmedCount: 9,
      falsePositivePct: "10.00",
    });
    const result = generateCalibrationSuggestions([fpAmount, fpRecon], []);

    // Only AMOUNT_OUTLIER should trigger (FP >= 30%)
    // RECON_VARIANCE has FP 10% and confirmed rate 90% with exactly 10 samples
    expect(result.some(s => s.anomalyType === "AMOUNT_OUTLIER")).toBe(true);
  });

  it("confidence increases with sample size", () => {
    const smallSample = makeFpRate({
      totalFeedback: 6,
      falsePositiveCount: 3,
      falsePositivePct: "50.00",
    });
    const largeSample = makeFpRate({
      totalFeedback: 25,
      falsePositiveCount: 10,
      falsePositivePct: "40.00",
    });

    const r1 = generateCalibrationSuggestions([smallSample], []);
    const r2 = generateCalibrationSuggestions([largeSample], []);

    if (r1.length > 0 && r2.length > 0) {
      expect(Number(r2[0].confidence)).toBeGreaterThan(Number(r1[0].confidence));
    }
  });

  it("includes top false positive reason in rationale", () => {
    const fp = makeFpRate({
      totalFeedback: 10,
      falsePositiveCount: 4,
      falsePositivePct: "40.00",
      topFpReason: "SEASONAL_PATTERN",
    });
    const result = generateCalibrationSuggestions([fp], []);
    expect(result[0].rationale).toContain("SEASONAL_PATTERN");
  });
});

// ---------------------------------------------------------------------------
// Domain type sanity
// ---------------------------------------------------------------------------

describe("Feedback domain types", () => {
  it("FalsePositiveRate has all required fields", () => {
    const fp = makeFpRate();
    expect(fp.entityCode).toBeTruthy();
    expect(fp.anomalyType).toBeTruthy();
    expect(typeof fp.totalFeedback).toBe("number");
    expect(typeof fp.falsePositiveCount).toBe("number");
    expect(typeof fp.confirmedCount).toBe("number");
    expect(typeof fp.falsePositivePct).toBe("string");
  });

  it("ThresholdCalibration has governance fields", () => {
    const cal = makeCalibration();
    expect(cal.status).toBe("APPROVED");
    expect(cal.approvedBy).toBeTruthy();
    expect(cal.approvedAt).toBeTruthy();
    expect(cal.rejectionReason).toBeNull();
  });

  it("CalibrationSuggestion output has complete shape", () => {
    const fp = makeFpRate({ totalFeedback: 10, falsePositiveCount: 4, falsePositivePct: "40.00" });
    const suggestions = generateCalibrationSuggestions([fp], []);
    const s = suggestions[0];

    expect(s).toBeDefined();
    expect(typeof s.anomalyType).toBe("string");
    expect(typeof s.suggestedWarningThreshold).toBe("string");
    expect(typeof s.suggestedCriticalThreshold).toBe("string");
    expect(typeof s.falsePositiveRate).toBe("string");
    expect(typeof s.sampleSize).toBe("number");
    expect(typeof s.confidence).toBe("string");
    expect(typeof s.rationale).toBe("string");
  });
});
