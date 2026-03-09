/**
 * Atlas Insight Graph API
 *
 * GET /api/fin/atlas/insight-graph?entityCode=ACME&fiscalYear=2026&periodNumber=3
 *   → Materialized heterogeneous graph of relationships across the finance domain
 *   → Nodes: releases, periods, accounts, anomalies, risk signals, tasks, reconciliations, close runs
 *   → Edges: BLOCKED_BY, TRIGGERED_BY, AFFECTS, DERIVED_FROM, RECONCILES, ESCALATED_TO, DEPENDS_ON
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import type { NextRequest } from "next/server";

import {
  getApiContext,
  resolveTenantUuid,
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";

// ---------------------------------------------------------------------------
// Node / Edge types (inline — mirrors atlas-ai domain types)
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  type: string;
  label: string;
  status: string;
  [key: string]: unknown;
}

interface GraphEdge {
  id: string;
  type: string;
  source: string;
  target: string;
  label: string;
  weight: number | null;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    if (!apiCtx.context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, apiCtx.context.tenantId);
    const url = new URL(req.url);
    const entityCode = url.searchParams.get("entityCode");
    const fiscalYear = url.searchParams.get("fiscalYear");
    const periodNumber = url.searchParams.get("periodNumber");

    if (!entityCode || !fiscalYear || !periodNumber) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    const fy = Number(fiscalYear);
    const pn = Number(periodNumber);
    const nodeLimit = Math.min(Number(url.searchParams.get("nodeLimit") ?? 50), 100);

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
      queryPeriod(db, tenantUuid, entityCode, fy, pn),
      queryCloseRuns(db, tenantUuid, entityCode, fy, pn),
      queryReleases(db, tenantUuid, entityCode, fy, pn, nodeLimit),
      queryAnomalies(db, tenantUuid, entityCode, fy, pn, nodeLimit),
      queryRiskSignals(db, tenantUuid, entityCode, fy, pn, nodeLimit),
      queryTasks(db, tenantUuid, entityCode, fy, pn, nodeLimit),
      queryReconciliations(db, tenantUuid, entityCode, fy, pn, nodeLimit),
      queryTaskDependencies(db, tenantUuid, entityCode),
      queryAnomalyAccounts(db, tenantUuid, entityCode, fy, pn),
      queryAnomalySignalLinks(db, tenantUuid, entityCode, fy, pn),
    ]);

    // Build nodes
    const nodes: GraphNode[] = [];
    const nodeIds = new Set<string>();

    // Period node
    if (periodRow) {
      const id = `PERIOD:${entityCode}:${fy}:${pn}`;
      nodes.push({ id, type: "PERIOD", label: periodRow.periodLabel, status: periodRow.status, fiscalYear: fy, periodNumber: pn, periodLabel: periodRow.periodLabel });
      nodeIds.add(id);
    }

    // Close runs
    for (const cr of closeRunRows) {
      const id = `CLOSE_RUN:${cr.id}`;
      nodes.push({ id, type: "CLOSE_RUN", label: `Close Run #${cr.runNumber}`, status: cr.status, runNumber: cr.runNumber, startedAt: cr.startedAt, elapsedDays: cr.elapsedDays });
      nodeIds.add(id);
    }

    // Releases
    for (const rel of releaseRows) {
      const id = `RELEASE:${rel.releaseCode}`;
      nodes.push({ id, type: "RELEASE", label: `Release ${rel.releaseCode}`, status: rel.status, releaseCode: rel.releaseCode, releaseType: rel.releaseType, isCleanClose: rel.isCleanClose, overrideCount: rel.overrideCount });
      nodeIds.add(id);
    }

    // Anomalies
    for (const a of anomalyRows) {
      const id = `ANOMALY:${a.id}`;
      nodes.push({ id, type: "ANOMALY", label: a.title, status: a.status, anomalyType: a.anomalyType, severity: a.severity, accountCode: a.accountCode, zScore: a.zScore });
      nodeIds.add(id);
    }

    // Risk signals
    for (const rs of riskSignalRows) {
      const id = `RISK_SIGNAL:${rs.id}`;
      nodes.push({ id, type: "RISK_SIGNAL", label: rs.title ?? `Signal: ${rs.ruleCode}`, status: rs.signalState, ruleCode: rs.ruleCode, severity: rs.severity, signalState: rs.signalState, firedAt: rs.firedAt });
      nodeIds.add(id);
    }

    // Tasks
    const taskNodeIds = new Map<string, string>();
    for (const t of taskRows) {
      const id = `TASK:${t.taskCode}`;
      nodes.push({ id, type: "TASK", label: t.taskName ?? t.taskCode, status: t.taskStatus, taskCode: t.taskCode, requiredBefore: t.requiredBefore, assignedTo: t.assignedTo });
      nodeIds.add(id);
      taskNodeIds.set(t.taskCode, id);
    }

    // Accounts (only those with anomalies)
    const accountNodeMap = new Map<string, boolean>();
    for (const aa of anomalyAccountRows) {
      if (!accountNodeMap.has(aa.accountCode)) {
        const id = `ACCOUNT:${aa.accountCode}`;
        nodes.push({ id, type: "ACCOUNT", label: `${aa.accountCode} – ${aa.accountName ?? ""}`, status: "ACTIVE", accountCode: aa.accountCode, accountType: aa.accountType, anomalyCount: aa.anomalyCount });
        nodeIds.add(id);
        accountNodeMap.set(aa.accountCode, true);
      }
    }

    // Reconciliations
    for (const r of reconRows) {
      const id = `RECONCILIATION:${r.id}`;
      nodes.push({ id, type: "RECONCILIATION", label: `Recon: ${r.statementNumber}`, status: r.status, statementNumber: r.statementNumber, totalLines: r.totalLines, matchedLines: r.matchedLines, discrepancy: r.discrepancy });
      nodeIds.add(id);
    }

    // Build edges
    const edges: GraphEdge[] = [];
    const edgeIds = new Set<string>();
    const addEdge = (type: string, source: string, target: string, label: string, weight: number | null = null, metadata: Record<string, unknown> | null = null) => {
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      const id = `${type}:${source}→${target}`;
      if (edgeIds.has(id)) return;
      edgeIds.add(id);
      edges.push({ id, type, source, target, label, weight, metadata });
    };

    const periodId = `PERIOD:${entityCode}:${fy}:${pn}`;

    // Close run → period
    for (const cr of closeRunRows) addEdge("DERIVED_FROM", `CLOSE_RUN:${cr.id}`, periodId, "Close run for this period");

    // Release → close run, release → period
    for (const rel of releaseRows) {
      if (rel.closeRunId) addEdge("DERIVED_FROM", `RELEASE:${rel.releaseCode}`, `CLOSE_RUN:${rel.closeRunId}`, "Release from close run");
      addEdge("DERIVED_FROM", `RELEASE:${rel.releaseCode}`, periodId, "Release covers this period");
    }

    // Anomaly → account, anomaly → period
    for (const a of anomalyRows) {
      if (a.accountCode) addEdge("AFFECTS", `ANOMALY:${a.id}`, `ACCOUNT:${a.accountCode}`, `${a.anomalyType} on ${a.accountCode}`, null, { severity: a.severity });
      addEdge("AFFECTS", `ANOMALY:${a.id}`, periodId, "Anomaly detected in period");
    }

    // Anomaly → risk signal (ESCALATED_TO)
    for (const link of anomalySignalLinks) addEdge("ESCALATED_TO", `ANOMALY:${link.anomalyId}`, `RISK_SIGNAL:${link.riskSignalId}`, "Anomaly escalated to risk signal", null, { severity: link.signalSeverity });

    // Risk signal triggered by anomaly
    for (const rs of riskSignalRows) {
      if (rs.ruleType === "atlas_anomaly" && rs.triggerAnomalyId) addEdge("TRIGGERED_BY", `RISK_SIGNAL:${rs.id}`, `ANOMALY:${rs.triggerAnomalyId}`, "Signal triggered by anomaly");
    }

    // Task → task (DEPENDS_ON)
    for (const dep of taskDependencyRows) {
      const predId = taskNodeIds.get(dep.predecessorCode);
      const succId = taskNodeIds.get(dep.successorCode);
      if (predId && succId) addEdge("DEPENDS_ON", succId, predId, `${dep.successorCode} depends on ${dep.predecessorCode}`, null, { isHardBlock: dep.isHardBlock });
    }

    // Failed/blocked tasks → BLOCKED_BY
    for (const t of taskRows) {
      if (t.taskStatus === "BLOCKED" || t.taskStatus === "FAILED") {
        for (const dep of taskDependencyRows) {
          if (dep.successorCode === t.taskCode) {
            const predTask = taskRows.find(tt => tt.taskCode === dep.predecessorCode);
            if (predTask && predTask.taskStatus !== "COMPLETED" && predTask.taskStatus !== "WAIVED") {
              addEdge("BLOCKED_BY", `TASK:${t.taskCode}`, `TASK:${dep.predecessorCode}`, `Blocked by ${dep.predecessorCode}`, null, { blockerStatus: predTask.taskStatus });
            }
          }
        }
      }
    }

    // Release blocked by critical anomalies
    for (const rel of releaseRows) {
      if (rel.requiresExceptionSignoff) {
        for (const a of anomalyRows) {
          if (a.severity === "CRITICAL" && (a.status === "OPEN" || a.status === "ACKNOWLEDGED")) {
            addEdge("BLOCKED_BY", `RELEASE:${rel.releaseCode}`, `ANOMALY:${a.id}`, "Release blocked by critical anomaly", null, { anomalyType: a.anomalyType });
          }
        }
      }
    }

    // Reconciliation → account
    for (const r of reconRows) {
      if (r.bankAccountCode) addEdge("RECONCILES", `RECONCILIATION:${r.id}`, `ACCOUNT:${r.bankAccountCode}`, `Reconciles ${r.bankAccountCode}`);
    }

    // Compute stats
    const nodesByType: Record<string, number> = {};
    for (const n of nodes) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;

    const edgeCounts = new Map<string, number>();
    for (const e of edges) {
      edgeCounts.set(e.source, (edgeCounts.get(e.source) ?? 0) + 1);
      edgeCounts.set(e.target, (edgeCounts.get(e.target) ?? 0) + 1);
    }
    const hotspots = Array.from(edgeCounts.entries())
      .map(([nodeId, count]) => ({ nodeId, label: nodes.find(n => n.id === nodeId)?.label ?? nodeId, edgeCount: count }))
      .sort((a, b) => b.edgeCount - a.edgeCount)
      .slice(0, 5);

    // Provenance hash (djb2)
    const hashInput = [entityCode, String(fy), String(pn), String(nodes.length), String(edges.length), ...nodes.map(n => n.id).sort()].join("|");
    let hash = 5381;
    for (let i = 0; i < hashInput.length; i++) hash = ((hash << 5) + hash + hashInput.charCodeAt(i)) >>> 0;

    return successResponse({
      nodes,
      edges,
      stats: { nodeCount: nodes.length, edgeCount: edges.length, nodesByType, hotspots },
      provenance: {
        generator: "atlas.insight-graph.deterministic",
        generatorVersion: "1.0.0",
        deterministic: true,
        graphHash: hash.toString(16).padStart(8, "0"),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[atlas/insight-graph] GET error:", err);
    return errorResponse("INTERNAL_ERROR", err instanceof Error ? err.message : "Failed to compute insight graph");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function queryPeriod(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<{ status: string }>`
    SELECT status FROM fin.fiscal_period
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fy} AND period_number = ${pn}
  `.execute(db);
  if (!result.rows[0]) return null;
  const monthName = pn >= 1 && pn <= 12 ? MONTH_NAMES[pn - 1] : `P${pn}`;
  return { status: (result.rows[0] as any).status, periodLabel: `${monthName} ${fy}` };
}

async function queryCloseRuns(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT id::text, run_number AS "runNumber", status, started_at::text AS "startedAt",
      CASE WHEN started_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (COALESCE(hard_closed_at, soft_closed_at, now()) - started_at)) / 86400.0)::text
        ELSE NULL END AS "elapsedDays"
    FROM fin.close_run
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fy} AND period_number = ${pn}
    ORDER BY run_number DESC
  `.execute(db);
  return result.rows as any[];
}

async function queryReleases(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT release_code AS "releaseCode", release_type AS "releaseType", status,
      is_clean_close AS "isCleanClose", override_count::int AS "overrideCount",
      close_run_id::text AS "closeRunId", requires_exception_signoff AS "requiresExceptionSignoff"
    FROM fin.pack_release
    WHERE tenant_id = ${tenantUuid}::uuid AND entity_code = ${entityCode}
      AND fiscal_year = ${fy} AND period_from <= ${pn} AND period_to >= ${pn}
    ORDER BY created_at DESC LIMIT ${limit}
  `.execute(db);
  return result.rows as any[];
}

async function queryAnomalies(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT a.id::text, a.anomaly_type AS "anomalyType", a.severity, a.title, a.status,
      c.account_code AS "accountCode", a.z_score::text AS "zScore",
      a.risk_signal_id::text AS "riskSignalId"
    FROM fin.atlas_anomaly a
    LEFT JOIN fin.chart_of_accounts c ON c.id = a.account_id
    WHERE a.tenant_id = ${tenantUuid}::uuid AND a.entity_code = ${entityCode}
      AND a.fiscal_year = ${fy} AND a.period_number = ${pn}
    ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
      a.detected_at DESC LIMIT ${limit}
  `.execute(db);
  return result.rows as any[];
}

async function queryRiskSignals(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT rs.id::text, rs.rule_code AS "ruleCode", rr.rule_type AS "ruleType",
      rs.severity, rs.signal_state AS "signalState", rs.title,
      rs.fired_at::text AS "firedAt",
      (rs.evidence->>'anomalyId')::text AS "triggerAnomalyId"
    FROM fin.close_risk_signal rs
    JOIN fin.close_risk_rule rr ON rr.id = rs.rule_id
    WHERE rs.tenant_id = ${tenantUuid}::uuid AND rs.entity_code = ${entityCode}
      AND rs.fiscal_year = ${fy} AND rs.period_number = ${pn}
    ORDER BY rs.fired_at DESC LIMIT ${limit}
  `.execute(db);
  return result.rows as any[];
}

async function queryTasks(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT cc.task_code AS "taskCode", pt.task_name AS "taskName",
      cc.task_status AS "taskStatus", pt.required_before AS "requiredBefore",
      cc.assigned_to AS "assignedTo"
    FROM fin.period_close_checklist cc
    JOIN fin.period_close_task pt ON pt.id = cc.task_id
    WHERE cc.tenant_id = ${tenantUuid}::uuid AND cc.entity_code = ${entityCode}
      AND cc.fiscal_year = ${fy} AND cc.period_number = ${pn}
    ORDER BY pt.sort_order, cc.task_code LIMIT ${limit}
  `.execute(db);
  return result.rows as any[];
}

async function queryReconciliations(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number, limit: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT rs.id::text, bs.statement_number AS "statementNumber", rs.status,
      rs.total_lines::int AS "totalLines",
      (rs.auto_matched + rs.manual_matched)::int AS "matchedLines",
      rs.discrepancy::text,
      c.account_code AS "bankAccountCode"
    FROM fin.reconciliation_session rs
    JOIN fin.bank_statement bs ON bs.id = rs.statement_id
    LEFT JOIN fin.chart_of_accounts c ON c.id = bs.bank_account_id
    WHERE rs.tenant_id = ${tenantUuid}::uuid AND bs.entity_code = ${entityCode}
      AND EXISTS (SELECT 1 FROM fin.fiscal_period fp
        WHERE fp.tenant_id = ${tenantUuid}::uuid AND fp.entity_code = ${entityCode}
          AND fp.fiscal_year = ${fy} AND fp.period_number = ${pn}
          AND bs.statement_date BETWEEN fp.start_date AND fp.end_date)
    ORDER BY bs.statement_date DESC LIMIT ${limit}
  `.execute(db);
  return result.rows as any[];
}

async function queryTaskDependencies(db: any, tenantUuid: string, entityCode: string) {
  const result = await sql<Record<string, unknown>>`
    SELECT pt_pred.task_code AS "predecessorCode",
      pt_succ.task_code AS "successorCode",
      cd.is_hard AS "isHardBlock"
    FROM fin.close_dependency cd
    JOIN fin.period_close_task pt_pred ON pt_pred.id = cd.predecessor_task_id
    JOIN fin.period_close_task pt_succ ON pt_succ.id = cd.successor_task_id
    WHERE cd.tenant_id = ${tenantUuid}::uuid AND cd.entity_code = ${entityCode}
  `.execute(db);
  return result.rows as any[];
}

async function queryAnomalyAccounts(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT c.account_code AS "accountCode", c.account_name AS "accountName",
      c.account_type AS "accountType", COUNT(a.id)::int AS "anomalyCount"
    FROM fin.atlas_anomaly a
    JOIN fin.chart_of_accounts c ON c.id = a.account_id
    WHERE a.tenant_id = ${tenantUuid}::uuid AND a.entity_code = ${entityCode}
      AND a.fiscal_year = ${fy} AND a.period_number = ${pn}
      AND a.account_id IS NOT NULL
    GROUP BY c.account_code, c.account_name, c.account_type
    ORDER BY COUNT(a.id) DESC
  `.execute(db);
  return result.rows as any[];
}

async function queryAnomalySignalLinks(db: any, tenantUuid: string, entityCode: string, fy: number, pn: number) {
  const result = await sql<Record<string, unknown>>`
    SELECT a.id::text AS "anomalyId", a.risk_signal_id::text AS "riskSignalId",
      rs.severity AS "signalSeverity"
    FROM fin.atlas_anomaly a
    JOIN fin.close_risk_signal rs ON rs.id = a.risk_signal_id
    WHERE a.tenant_id = ${tenantUuid}::uuid AND a.entity_code = ${entityCode}
      AND a.fiscal_year = ${fy} AND a.period_number = ${pn}
      AND a.risk_signal_id IS NOT NULL
  `.execute(db);
  return result.rows as any[];
}
