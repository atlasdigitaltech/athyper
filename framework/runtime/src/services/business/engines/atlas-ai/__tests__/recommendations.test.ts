// atlas-ai/__tests__/recommendations.test.ts
//
// Tests for the deterministic recommendation generator.

import { describe, it, expect } from "vitest";

import { generateRecommendations } from "../services/recommendation.service.js";
import { buildRecommendationProvenance } from "../domain/recommendation-types.js";
import type { NarrativeInput } from "../domain/narrative-types.js";

const HIGH_RISK_INPUT: NarrativeInput = {
  entityCode: "ACME",
  fiscalYear: 2026,
  periodNumber: 3,
  periodLabel: "March 2026",
  anomalySummary: {
    activeCount: 3,
    criticalCount: 1,
    warningCount: 2,
    infoCount: 0,
    resolvedCount: 1,
    totalCount: 4,
  },
  topAnomalies: [
    {
      anomalyType: "AMOUNT_OUTLIER",
      severity: "CRITICAL",
      title: "Account 4100 balance exceeds 3σ threshold",
      accountCode: "4100",
      zScore: "4.2",
      observedValue: "1500000.00",
      expectedValue: "800000.00",
    },
    {
      anomalyType: "MANUAL_JOURNAL_RATIO",
      severity: "WARNING",
      title: "Manual journal ratio exceeded 40%",
      accountCode: null,
      zScore: null,
      observedValue: "0.45",
      expectedValue: "0.25",
    },
    {
      anomalyType: "RECON_VARIANCE",
      severity: "WARNING",
      title: "Bank 1020 reconciliation variance",
      accountCode: "1020",
      zScore: null,
      observedValue: "3200.00",
      expectedValue: "0.00",
    },
  ],
  riskScore: "HIGH",
  closeProgress: {
    totalTasks: 12,
    completedTasks: 8,
    failedTasks: 1,
    blockedTasks: 2,
    elapsedDays: 3.5,
    closeStatus: "IN_PROGRESS",
  },
  predictions: {
    closeDuration: {
      expectedCloseDays: "6.5",
      confidencePercent: 75,
      historicalAvgDays: "4.8",
    },
    releaseReadiness: {
      probability: 0.35,
      confidencePercent: 72,
      blockers: ["1 failed task(s)"],
    },
    reconCompletion: {
      sessionsRemaining: 2,
      totalSessions: 5,
      completedSessions: 3,
    },
  },
  riskSignals: {
    activeCount: 4,
    highCriticalCount: 2,
    atlasSignalCount: 1,
  },
  reconStatus: {
    totalSessions: 5,
    completedSessions: 3,
    isComplete: false,
  },
  consistency: {
    balanced: false,
  },
};

const HEALTHY_INPUT: NarrativeInput = {
  entityCode: "GLOBEX",
  fiscalYear: 2026,
  periodNumber: 6,
  periodLabel: "June 2026",
  anomalySummary: {
    activeCount: 0,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    resolvedCount: 1,
    totalCount: 1,
  },
  topAnomalies: [],
  riskScore: "NONE",
  closeProgress: {
    totalTasks: 8,
    completedTasks: 8,
    failedTasks: 0,
    blockedTasks: 0,
    elapsedDays: 2.1,
    closeStatus: "SOFT_CLOSED",
  },
  predictions: {
    closeDuration: {
      expectedCloseDays: "3.0",
      confidencePercent: 88,
      historicalAvgDays: "3.1",
    },
    releaseReadiness: {
      probability: 0.95,
      confidencePercent: 85,
      blockers: [],
    },
    reconCompletion: null,
  },
  riskSignals: {
    activeCount: 0,
    highCriticalCount: 0,
    atlasSignalCount: 0,
  },
  reconStatus: {
    totalSessions: 3,
    completedSessions: 3,
    isComplete: true,
  },
  consistency: {
    balanced: true,
  },
};

