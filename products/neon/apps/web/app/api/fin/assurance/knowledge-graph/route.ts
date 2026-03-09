/**
 * Governance Knowledge Graph API — Phase 20
 *
 * GET /api/fin/assurance/knowledge-graph?entityCode=...&view=graph
 *   → governance graph edges (filterable by source_kind, target_kind)
 *
 * GET /api/fin/assurance/knowledge-graph?entityCode=...&view=memory
 *   → control memory cards per governance object
 *
 * GET /api/fin/assurance/knowledge-graph?entityCode=...&view=provenance
 *   → enriched proposals with historical context and confidence levels
 *
 * GET /api/fin/assurance/knowledge-graph?entityCode=...&view=pathways
 *   → issue→recommendation→program→outcome lifecycle pathways
 *
 * GET /api/fin/assurance/knowledge-graph?entityCode=...&view=summary
 *   → aggregated knowledge graph summary stats
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
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;
    if (!context) return unauthorizedResponse();

    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const url = new URL(req.url);

    const entityCode = url.searchParams.get("entityCode");
    const view = url.searchParams.get("view") ?? "summary";

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    switch (view) {
      case "graph":
        return await handleGraph(db, tenantUuid, entityCode, url);
      case "memory":
        return await handleMemory(db, tenantUuid, entityCode, url);
      case "provenance":
        return await handleProvenance(db, tenantUuid, entityCode);
      case "pathways":
        return await handlePathways(db, tenantUuid, entityCode, url);
      case "summary":
        return await handleSummary(db, tenantUuid, entityCode);
      default:
        return errorResponse("VALIDATION", `Unknown view: ${view}`, 400);
    }
  } catch (error) {
    console.error("[GET /api/fin/assurance/knowledge-graph] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load knowledge graph data");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleGraph(
  db: any,
  tenantUuid: string,
  entityCode: string,
  url: URL,
) {
  const sourceKind = url.searchParams.get("sourceKind");
  const targetKind = url.searchParams.get("targetKind");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10), 500);

  let query = sql`
    SELECT * FROM fin.vw_governance_graph
    WHERE tenant_id = ${tenantUuid}
      AND (entity_code = ${entityCode} OR entity_code IS NULL)
  `;

  if (sourceKind) {
    query = sql`${query} AND source_kind = ${sourceKind}`;
  }
  if (targetKind) {
    query = sql`${query} AND target_kind = ${targetKind}`;
  }

  query = sql`${query} ORDER BY edge_created_at DESC LIMIT ${limit}`;

  const result = await query.execute(db);
  const rows = result.rows as any[];

  // Compute node summary from edges
  const nodeMap = new Map<string, { kind: string; id: string; label: string; edgeCount: number }>();
  for (const r of rows) {
    const srcKey = `${r.source_kind}:${r.source_id}`;
    const tgtKey = `${r.target_kind}:${r.target_id}`;
    if (!nodeMap.has(srcKey)) {
      nodeMap.set(srcKey, { kind: r.source_kind, id: r.source_id, label: r.source_label ?? "", edgeCount: 0 });
    }
    nodeMap.get(srcKey)!.edgeCount++;
    if (r.target_id && !nodeMap.has(tgtKey)) {
      nodeMap.set(tgtKey, { kind: r.target_kind, id: r.target_id, label: "", edgeCount: 0 });
    }
    if (r.target_id) nodeMap.get(tgtKey)!.edgeCount++;
  }

  return successResponse({
    data: {
      edges: rows.map((r) => ({
        sourceKind: r.source_kind,
        sourceId: r.source_id,
        sourceLabel: r.source_label,
        targetKind: r.target_kind,
        targetId: r.target_id,
        edgeType: r.edge_type,
        edgeState: r.edge_state,
        edgeWeight: r.edge_weight,
        edgeCreatedAt: r.edge_created_at,
        fiscalYear: r.fiscal_year,
        periodNumber: r.period_number,
      })),
      nodes: Array.from(nodeMap.values()),
      totalEdges: rows.length,
      totalNodes: nodeMap.size,
    },
  });
}

async function handleMemory(
  db: any,
  tenantUuid: string,
  entityCode: string,
  url: URL,
) {
  const objectKind = url.searchParams.get("objectKind");

  let query;
  if (objectKind) {
    query = sql`
      SELECT * FROM fin.vw_control_memory
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND object_kind = ${objectKind}
      ORDER BY occurrence_count DESC
    `;
  } else {
    query = sql`
      SELECT * FROM fin.vw_control_memory
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
      ORDER BY object_kind, occurrence_count DESC
    `;
  }

  const result = await query.execute(db);
  const rows = result.rows as any[];

  return successResponse({
    data: rows.map((r) => ({
      objectKind: r.object_kind,
      objectKey: r.object_key,
      objectSubtype: r.object_subtype,
      objectLabel: r.object_label,
      occurrenceCount: Number(r.occurrence_count),
      programsCreated: Number(r.programs_created),
      programsCompleted: Number(r.programs_completed),
      everResolved: r.ever_resolved,
      memoryData: r.memory_data,
    })),
  });
}

async function handleProvenance(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const result = await sql`
    SELECT * FROM fin.vw_proposal_provenance
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY
      CASE confidence_level
        WHEN 'high_confidence' THEN 1
        WHEN 'moderate_confidence' THEN 2
        WHEN 'no_precedent' THEN 3
        WHEN 'low_confidence' THEN 4
        WHEN 'previously_rejected' THEN 5
      END,
      CASE suggested_priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2
        WHEN 'medium' THEN 3 ELSE 4 END
  `.execute(db);

  const rows = result.rows as any[];

  return successResponse({
    data: rows.map((r) => ({
      entityCode: r.entity_code,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
      proposalSource: r.proposal_source,
      suggestedProgramType: r.suggested_program_type,
      suggestedPriority: r.suggested_priority,
      suggestedTitle: r.suggested_title,
      rationale: r.rationale,
      fingerprint: r.fingerprint,
      gapKey: r.gap_key,
      // Evidence
      evidenceData: r.evidence_data,
      // Control Memory
      gapOccurrenceCount: Number(r.gap_occurrence_count ?? 0),
      gapProgramsEverCreated: Number(r.gap_programs_ever_created ?? 0),
      gapProgramsEverCompleted: Number(r.gap_programs_ever_completed ?? 0),
      gapEverResolved: r.gap_ever_resolved ?? false,
      gapMemory: r.gap_memory,
      // Similar Programs
      similarProgramCount: Number(r.similar_program_count ?? 0),
      similarCompleted: Number(r.similar_completed ?? 0),
      similarCancelled: Number(r.similar_cancelled ?? 0),
      similarHealthy: Number(r.similar_healthy ?? 0),
      similarAvgDays: r.similar_avg_days != null ? Number(r.similar_avg_days) : null,
      similarAvgMilestonePct: r.similar_avg_milestone_pct != null ? String(r.similar_avg_milestone_pct) : null,
      similarSuccessRate: r.similar_success_rate != null ? String(r.similar_success_rate) : null,
      // Proposal History
      timesPreviouslyProposed: Number(r.times_previously_proposed ?? 0),
      timesPreviouslyAccepted: Number(r.times_previously_accepted ?? 0),
      timesPreviouslyDismissed: Number(r.times_previously_dismissed ?? 0),
      lastDismissReason: r.last_dismiss_reason,
      // Confidence
      confidenceLevel: r.confidence_level,
    })),
  });
}

async function handlePathways(
  db: any,
  tenantUuid: string,
  entityCode: string,
  url: URL,
) {
  const stage = url.searchParams.get("stage"); // filter by pathway_stage

  let query;
  if (stage) {
    query = sql`
      SELECT * FROM fin.vw_governance_pathway
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
        AND pathway_stage = ${stage}
      ORDER BY issue_severity_count DESC, issue_key
    `;
  } else {
    query = sql`
      SELECT * FROM fin.vw_governance_pathway
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
      ORDER BY
        CASE pathway_stage
          WHEN 'full_pathway' THEN 1
          WHEN 'program_in_progress' THEN 2
          WHEN 'recommendation_only' THEN 3
          ELSE 4 END,
        issue_severity_count DESC
    `;
  }

  const result = await query.execute(db);
  const rows = result.rows as any[];

  // Compute pathway stats
  const stageDistribution: Record<string, number> = {};
  let successCount = 0;
  let totalWithOutcome = 0;
  for (const r of rows) {
    stageDistribution[r.pathway_stage] = (stageDistribution[r.pathway_stage] ?? 0) + 1;
    if (r.pathway_stage === "full_pathway") {
      totalWithOutcome++;
      if (r.pathway_successful) successCount++;
    }
  }

  return successResponse({
    data: {
      pathways: rows.map((r) => ({
        // Issue
        issueSource: r.issue_source,
        issueType: r.issue_type,
        issueKey: r.issue_key,
        issueLabel: r.issue_label,
        issueSeverityCount: Number(r.issue_severity_count),
        // Recommendation
        recommendationType: r.recommendation_type,
        policyArea: r.policy_area,
        recommendationTitle: r.recommendation_title,
        recommendationPriority: r.recommendation_priority,
        // Program
        programId: r.program_id,
        programCode: r.program_code,
        programTitle: r.program_title,
        programType: r.program_type,
        programStatus: r.program_status,
        programPriority: r.program_priority,
        programHealth: r.program_health,
        milestoneCompletionPct: r.milestone_completion_pct != null ? String(r.milestone_completion_pct) : null,
        elapsedDays: r.elapsed_days != null ? Number(r.elapsed_days) : null,
        // Outcome
        outcomeMetric: r.outcome_metric,
        baselineValue: r.baseline_value != null ? String(r.baseline_value) : null,
        baselineTrafficLight: r.baseline_traffic_light,
        currentValue: r.current_value != null ? String(r.current_value) : null,
        currentTrafficLight: r.current_traffic_light,
        outcomeDirection: r.outcome_direction,
        // Pathway
        pathwayStage: r.pathway_stage,
        pathwaySuccessful: r.pathway_successful,
      })),
      stats: {
        total: rows.length,
        stageDistribution,
        successRate: totalWithOutcome > 0
          ? String(Math.round(successCount / totalWithOutcome * 100))
          : "0",
      },
    },
  });
}

async function handleSummary(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const [graphResult, memoryResult, pathwayResult] = await Promise.all([
    // Graph edge counts by type
    sql`
      SELECT
        source_kind,
        target_kind,
        edge_type,
        count(*) AS edge_count
      FROM fin.vw_governance_graph
      WHERE tenant_id = ${tenantUuid}
        AND (entity_code = ${entityCode} OR entity_code IS NULL)
      GROUP BY source_kind, target_kind, edge_type
      ORDER BY edge_count DESC
      LIMIT 30
    `.execute(db),

    // Memory object counts
    sql`
      SELECT
        object_kind,
        count(*) AS object_count,
        sum(occurrence_count) AS total_occurrences,
        count(*) FILTER (WHERE ever_resolved) AS resolved_count,
        count(*) FILTER (WHERE programs_created > 0) AS with_programs
      FROM fin.vw_control_memory
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
      GROUP BY object_kind
    `.execute(db),

    // Pathway stage distribution
    sql`
      SELECT
        pathway_stage,
        count(*) AS pathway_count,
        count(*) FILTER (WHERE pathway_successful) AS successful_count
      FROM fin.vw_governance_pathway
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
      GROUP BY pathway_stage
    `.execute(db),
  ]);

  const graphEdges = graphResult.rows as any[];
  const memoryObjects = memoryResult.rows as any[];
  const pathways = pathwayResult.rows as any[];

  // Total graph stats
  const totalEdges = graphEdges.reduce((sum, r) => sum + Number(r.edge_count), 0);
  const uniqueEdgeTypes = new Set(graphEdges.map((r) => r.edge_type)).size;
  const uniqueNodeKinds = new Set([
    ...graphEdges.map((r) => r.source_kind),
    ...graphEdges.map((r) => r.target_kind),
  ]).size;

  return successResponse({
    data: {
      graph: {
        totalEdges,
        uniqueEdgeTypes,
        uniqueNodeKinds,
        topEdgeTypes: graphEdges.slice(0, 10).map((r) => ({
          sourceKind: r.source_kind,
          targetKind: r.target_kind,
          edgeType: r.edge_type,
          count: Number(r.edge_count),
        })),
      },
      memory: {
        objects: memoryObjects.map((r) => ({
          objectKind: r.object_kind,
          count: Number(r.object_count),
          totalOccurrences: Number(r.total_occurrences),
          resolvedCount: Number(r.resolved_count),
          withPrograms: Number(r.with_programs),
        })),
      },
      pathways: {
        stages: pathways.map((r) => ({
          stage: r.pathway_stage,
          count: Number(r.pathway_count),
          successful: Number(r.successful_count),
        })),
      },
    },
  });
}
