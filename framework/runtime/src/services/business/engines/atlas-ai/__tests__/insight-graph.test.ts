// atlas-ai/__tests__/insight-graph.test.ts
//
// Tests for the Financial Insight Graph materialization.

import { describe, it, expect } from "vitest";

import {
  buildInsightGraphProvenance,
  INSIGHT_GRAPH_VERSION,
} from "../domain/insight-graph-types.js";
import type {
  InsightNode,
  InsightEdge,
  PeriodNode,
  AnomalyNode,
  AccountNode,
  TaskNode,
  RiskSignalNode,
  CloseRunNode,
  ReleaseNode,
} from "../domain/insight-graph-types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePeriodNode(): PeriodNode {
  return {
    id: "PERIOD:ACME:2026:3",
    type: "PERIOD",
    label: "March 2026",
    status: "OPEN",
    fiscalYear: 2026,
    periodNumber: 3,
    periodLabel: "March 2026",
  };
}

function makeCloseRunNode(): CloseRunNode {
  return {
    id: "CLOSE_RUN:cr-001",
    type: "CLOSE_RUN",
    label: "Close Run #1",
    status: "IN_PROGRESS",
    runNumber: 1,
    startedAt: "2026-03-01T00:00:00Z",
    elapsedDays: "3.5",
  };
}

function makeReleaseNode(): ReleaseNode {
  return {
    id: "RELEASE:REL-2026-03",
    type: "RELEASE",
    label: "Release REL-2026-03",
    status: "ASSEMBLING",
    releaseCode: "REL-2026-03",
    releaseType: "MANAGEMENT_PACK",
    isCleanClose: false,
    overrideCount: 2,
  };
}

function makeAnomalyNode(id: string, severity: string, accountCode: string | null): AnomalyNode {
  return {
    id: `ANOMALY:${id}`,
    type: "ANOMALY",
    label: `Test anomaly ${id}`,
    status: "OPEN",
    anomalyType: "AMOUNT_OUTLIER",
    severity,
    accountCode,
    zScore: "3.5",
  };
}

function makeAccountNode(code: string): AccountNode {
  return {
    id: `ACCOUNT:${code}`,
    type: "ACCOUNT",
    label: `${code} – Test Account`,
    status: "ACTIVE",
    accountCode: code,
    accountType: "EXPENSE",
    anomalyCount: 1,
  };
}

function makeTaskNode(code: string, status: string): TaskNode {
  return {
    id: `TASK:${code}`,
    type: "TASK",
    label: code,
    status,
    taskCode: code,
    requiredBefore: "SOFT_CLOSE",
    assignedTo: null,
  };
}