describe("generateRecommendations", () => {
  it("generates recommendations for high-risk input", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    expect(recs.length).toBeGreaterThan(0);

    // Should be sorted by priority
    const priorities = recs.map(r => r.priority);
    const critIdx = priorities.indexOf("CRITICAL");
    const highIdx = priorities.indexOf("HIGH");
    const medIdx = priorities.indexOf("MEDIUM");
    if (critIdx >= 0 && highIdx >= 0) expect(critIdx).toBeLessThan(highIdx);
    if (highIdx >= 0 && medIdx >= 0) expect(highIdx).toBeLessThan(medIdx);
  });

  it("includes CRITICAL anomaly response recommendations", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const criticalAnomaly = recs.find(
      r => r.type === "ANOMALY_RESPONSE" && r.priority === "CRITICAL",
    );
    expect(criticalAnomaly).toBeDefined();
    expect(criticalAnomaly!.title).toContain("Account 4100");
    expect(criticalAnomaly!.estimatedImpact).toContain("EXCEPTION_SIGNOFF");
    expect(criticalAnomaly!.suggestedOwnerRole).toBe("ACCOUNTANT");
  });

  it("includes WARNING anomaly response recommendations", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const warningRecs = recs.filter(
      r => r.type === "ANOMALY_RESPONSE" && r.priority === "HIGH",
    );
    expect(warningRecs.length).toBe(2); // MANUAL_JOURNAL_RATIO + RECON_VARIANCE
  });

  it("assigns RECONCILIATION_ANALYST for RECON_VARIANCE anomaly", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const reconRec = recs.find(r => r.key.includes("RECON_VARIANCE"));
    expect(reconRec?.suggestedOwnerRole).toBe("RECONCILIATION_ANALYST");
  });

  it("includes GL consistency gate blocker", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const glRec = recs.find(r => r.key === "gate:gl_consistency");
    expect(glRec).toBeDefined();
    expect(glRec!.priority).toBe("CRITICAL");
    expect(glRec!.type).toBe("RELEASE_GATE");
  });

  it("includes critical anomaly gate recommendation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const gateRec = recs.find(r => r.key === "gate:exception_signoff:critical_anomalies");
    expect(gateRec).toBeDefined();
    expect(gateRec!.priority).toBe("CRITICAL");
    expect(gateRec!.suggestedOwnerRole).toBe("CONTROLLER");
  });

  it("includes failed task recommendation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const taskRec = recs.find(r => r.key === "gate:failed_tasks");
    expect(taskRec).toBeDefined();
    expect(taskRec!.priority).toBe("HIGH");
  });

  it("includes recon followup recommendation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const reconRec = recs.find(r => r.type === "RECON_FOLLOWUP");
    expect(reconRec).toBeDefined();
    expect(reconRec!.title).toContain("2 outstanding");
  });

  it("includes close duration recommendation when above baseline", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const durRec = recs.find(r => r.key === "duration:above_baseline");
    expect(durRec).toBeDefined();
    expect(durRec!.title).toContain("1.7 days above baseline");
    expect(durRec!.estimatedImpact).toContain("1.7 days");
  });

  it("includes blocked task recommendation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const blockRec = recs.find(r => r.key.startsWith("duration:blocked_tasks"));
    expect(blockRec).toBeDefined();
    expect(blockRec!.title).toContain("2 blocked");
  });

  it("includes risk signal mitigation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const riskRec = recs.find(r => r.type === "RISK_MITIGATION" && r.key.includes("high_critical"));
    expect(riskRec).toBeDefined();
    expect(riskRec!.title).toContain("2 high/critical");
  });

  it("includes low readiness risk mitigation", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const lowRec = recs.find(r => r.key === "risk:low_readiness");
    expect(lowRec).toBeDefined();
    expect(lowRec!.title).toContain("35%");
  });

  it("produces zero recommendations for healthy input", () => {
    const recs = generateRecommendations(HEALTHY_INPUT);
    expect(recs.length).toBe(0);
  });

  it("all recommendations have required fields", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    for (const r of recs) {
      expect(r.key).toBeTruthy();
      expect(r.type).toBeTruthy();
      expect(r.priority).toMatch(/^(CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(r.title).toBeTruthy();
      expect(r.rationale).toBeTruthy();
      expect(r.suggestedOwnerRole).toBeTruthy();
      expect(Array.isArray(r.linkedEvidence)).toBe(true);
      expect(r.linkedEvidence.length).toBeGreaterThan(0);
    }
  });

  it("produces unique keys for deduplication", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const keys = recs.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("buildRecommendationProvenance", () => {
  it("builds provenance for high-risk recommendations", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const provenance = buildRecommendationProvenance(recs, {
      entityCode: "ACME", fiscalYear: 2026, periodNumber: 3,
    });

    expect(provenance.generator).toBe("atlas.recommendation.deterministic");
    expect(provenance.generatorVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(provenance.deterministic).toBe(true);
    expect(provenance.evidenceCount).toBe(
      recs.reduce((n, r) => n + r.linkedEvidence.length, 0),
    );
    expect(provenance.evidenceCount).toBeGreaterThan(0);
    expect(provenance.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes sorted, deduplicated evidence keys", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const provenance = buildRecommendationProvenance(recs);

    expect(Array.isArray(provenance.evidenceKeys)).toBe(true);
    expect(provenance.evidenceKeys.length).toBeGreaterThan(0);
    // Keys should be sorted
    const sorted = [...provenance.evidenceKeys].sort();
    expect(provenance.evidenceKeys).toEqual(sorted);
    // Keys should be unique
    expect(new Set(provenance.evidenceKeys).size).toBe(provenance.evidenceKeys.length);
    // Keys should follow TYPE:REF pattern
    for (const key of provenance.evidenceKeys) {
      expect(key).toMatch(/^[A-Z_]+:/);
    }
  });

  it("produces stable recommendation hash for same input", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const ctx = { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 };
    const p1 = buildRecommendationProvenance(recs, ctx);
    const p2 = buildRecommendationProvenance(recs, ctx);

    expect(p1.recommendationHash).toBe(p2.recommendationHash);
    expect(p1.recommendationHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("produces different hash for different context", () => {
    const recs = generateRecommendations(HIGH_RISK_INPUT);
    const p1 = buildRecommendationProvenance(recs, { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 });
    const p2 = buildRecommendationProvenance(recs, { entityCode: "GLOBEX", fiscalYear: 2026, periodNumber: 3 });

    expect(p1.recommendationHash).not.toBe(p2.recommendationHash);
  });

  it("builds provenance with zero evidence for healthy input", () => {
    const recs = generateRecommendations(HEALTHY_INPUT);
    const provenance = buildRecommendationProvenance(recs);

    expect(provenance.generator).toBe("atlas.recommendation.deterministic");
    expect(provenance.deterministic).toBe(true);
    expect(provenance.evidenceCount).toBe(0);
    expect(provenance.evidenceKeys).toEqual([]);
    expect(provenance.recommendationHash).toMatch(/^[0-9a-f]{8}$/);
  });
});
