// framework/runtime/src/services/business/engines/atlas-ai/services/insight-graph.service.ts
//
// Atlas Phase 5 — Financial Insight Graph Service
//
// Materializes implicit relationships across the finance domain into a
// traversable heterogeneous graph. Gathers data via parallel SQL queries,
// then computes nodes and causal edges.
//
// Key properties:
//   - No new database tables — computed from existing fin.* schema
//   - Deterministic — same data → same graph
//   - Parallel data gathering — single round-trip via Promise.all()
//   - Scoped to entity+period (optionally cross-period)

import { ok, fail } from "../../shared/engine-base.js";
import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type {
  InsightNode,
  InsightEdge,
  InsightEdgeType,
  InsightNodeType,
  InsightGraphResult,
  InsightGraphStats,
  InsightGraphComputeInput,
  ReleaseNode,
  PeriodNode,
  AccountNode,
  AnomalyNode,
  RiskSignalNode,
  ReconciliationNode,
  TaskNode,
  CloseRunNode,
} from "../domain/insight-graph-types.js";
import { buildInsightGraphProvenance } from "../domain/insight-graph-types.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface InsightGraphService {
  compute(
    ctx: OperationContext,
    input: InsightGraphComputeInput,
  ): Promise<ServiceResult<InsightGraphResult>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultInsightGraphService implements InsightGraphService {
  constructor(
    private readonly container: { resolve: <T>(token: string) => T | Promise<T> },
  ) {}

  async compute(
    ctx: OperationContext,
    input: InsightGraphComputeInput,
  ): Promise<ServiceResult<InsightGraphResult>> {
    try {
      const db = await this.container.resolve<any>("db");
      const graph = await materializeInsightGraph(db, input);
      return ok(graph);
    } catch (err) {
      return fail(
        "INSIGHT_GRAPH_FAILED",
        `Failed to compute insight graph: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Graph materialization (pure after data gathering)
// ---------------------------------------------------------------------------

export async function materializeInsightGraph(
  db: any,
  input: InsightGraphComputeInput,
): Promise<InsightGraphResult> {
  const { tenantId, entityCode, fiscalYear, periodNumber } = input;
  const limit = input.nodeLimit ?? 50;

  // Gather all data in parallel
  const [
    periodRow,
    closeRunRows,
    releaseRows,
    anomalyRows,
    riskSignalRows,
    taskRows,
    reconRows,
    taskDependencyRows,
    anomalyAccountRows,
    anomalySignalLinks,
  ] = await Promise.all([
    queryPeriod(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryCloseRuns(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryReleases(db, tenantId, entityCode, fiscalYear, periodNumber, limit),
    queryAnomalies(db, tenantId, entityCode, fiscalYear, periodNumber, limit),
    queryRiskSignals(db, tenantId, entityCode, fiscalYear, periodNumber, limit),
    queryTasks(db, tenantId, entityCode, fiscalYear, periodNumber, limit),
    queryReconciliations(db, tenantId, entityCode, fiscalYear, periodNumber, limit),
    queryTaskDependencies(db, tenantId, entityCode),
    queryAnomalyAccounts(db, tenantId, entityCode, fiscalYear, periodNumber),
    queryAnomalySignalLinks(db, tenantId, entityCode, fiscalYear, periodNumber),
  ]);

  // Build nodes
  const nodes: InsightNode[] = [];
  const nodeIds = new Set<string>();

  // Period node (always present)
  if (periodRow) {
    const pNode: PeriodNode = {
      id: `PERIOD:${entityCode}:${fiscalYear}:${periodNumber}`,
      type: "PERIOD",
      label: `${periodRow.period_label}`,
      status: periodRow.status ?? "UNKNOWN",
      fiscalYear,
      periodNumber,
      periodLabel: periodRow.period_label,
    };
    nodes.push(pNode);
    nodeIds.add(pNode.id);
  }

  // Close run nodes
  for (const cr of closeRunRows) {
    const crNode: CloseRunNode = {
      id: `CLOSE_RUN:${cr.id}`,
      type: "CLOSE_RUN",
      label: `Close Run #${cr.run_number}`,
      status: cr.status,
      runNumber: Number(cr.run_number),
      startedAt: cr.started_at,
      elapsedDays: cr.elapsed_days,
    };
    nodes.push(crNode);
    nodeIds.add(crNode.id);
  }

  // Release nodes
  for (const rel of releaseRows) {
    const rNode: ReleaseNode = {
      id: `RELEASE:${rel.release_code}`,
      type: "RELEASE",
      label: `Release ${rel.release_code}`,
      status: rel.status,
      releaseCode: rel.release_code,
      releaseType: rel.release_type,
      isCleanClose: rel.is_clean_close ?? false,
      overrideCount: Number(rel.override_count ?? 0),
    };
    nodes.push(rNode);
    nodeIds.add(rNode.id);
  }

  // Anomaly nodes
  for (const a of anomalyRows) {
    const aNode: AnomalyNode = {
      id: `ANOMALY:${a.id}`,
      type: "ANOMALY",
      label: a.title,
      status: a.status,
      anomalyType: a.anomaly_type,
      severity: a.severity,
      accountCode: a.account_code ?? null,
      zScore: a.z_score ?? null,
    };
    nodes.push(aNode);
    nodeIds.add(aNode.id);
  }

  // Risk signal nodes
  for (const rs of riskSignalRows) {
    const rsNode: RiskSignalNode = {
      id: `RISK_SIGNAL:${rs.id}`,
      type: "RISK_SIGNAL",
      label: rs.title ?? `Signal: ${rs.rule_code}`,
      status: rs.signal_state,
      ruleCode: rs.rule_code,
      severity: rs.severity,
      signalState: rs.signal_state,
      firedAt: rs.fired_at,
    };
    nodes.push(rsNode);
    nodeIds.add(rsNode.id);
  }

  // Task nodes
  const taskNodeIds = new Map<string, string>(); // task_code → node_id
  for (const t of taskRows) {
    const tNode: TaskNode = {
      id: `TASK:${t.task_code}`,
      type: "TASK",
      label: t.task_name ?? t.task_code,
      status: t.task_status,
      taskCode: t.task_code,
      requiredBefore: t.required_before ?? "SOFT_CLOSE",
      assignedTo: t.assigned_to ?? null,
    };
    nodes.push(tNode);
    nodeIds.add(tNode.id);
    taskNodeIds.set(t.task_code, tNode.id);
  }

  // Account nodes (derived from anomaly accounts — only accounts with anomalies)
  const accountNodeMap = new Map<string, AccountNode>();
  for (const aa of anomalyAccountRows) {
    if (!accountNodeMap.has(aa.account_code)) {
      const accNode: AccountNode = {
        id: `ACCOUNT:${aa.account_code}`,
        type: "ACCOUNT",
        label: `${aa.account_code} – ${aa.account_name ?? ""}`,
        status: "ACTIVE",
        accountCode: aa.account_code,
        accountType: aa.account_type ?? "UNKNOWN",
        anomalyCount: Number(aa.anomaly_count ?? 0),
      };
      accountNodeMap.set(aa.account_code, accNode);
      nodes.push(accNode);
      nodeIds.add(accNode.id);
    }
  }

  // Reconciliation nodes
  for (const r of reconRows) {
    const rNode: ReconciliationNode = {
      id: `RECONCILIATION:${r.id}`,
      type: "RECONCILIATION",
      label: `Recon: ${r.statement_number}`,
      status: r.status,
      statementNumber: r.statement_number,
      totalLines: Number(r.total_lines ?? 0),
      matchedLines: Number(r.matched_lines ?? 0),
      discrepancy: r.discrepancy ?? "0.00",
    };
    nodes.push(rNode);
    nodeIds.add(rNode.id);
  }

  // Build edges
  const edges: InsightEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (type: InsightEdgeType, source: string, target: string, label: string, weight: number | null = null, metadata: Record<string, string | number | boolean | null> | null = null) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const id = `${type}:${source}→${target}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, type, source, target, label, weight, metadata });
  };

  const periodId = `PERIOD:${entityCode}:${fiscalYear}:${periodNumber}`;

  // 1. Close run → period (DERIVED_FROM)
  for (const cr of closeRunRows) {
    addEdge("DERIVED_FROM", `CLOSE_RUN:${cr.id}`, periodId, "Close run for this period");
  }

  // 2. Release → close run (DERIVED_FROM)
  for (const rel of releaseRows) {
    if (rel.close_run_id) {
      addEdge("DERIVED_FROM", `RELEASE:${rel.release_code}`, `CLOSE_RUN:${rel.close_run_id}`, "Release from close run");
    }
    // Release → period
    addEdge("DERIVED_FROM", `RELEASE:${rel.release_code}`, periodId, "Release covers this period");
  }

  // 3. Anomaly → account (AFFECTS)
  for (const a of anomalyRows) {
    if (a.account_code) {
      addEdge("AFFECTS", `ANOMALY:${a.id}`, `ACCOUNT:${a.account_code}`, `${a.anomaly_type} on ${a.account_code}`, null, { severity: a.severity });
    }
    // Anomaly → period (AFFECTS)
    addEdge("AFFECTS", `ANOMALY:${a.id}`, periodId, `Anomaly detected in period`);
  }

  // 4. Anomaly → risk signal (ESCALATED_TO)
  for (const link of anomalySignalLinks) {
    addEdge("ESCALATED_TO", `ANOMALY:${link.anomaly_id}`, `RISK_SIGNAL:${link.risk_signal_id}`, "Anomaly escalated to risk signal", null, { severity: link.signal_severity });
  }

  // 5. Risk signal → anomaly (TRIGGERED_BY) — for atlas_anomaly rule type
  for (const rs of riskSignalRows) {
    if (rs.rule_type === "atlas_anomaly" && rs.trigger_anomaly_id) {
      addEdge("TRIGGERED_BY", `RISK_SIGNAL:${rs.id}`, `ANOMALY:${rs.trigger_anomaly_id}`, "Signal triggered by anomaly");
    }
  }

  // 6. Task → task (DEPENDS_ON) from close dependency graph
  for (const dep of taskDependencyRows) {
    const predId = taskNodeIds.get(dep.predecessor_code);
    const succId = taskNodeIds.get(dep.successor_code);
    if (predId && succId) {
      addEdge("DEPENDS_ON", succId, predId, `${dep.successor_code} depends on ${dep.predecessor_code}`, null, { isHardBlock: dep.is_hard_block });
    }
  }

  // 7. Failed/blocked tasks → blocking relationship
  for (const t of taskRows) {
    if (t.task_status === "BLOCKED" || t.task_status === "FAILED") {
      // Find what blocks this task (predecessor tasks that aren't COMPLETED/WAIVED)
      for (const dep of taskDependencyRows) {
        if (dep.successor_code === t.task_code) {
          const predTask = taskRows.find((tt: any) => tt.task_code === dep.predecessor_code);
          if (predTask && predTask.task_status !== "COMPLETED" && predTask.task_status !== "WAIVED") {
            addEdge("BLOCKED_BY", `TASK:${t.task_code}`, `TASK:${dep.predecessor_code}`, `Blocked by ${dep.predecessor_code}`, null, { blockerStatus: predTask.task_status });
          }
        }
      }
    }
  }

  // 8. Release blocked by anomalies (if release requires exception signoff)
  for (const rel of releaseRows) {
    if (rel.requires_exception_signoff) {
      const criticalAnomalies = anomalyRows.filter((a: any) => a.severity === "CRITICAL" && (a.status === "OPEN" || a.status === "ACKNOWLEDGED"));
      for (const a of criticalAnomalies) {
        addEdge("BLOCKED_BY", `RELEASE:${rel.release_code}`, `ANOMALY:${a.id}`, "Release blocked by critical anomaly", null, { anomalyType: a.anomaly_type });
      }
    }
  }

  // 9. Reconciliation → account (RECONCILES) via bank account
  for (const r of reconRows) {
    if (r.bank_account_code) {
      addEdge("RECONCILES", `RECONCILIATION:${r.id}`, `ACCOUNT:${r.bank_account_code}`, `Reconciles ${r.bank_account_code}`);
    }
  }

  // Compute stats
  const stats = computeGraphStats(nodes, edges);
  const provenance = buildInsightGraphProvenance(nodes, edges, { entityCode, fiscalYear, periodNumber });

  return { nodes, edges, stats, provenance };
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeGraphStats(nodes: InsightNode[], edges: InsightEdge[]): InsightGraphStats {
  const nodesByType: Record<string, number> = {};
  for (const n of nodes) {
    nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  }

  // Count edges per node
  const edgeCounts = new Map<string, number>();
  for (const e of edges) {
    edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1);
    edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1);
  }

  // Top hotspots
  const hotspots = Array.from(edgeCounts.entries())
    .map(([nodeId, count]) => {
      const node = nodes.find(n => n.id === nodeId);
      return { nodeId, label: node?.label ?? nodeId, edgeCount: count };
    })
    .sort((a, b) => b.edgeCount - a.edgeCount)
    .slice(0, 5);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodesByType: nodesByType as Record<InsightNodeType, number>,
    hotspots,
  };
}

// ---------------------------------------------------------------------------
// SQL query helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function queryPeriod(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT status FROM fin.fiscal_period
     WHERE tenant_id = $1::uuid AND entity_code = $2 AND fiscal_year = $3 AND period_number = $4`,
    [tenantId, entityCode, fy, pn],
  );
  const row = result.rows[0];
  if (!row) return null;
  const monthName = pn >= 1 && pn <= 12 ? MONTH_NAMES[pn - 1] : `P${pn}`;
  return { ...row, period_label: `${monthName} ${fy}` };
}