function makeRiskSignalNode(id: string): RiskSignalNode {
  return {
    id: `RISK_SIGNAL:${id}`,
    type: "RISK_SIGNAL",
    label: `Signal ${id}`,
    status: "fired",
    ruleCode: "ATLAS_ANOMALY_01",
    severity: "critical",
    signalState: "fired",
    firedAt: "2026-03-05T10:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InsightGraph provenance", () => {
  it("builds provenance with correct generator", () => {
    const nodes: InsightNode[] = [makePeriodNode()];
    const edges: InsightEdge[] = [];
    const prov = buildInsightGraphProvenance(nodes, edges, { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 });

    expect(prov.generator).toBe("atlas.insight-graph.deterministic");
    expect(prov.generatorVersion).toBe(INSIGHT_GRAPH_VERSION);
    expect(prov.deterministic).toBe(true);
    expect(prov.graphHash).toMatch(/^[0-9a-f]{8}$/);
    expect(prov.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("produces stable hash for same input", () => {
    const nodes: InsightNode[] = [makePeriodNode(), makeAnomalyNode("a1", "CRITICAL", "4100")];
    const edges: InsightEdge[] = [];
    const ctx = { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 };
    const p1 = buildInsightGraphProvenance(nodes, edges, ctx);
    const p2 = buildInsightGraphProvenance(nodes, edges, ctx);
    expect(p1.graphHash).toBe(p2.graphHash);
  });

  it("produces different hash for different context", () => {
    const nodes: InsightNode[] = [makePeriodNode()];
    const edges: InsightEdge[] = [];
    const p1 = buildInsightGraphProvenance(nodes, edges, { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 });
    const p2 = buildInsightGraphProvenance(nodes, edges, { entityCode: "GLOBEX", fiscalYear: 2026, periodNumber: 3 });
    expect(p1.graphHash).not.toBe(p2.graphHash);
  });

  it("produces different hash for different node sets", () => {
    const ctx = { entityCode: "ACME", fiscalYear: 2026, periodNumber: 3 };
    const p1 = buildInsightGraphProvenance([makePeriodNode()], [], ctx);
    const p2 = buildInsightGraphProvenance([makePeriodNode(), makeAnomalyNode("a1", "WARNING", null)], [], ctx);
    expect(p1.graphHash).not.toBe(p2.graphHash);
  });
});

describe("InsightGraph node types", () => {
  it("all node types have required fields", () => {
    const nodes: InsightNode[] = [
      makePeriodNode(),
      makeCloseRunNode(),
      makeReleaseNode(),
      makeAnomalyNode("a1", "CRITICAL", "4100"),
      makeAccountNode("4100"),
      makeTaskNode("TASK_01", "COMPLETED"),
      makeRiskSignalNode("rs-001"),
    ];

    for (const n of nodes) {
      expect(n.id).toBeTruthy();
      expect(n.type).toBeTruthy();
      expect(n.label).toBeTruthy();
      expect(typeof n.status).toBe("string");
    }
  });

  it("node IDs follow TYPE:identifier pattern", () => {
    const nodes: InsightNode[] = [
      makePeriodNode(),
      makeAnomalyNode("a1", "CRITICAL", "4100"),
      makeTaskNode("RECON_TASK", "PENDING"),
    ];

    for (const n of nodes) {
      expect(n.id).toMatch(/^[A-Z_]+:/);
      expect(n.id.startsWith(`${n.type}:`)).toBe(true);
    }
  });

  it("anomaly node preserves severity and account code", () => {
    const node = makeAnomalyNode("a1", "CRITICAL", "4100");
    expect(node.severity).toBe("CRITICAL");
    expect(node.accountCode).toBe("4100");
    expect(node.zScore).toBe("3.5");
  });

  it("release node tracks governance fields", () => {
    const node = makeReleaseNode();
    expect(node.isCleanClose).toBe(false);
    expect(node.overrideCount).toBe(2);
    expect(node.releaseType).toBe("MANAGEMENT_PACK");
  });
});

describe("InsightGraph edge construction", () => {
  it("edge IDs follow TYPE:source→target pattern", () => {
    const edge: InsightEdge = {
      id: "AFFECTS:ANOMALY:a1→ACCOUNT:4100",
      type: "AFFECTS",
      source: "ANOMALY:a1",
      target: "ACCOUNT:4100",
      label: "AMOUNT_OUTLIER on 4100",
      weight: null,
      metadata: { severity: "CRITICAL" },
    };
    expect(edge.id).toContain("→");
    expect(edge.id.startsWith(`${edge.type}:`)).toBe(true);
  });

  it("edges have required fields", () => {
    const edges: InsightEdge[] = [
      { id: "DERIVED_FROM:CLOSE_RUN:cr1→PERIOD:ACME:2026:3", type: "DERIVED_FROM", source: "CLOSE_RUN:cr1", target: "PERIOD:ACME:2026:3", label: "Close run for this period", weight: null, metadata: null },
      { id: "BLOCKED_BY:TASK:T2→TASK:T1", type: "BLOCKED_BY", source: "TASK:T2", target: "TASK:T1", label: "Blocked by T1", weight: null, metadata: { blockerStatus: "FAILED" } },
      { id: "ESCALATED_TO:ANOMALY:a1→RISK_SIGNAL:rs1", type: "ESCALATED_TO", source: "ANOMALY:a1", target: "RISK_SIGNAL:rs1", label: "Anomaly escalated", weight: null, metadata: null },
    ];

    for (const e of edges) {
      expect(e.id).toBeTruthy();
      expect(e.type).toBeTruthy();
      expect(e.source).toBeTruthy();
      expect(e.target).toBeTruthy();
      expect(e.label).toBeTruthy();
    }
  });
});

describe("InsightGraph stats", () => {
  it("computes correct node counts by type", () => {
    const nodes: InsightNode[] = [
      makePeriodNode(),
      makeAnomalyNode("a1", "CRITICAL", "4100"),
      makeAnomalyNode("a2", "WARNING", "5200"),
      makeTaskNode("T1", "COMPLETED"),
    ];

    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;

    expect(byType.PERIOD).toBe(1);
    expect(byType.ANOMALY).toBe(2);
    expect(byType.TASK).toBe(1);
  });

  it("identifies hotspots from edge connectivity", () => {
    const edges: InsightEdge[] = [
      { id: "e1", type: "AFFECTS", source: "ANOMALY:a1", target: "ACCOUNT:4100", label: "", weight: null, metadata: null },
      { id: "e2", type: "AFFECTS", source: "ANOMALY:a2", target: "ACCOUNT:4100", label: "", weight: null, metadata: null },
      { id: "e3", type: "AFFECTS", source: "ANOMALY:a3", target: "ACCOUNT:4100", label: "", weight: null, metadata: null },
      { id: "e4", type: "AFFECTS", source: "ANOMALY:a1", target: "PERIOD:P1", label: "", weight: null, metadata: null },
    ];

    const edgeCounts = new Map<string, number>();
    for (const e of edges) {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1);
      edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1);
    }

    // ACCOUNT:4100 has 3 inbound edges → most connected
    expect(edgeCounts.get("ACCOUNT:4100")).toBe(3);
    // ANOMALY:a1 has 2 outbound edges
    expect(edgeCounts.get("ANOMALY:a1")).toBe(2);
  });
});
