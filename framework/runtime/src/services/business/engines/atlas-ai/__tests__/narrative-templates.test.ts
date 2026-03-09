// atlas-ai/__tests__/narrative-templates.test.ts
//
// Snapshot tests for deterministic narrative template functions.
// These guarantee that template output is stable across refactors
// and that provenance metadata is correctly computed.

import { describe, it, expect } from "vitest";

import {
  renderDashboardSummary,
  renderReleaseSummary,
  renderAnomalyExplanation,
  renderCfoBrief,
} from "../services/narrative-templates.js";
import {
  buildProvenance,
  buildAnomalyProvenance,
} from "../domain/narrative-types.js";
import type {
  NarrativeInput,
  AnomalyExplanationInput,
} from "../domain/narrative-types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: NarrativeInput = {
  entityCode: "ACME",
  fiscalYear: 2026,
  periodNumber: 3,
  periodLabel: "March 2026",
  anomalySummary: {
    activeCount: 2,
    criticalCount: 1,
    warningCount: 1,
    infoCount: 0,
    resolvedCount: 3,
    totalCount: 5,
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
  ],
  riskScore: "HIGH",
  closeProgress: {
    totalTasks: 12,
    completedTasks: 8,
    failedTasks: 1,
    blockedTasks: 0,
    elapsedDays: 3.5,
    closeStatus: "IN_PROGRESS",
  },
  predictions: {
    closeDuration: {
      expectedCloseDays: "5.2",
      confidencePercent: 78,
      historicalAvgDays: "4.8",
    },
    releaseReadiness: {
      probability: 0.42,
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
    activeCount: 3,
    highCriticalCount: 1,
    atlasSignalCount: 1,
  },
  reconStatus: {
    totalSessions: 5,
    completedSessions: 3,
    isComplete: false,
  },
  consistency: {
    balanced: true,
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

const ANOMALY_EXPLANATION_INPUT: AnomalyExplanationInput = {
  anomalyType: "AMOUNT_OUTLIER",
  severity: "CRITICAL",
  title: "Account 4100 balance exceeds 3σ threshold",
  accountCode: "4100",
  accountName: "Revenue - Product Sales",
  zScore: "4.2",
  observedValue: "1500000.00",
  expectedValue: "800000.00",
  baselineMean: "780000.00",
  baselineStddev: "171428.57",
  sampleCount: 6,
  evidence: {},
};

// ---------------------------------------------------------------------------
// 1. Dashboard Summary snapshots
// ---------------------------------------------------------------------------
describe("renderDashboardSummary", () => {
  it("produces stable output for high-risk period", () => {
    expect(renderDashboardSummary(BASE_INPUT)).toMatchInlineSnapshot(
      `"ACME March 2026 is in elevated risk status. Close tasks are 67% complete (8/12), with 1 failed. Atlas detected 2 active anomalies (1 critical, 1 warning). Expected close duration is 5.2 days, in line with baseline. Release readiness is at 42%. 2 reconciliation sessions remain open."`
    );
  });

  it("produces stable output for healthy period", () => {
    expect(renderDashboardSummary(HEALTHY_INPUT)).toMatchInlineSnapshot(
      `"GLOBEX June 2026 is in healthy status. Close tasks are 100% complete (8/8). No active anomalies detected. Expected close duration is 3.0 days, in line with baseline. Release readiness is at 95%."`
    );
  });

  it("mentions GL imbalance when consistency fails", () => {
    const input = { ...BASE_INPUT, consistency: { balanced: false } };
    const result = renderDashboardSummary(input);
    expect(result).toContain("GL consistency check is failing");
  });
});

// ---------------------------------------------------------------------------
// 2. Release Summary snapshots
// ---------------------------------------------------------------------------
describe("renderReleaseSummary", () => {
  it("produces stable output for at-risk release", () => {
    expect(renderReleaseSummary(BASE_INPUT)).toMatchInlineSnapshot(
      `"ACME March 2026 is not yet ready (42% probability). Blockers: 1 failed task(s). 4 close tasks are still outstanding. 1 critical anomaly must be resolved before the EXCEPTION_SIGNOFF gate can clear. 1 high/critical risk signal is active. Reconciliation is incomplete (3/5 sessions done, 2 remaining). Expected close duration: 5.2 days (78% confidence)."`
    );
  });

  it("produces stable output for ready release", () => {
    expect(renderReleaseSummary(HEALTHY_INPUT)).toMatchInlineSnapshot(
      `"GLOBEX June 2026 is ready for release (95% probability). All close tasks are complete. Expected close duration: 3.0 days (88% confidence)."`
    );
  });

  it("handles missing release readiness prediction", () => {
    const input = { ...BASE_INPUT, predictions: { ...BASE_INPUT.predictions, releaseReadiness: null } };
    const result = renderReleaseSummary(input);
    expect(result).toContain("cannot be assessed");
  });
});

// ---------------------------------------------------------------------------
// 3. CFO Brief snapshots
// ---------------------------------------------------------------------------
describe("renderCfoBrief", () => {
  it("produces stable output for high-risk period", () => {
    expect(renderCfoBrief(BASE_INPUT)).toMatchInlineSnapshot(`
      "1. ACME March 2026: Immediate attention required.
      2. Close progress: 67%, expected completion in 5.2 days.
      3. Release readiness: 42% — 1 blocker.
      4. Key risks: 1 critical anomaly, 2 open reconciliations, 1 failed task.
      5. Top concern: Account 4100 balance exceeds 3σ threshold (4100)."
    `);
  });

  it("produces stable output for healthy period", () => {
    expect(renderCfoBrief(HEALTHY_INPUT)).toMatchInlineSnapshot(`
      "1. GLOBEX June 2026: On track.
      2. Close progress: 100%, expected completion in 3.0 days.
      3. Release readiness: 95%."
    `);
  });
});

// ---------------------------------------------------------------------------
// 4. Anomaly Explanation snapshots
// ---------------------------------------------------------------------------
describe("renderAnomalyExplanation", () => {
  it("produces stable output for CRITICAL amount outlier", () => {
    expect(renderAnomalyExplanation(ANOMALY_EXPLANATION_INPUT)).toMatchInlineSnapshot(
      `"Account 4100 balance exceeds 3σ threshold The observed value of 1.5M is 4.2 standard deviations from the baseline mean of 780.0K (computed over 6 periods). This is classified as CRITICAL and will block the EXCEPTION_SIGNOFF gate until resolved or acknowledged. Account: 4100 — Revenue - Product Sales. Review the account balance and recent journal entries for unusual postings."`
    );
  });

  it("handles WARNING severity without baseline data", () => {
    const input: AnomalyExplanationInput = {
      anomalyType: "MANUAL_JOURNAL_RATIO",
      severity: "WARNING",
      title: "Manual journal ratio exceeded 40%",
      accountCode: null,
      accountName: null,
      zScore: null,
      observedValue: "0.45",
      expectedValue: "0.25",
      baselineMean: null,
      baselineStddev: null,
      sampleCount: null,
      evidence: {},
    };
    const result = renderAnomalyExplanation(input);
    expect(result).toContain("WARNING");
    expect(result).toContain("Observed: 0.45");
    expect(result).not.toContain("standard deviations");
  });
});

// ---------------------------------------------------------------------------
// 5. Provenance metadata
// ---------------------------------------------------------------------------
describe("buildProvenance", () => {
  it("returns full completeness for data-rich input", () => {
    const p = buildProvenance(BASE_INPUT);
    expect(p).toMatchObject({
      provider: "template",
      deterministic: true,
      completeness: "full",
      sourceCounts: {
        anomalies: 5,
        closeTasksTotal: 12,
        riskSignals: 3,
        reconSessions: 5,
        predictionsAvailable: 3,
      },
    });
    expect(p.templateText).toBeUndefined();
  });

  it("returns partial completeness when some data is missing", () => {
    const sparseInput: NarrativeInput = {
      ...BASE_INPUT,
      closeProgress: { ...BASE_INPUT.closeProgress, totalTasks: 0 },
      reconStatus: { totalSessions: 0, completedSessions: 0, isComplete: true },
      predictions: { closeDuration: null, releaseReadiness: null, reconCompletion: null },
    };
    const p = buildProvenance(sparseInput);
    expect(p.completeness).toBe("partial"); // only anomalies have data
    expect(p.sourceCounts.predictionsAvailable).toBe(0);
  });

  it("returns minimal completeness when no data sources returned", () => {
    const emptyInput: NarrativeInput = {
      ...BASE_INPUT,
      anomalySummary: { activeCount: 0, criticalCount: 0, warningCount: 0, infoCount: 0, resolvedCount: 0, totalCount: 0 },
      closeProgress: { totalTasks: 0, completedTasks: 0, failedTasks: 0, blockedTasks: 0, elapsedDays: null, closeStatus: null },
      reconStatus: { totalSessions: 0, completedSessions: 0, isComplete: true },
      predictions: { closeDuration: null, releaseReadiness: null, reconCompletion: null },
      riskSignals: { activeCount: 0, highCriticalCount: 0, atlasSignalCount: 0 },
    };
    const p = buildProvenance(emptyInput);
    expect(p.completeness).toBe("minimal");
  });

  it("includes templateText when provided for LLM provenance", () => {
    const p = buildProvenance(BASE_INPUT, "llm", "ACME March 2026 is in elevated risk...");
    expect(p.provider).toBe("llm");
    expect(p.deterministic).toBe(false);
    expect(p.templateText).toBe("ACME March 2026 is in elevated risk...");
  });
});

describe("buildAnomalyProvenance", () => {
  it("returns full completeness with single anomaly source", () => {
    const p = buildAnomalyProvenance();
    expect(p).toMatchObject({
      provider: "template",
      deterministic: true,
      completeness: "full",
      sourceCounts: { anomalies: 1 },
    });
  });
});