async function queryCloseRuns(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT id, run_number, status, started_at::text,
       CASE WHEN started_at IS NOT NULL
         THEN (EXTRACT(EPOCH FROM (COALESCE(hard_closed_at, soft_closed_at, now()) - started_at)) / 86400.0)::text
         ELSE NULL END AS elapsed_days
     FROM fin.close_run
     WHERE tenant_id = $1::uuid AND entity_code = $2 AND fiscal_year = $3 AND period_number = $4
     ORDER BY run_number DESC`,
    [tenantId, entityCode, fy, pn],
  );
  return result.rows;
}

async function queryReleases(db: any, tenantId: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await db.query(
    `SELECT release_code, release_type, status, is_clean_close, override_count,
       close_run_id::text, requires_exception_signoff
     FROM fin.pack_release
     WHERE tenant_id = $1::uuid AND entity_code = $2
       AND fiscal_year = $3 AND period_from <= $4 AND period_to >= $4
     ORDER BY created_at DESC LIMIT $5`,
    [tenantId, entityCode, fy, pn, limit],
  );
  return result.rows;
}

async function queryAnomalies(db: any, tenantId: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await db.query(
    `SELECT a.id::text, a.anomaly_type, a.severity, a.title, a.status,
       c.account_code, a.z_score::text AS z_score,
       a.risk_signal_id::text
     FROM fin.atlas_anomaly a
     LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
     WHERE a.tenant_id = $1::uuid AND a.entity_code = $2
       AND a.fiscal_year = $3 AND a.period_number = $4
     ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
       a.detected_at DESC LIMIT $5`,
    [tenantId, entityCode, fy, pn, limit],
  );
  return result.rows;
}

async function queryRiskSignals(db: any, tenantId: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await db.query(
    `SELECT rs.id::text, rs.rule_code, rr.rule_type, rs.severity, rs.signal_state,
       rs.title, rs.fired_at::text,
       (rs.evidence->>'anomalyId')::text AS trigger_anomaly_id
     FROM fin.close_risk_signal rs
     JOIN fin.close_risk_rule rr ON rr.id = rs.rule_id
     WHERE rs.tenant_id = $1::uuid AND rs.entity_code = $2
       AND rs.fiscal_year = $3 AND rs.period_number = $4
     ORDER BY rs.fired_at DESC LIMIT $5`,
    [tenantId, entityCode, fy, pn, limit],
  );
  return result.rows;
}

async function queryTasks(db: any, tenantId: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await db.query(
    `SELECT cc.task_code, pt.task_name, cc.task_status, pt.required_before, cc.assigned_to
     FROM fin.period_close_checklist cc
     JOIN fin.period_close_task pt ON pt.id = cc.task_id
     WHERE cc.tenant_id = $1::uuid AND cc.entity_code = $2
       AND cc.fiscal_year = $3 AND cc.period_number = $4
     ORDER BY pt.sort_order, cc.task_code LIMIT $5`,
    [tenantId, entityCode, fy, pn, limit],
  );
  return result.rows;
}

async function queryReconciliations(db: any, tenantId: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await db.query(
    `SELECT rs.id::text, bs.statement_number, rs.status, rs.total_lines,
       (rs.auto_matched + rs.manual_matched)::int AS matched_lines,
       rs.discrepancy::text,
       c.account_code AS bank_account_code
     FROM fin.reconciliation_session rs
     JOIN fin.bank_statement bs ON bs.id = rs.statement_id
     LEFT JOIN fin.chart_of_accounts c ON c.id = bs.bank_account_id
     WHERE rs.tenant_id = $1::uuid AND bs.entity_code = $2
       AND EXISTS (SELECT 1 FROM fin.fiscal_period fp
         WHERE fp.tenant_id = $1::uuid AND fp.entity_code = $2
           AND fp.fiscal_year = $3 AND fp.period_number = $4
           AND bs.statement_date BETWEEN fp.start_date AND fp.end_date)
     ORDER BY bs.statement_date DESC LIMIT $5`,
    [tenantId, entityCode, fy, pn, limit],
  );
  return result.rows;
}

async function queryTaskDependencies(db: any, tenantId: string, entityCode: string) {
  const result = await db.query(
    `SELECT pt_pred.task_code AS predecessor_code,
       pt_succ.task_code AS successor_code,
       cd.is_hard_block
     FROM fin.close_dependency cd
     JOIN fin.period_close_task pt_pred ON pt_pred.id = cd.predecessor_task_id
     JOIN fin.period_close_task pt_succ ON pt_succ.id = cd.successor_task_id
     WHERE cd.tenant_id = $1::uuid AND cd.entity_code = $2`,
    [tenantId, entityCode],
  );
  return result.rows;
}

async function queryAnomalyAccounts(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT c.account_code, c.account_name, c.account_type,
       COUNT(a.id)::int AS anomaly_count
     FROM fin.atlas_anomaly a
     JOIN fin.chart_of_accounts c ON c.id = a.account_id
     WHERE a.tenant_id = $1::uuid AND a.entity_code = $2
       AND a.fiscal_year = $3 AND a.period_number = $4
       AND a.account_id IS NOT NULL
     GROUP BY c.account_code, c.account_name, c.account_type
     ORDER BY COUNT(a.id) DESC`,
    [tenantId, entityCode, fy, pn],
  );
  return result.rows;
}

async function queryAnomalySignalLinks(db: any, tenantId: string, entityCode: string, fy: number, pn: number) {
  const result = await db.query(
    `SELECT a.id::text AS anomaly_id, a.risk_signal_id::text AS risk_signal_id,
       rs.severity AS signal_severity
     FROM fin.atlas_anomaly a
     JOIN fin.close_risk_signal rs ON rs.id = a.risk_signal_id
     WHERE a.tenant_id = $1::uuid AND a.entity_code = $2
       AND a.fiscal_year = $3 AND a.period_number = $4
       AND a.risk_signal_id IS NOT NULL`,
    [tenantId, entityCode, fy, pn],
  );
  return result.rows;
}
