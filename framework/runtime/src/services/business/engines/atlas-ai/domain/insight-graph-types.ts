// framework/runtime/src/services/business/engines/atlas-ai/domain/insight-graph-types.ts
//
// Atlas Phase 5 — Financial Insight Graph domain types.
//
// The insight graph materializes implicit relationships across the
// finance domain (releases, periods, accounts, anomalies, risk signals,
// tasks, reconciliation) into a traversable heterogeneous graph.
//
// Key properties:
//   - Computed on-demand — no new database tables
//   - Heterogeneous — 8 node types, multiple edge types
//   - Causal — edges answer "why did X happen?" questions
//   - Scoped — materialized per entity+period (optionally cross-period)
//   - Deterministic — same data → same graph

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

export type InsightNodeType =
  | "RELEASE"
  | "PERIOD"
  | "ACCOUNT"
  | "ANOMALY"
  | "RISK_SIGNAL"
  | "RECONCILIATION"
  | "TASK"
  | "CLOSE_RUN";

/** Base properties shared by all nodes */
interface InsightNodeBase {
  /** Unique node ID: `{type}:{identifier}` */
  id: string;
  type: InsightNodeType;
  label: string;
  /** Status or state of the entity */
  status: string;
}

export interface ReleaseNode extends InsightNodeBase {
  type: "RELEASE";
  releaseCode: string;
  releaseType: string;
  isCleanClose: boolean;
  overrideCount: number;
}

export interface PeriodNode extends InsightNodeBase {
  type: "PERIOD";
  fiscalYear: number;
  periodNumber: number;
  periodLabel: string;
}

export interface AccountNode extends InsightNodeBase {
  type: "ACCOUNT";
  accountCode: string;
  accountType: string;
  /** Number of anomalies linked to this account in this period */
  anomalyCount: number;
}

export interface AnomalyNode extends InsightNodeBase {
  type: "ANOMALY";
  anomalyType: string;
  severity: string;
  accountCode: string | null;
  zScore: string | null;
}

export interface RiskSignalNode extends InsightNodeBase {
  type: "RISK_SIGNAL";
  ruleCode: string;
  severity: string;
  signalState: string;
  firedAt: string;
}

export interface ReconciliationNode extends InsightNodeBase {
  type: "RECONCILIATION";
  statementNumber: string;
  totalLines: number;
  matchedLines: number;
  discrepancy: string;
}

export interface TaskNode extends InsightNodeBase {
  type: "TASK";
  taskCode: string;
  requiredBefore: string;
  assignedTo: string | null;
}

export interface CloseRunNode extends InsightNodeBase {
  type: "CLOSE_RUN";
  runNumber: number;
  startedAt: string | null;
  elapsedDays: string | null;
}

export type InsightNode =
  | ReleaseNode
  | PeriodNode
  | AccountNode
  | AnomalyNode
  | RiskSignalNode
  | ReconciliationNode
  | TaskNode
  | CloseRunNode;

// ---------------------------------------------------------------------------
// Edge types
// ---------------------------------------------------------------------------

export type InsightEdgeType =
  | "BLOCKED_BY"        // task → task, release → anomaly/signal
  | "TRIGGERED_BY"      // risk_signal → anomaly, risk_signal → task
  | "AFFECTS"           // anomaly → account, anomaly → period
  | "DERIVED_FROM"      // release → close_run, release → period
  | "RECONCILES"        // reconciliation → account
  | "ESCALATED_TO"      // anomaly → risk_signal
  | "DEPENDS_ON";       // task → task (close dependency)

export interface InsightEdge {
  /** Unique edge ID: `{type}:{source}→{target}` */
  id: string;
  type: InsightEdgeType;
  source: string;       // node ID
  target: string;       // node ID
  /** Human-readable description of the relationship */
  label: string;
  /** Edge weight (severity, impact score, etc.) — null for unweighted */
  weight: number | null;
  /** Additional context */
  metadata: Record<string, string | number | boolean | null> | null;
}

// ---------------------------------------------------------------------------
// Graph result
// ---------------------------------------------------------------------------

export interface InsightGraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<InsightNodeType, number>;
  /** Most connected nodes (by total edge count) */
  hotspots: Array<{
    nodeId: string;
    label: string;
    edgeCount: number;
  }>;
}

export interface InsightGraphProvenance {
  generator: "atlas.insight-graph.deterministic";
  generatorVersion: string;
  deterministic: true;
  graphHash: string;
  generatedAt: string;
}

export interface InsightGraphResult {
  nodes: InsightNode[];
  edges: InsightEdge[];
  stats: InsightGraphStats;
  provenance: InsightGraphProvenance;
}

// ---------------------------------------------------------------------------
// Compute input
// ---------------------------------------------------------------------------

export interface InsightGraphComputeInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Include cross-period edges (prior period anomaly patterns) */
  includeCrossPeriod?: boolean;
  /** Max nodes per type (default 50) */
  nodeLimit?: number;
}

// ---------------------------------------------------------------------------
// Provenance helper
// ---------------------------------------------------------------------------

export const INSIGHT_GRAPH_VERSION = "1.0.0";

/**
 * Simple deterministic string hash (djb2).
 * Same algorithm as recommendation provenance.
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildInsightGraphProvenance(
  nodes: InsightNode[],
  edges: InsightEdge[],
  context: { entityCode: string; fiscalYear: number; periodNumber: number },
): InsightGraphProvenance {
  const hashInput = [
    context.entityCode,
    String(context.fiscalYear),
    String(context.periodNumber),
    String(nodes.length),
    String(edges.length),
    ...nodes.map(n => n.id).sort(),
  ].join("|");

  return {
    generator: "atlas.insight-graph.deterministic",
    generatorVersion: INSIGHT_GRAPH_VERSION,
    deterministic: true,
    graphHash: djb2Hash(hashInput),
    generatedAt: new Date().toISOString(),
  };
}
