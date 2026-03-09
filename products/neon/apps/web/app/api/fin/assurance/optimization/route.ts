/**
 * Control Optimization API — Phase 19
 *
 * GET /api/fin/assurance/optimization?entityCode=...&view=proposals
 *   → auto-generated program proposals from vw_program_proposal
 *
 * GET /api/fin/assurance/optimization?entityCode=...&view=learning
 *   → effectiveness learning insights from vw_effectiveness_learning
 *
 * GET /api/fin/assurance/optimization?entityCode=...&view=summary
 *   → combined optimization summary (proposal count + top learning insights)
 *
 * POST /api/fin/assurance/optimization
 *   → accept proposal (creates program), dismiss proposal, or materialize proposals
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
// GET — proposals / learning / summary
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
    const view = url.searchParams.get("view") ?? "proposals";

    if (!entityCode) {
      return errorResponse("VALIDATION", "entityCode is required", 400);
    }

    switch (view) {
      case "proposals":
        return await handleProposals(db, tenantUuid, entityCode);
      case "learning":
        return await handleLearning(db, tenantUuid, entityCode);
      case "summary":
        return await handleSummary(db, tenantUuid, entityCode);
      default:
        return errorResponse("VALIDATION", `Unknown view: ${view}`, 400);
    }
  } catch (error) {
    console.error("[GET /api/fin/assurance/optimization] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to load optimization data");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// POST — accept / dismiss / materialize proposals
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { action } = body as { action: string };

    if (!action) {
      return errorResponse("VALIDATION", "action is required", 400);
    }

    const userId = context.userId ?? "api_call";

    switch (action) {
      case "accept_proposal":
        return await handleAcceptProposal(db, tenantUuid, body, userId);
      case "dismiss_proposal":
        return await handleDismissProposal(db, tenantUuid, body, userId);
      case "materialize":
        return await handleMaterialize(db, tenantUuid, body.entityCode, userId);
      default:
        return errorResponse("VALIDATION", `Invalid action: ${action}`, 400);
    }
  } catch (error) {
    console.error("[POST /api/fin/assurance/optimization] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to process optimization action");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// GET handlers
// ---------------------------------------------------------------------------

async function handleProposals(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const result = await sql`
    SELECT * FROM fin.vw_program_proposal
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY
      CASE suggested_priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2
        WHEN 'medium' THEN 3 ELSE 4 END,
      proposal_source
  `.execute(db);

  const rows = result.rows as any[];
  return successResponse({
    data: rows.map((r) => ({
      tenantId: r.tenant_id,
      entityCode: r.entity_code,
      fiscalYear: r.fiscal_year,
      periodNumber: r.period_number,
      proposalSource: r.proposal_source,
      suggestedProgramType: r.suggested_program_type,
      suggestedPriority: r.suggested_priority,
      suggestedTitle: r.suggested_title,
      rationale: r.rationale,
      proposalData: r.proposal_data,
      fingerprint: r.fingerprint,
    })),
  });
}

async function handleLearning(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const result = await sql`
    SELECT * FROM fin.vw_effectiveness_learning
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
    ORDER BY total_recommendations DESC
  `.execute(db);

  const rows = result.rows as any[];
  return successResponse({
    data: rows.map((r) => ({
      entityCode: r.entity_code,
      policyCode: r.policy_code,
      policyName: r.policy_name,
      triggerType: r.trigger_type,
      actionType: r.action_type,
      severity: r.severity,
      executionMode: r.execution_mode,
      totalRecommendations: Number(r.total_recommendations),
      acceptedCount: Number(r.accepted_count),
      dismissedCount: Number(r.dismissed_count),
      executedCount: Number(r.executed_count),
      expiredCount: Number(r.expired_count),
      periodsActive: Number(r.periods_active),
      acceptanceRate: String(r.acceptance_rate),
      effectiveCount: Number(r.effective_count),
      ineffectiveCount: Number(r.ineffective_count),
      ratedCount: Number(r.rated_count),
      effectivenessRate: String(r.effectiveness_rate),
      actionTypeTotal: Number(r.action_type_total),
      actionTypeEffectiveness: String(r.action_type_effectiveness),
      effectivenessClass: r.effectiveness_class,
      tuningSuggestion: r.tuning_suggestion,
      firstProposedAt: r.first_proposed_at,
      lastProposedAt: r.last_proposed_at,
    })),
  });
}

async function handleSummary(
  db: any,
  tenantUuid: string,
  entityCode: string,
) {
  const [proposalResult, learningResult] = await Promise.all([
    sql`
      SELECT
        count(*) AS total_proposals,
        count(*) FILTER (WHERE suggested_priority IN ('critical', 'high')) AS urgent_proposals,
        count(*) FILTER (WHERE proposal_source = 'benchmark_red_light') AS benchmark_proposals,
        count(*) FILTER (WHERE proposal_source = 'chronic_issue') AS chronic_proposals,
        count(*) FILTER (WHERE proposal_source = 'policy_recommendation') AS recommendation_proposals
      FROM fin.vw_program_proposal
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
    `.execute(db),

    sql`
      SELECT
        count(*) AS total_policies,
        count(*) FILTER (WHERE rated_count >= 3) AS policies_with_data,
        round(avg(effectiveness_rate) FILTER (WHERE rated_count >= 3), 1) AS avg_effectiveness,
        round(avg(acceptance_rate), 1) AS avg_acceptance,
        count(*) FILTER (WHERE tuning_suggestion = 'consider_disabling') AS policies_to_disable,
        count(*) FILTER (WHERE tuning_suggestion = 'promote_to_auto') AS policies_to_promote,
        count(*) FILTER (WHERE tuning_suggestion = 'frequently_rejected') AS policies_rejected,
        count(*) FILTER (WHERE tuning_suggestion = 'timing_issue') AS policies_timing_issue
      FROM fin.vw_effectiveness_learning
      WHERE tenant_id = ${tenantUuid}
        AND entity_code = ${entityCode}
    `.execute(db),
  ]);

  const ps = (proposalResult.rows as any[])[0] ?? {};
  const ls = (learningResult.rows as any[])[0] ?? {};

  return successResponse({
    data: {
      proposals: {
        total: Number(ps.total_proposals ?? 0),
        urgent: Number(ps.urgent_proposals ?? 0),
        bySource: {
          benchmarkRedLight: Number(ps.benchmark_proposals ?? 0),
          chronicIssue: Number(ps.chronic_proposals ?? 0),
          policyRecommendation: Number(ps.recommendation_proposals ?? 0),
        },
      },
      learning: {
        totalPolicies: Number(ls.total_policies ?? 0),
        policiesWithData: Number(ls.policies_with_data ?? 0),
        avgEffectiveness: String(ls.avg_effectiveness ?? "0"),
        avgAcceptance: String(ls.avg_acceptance ?? "0"),
        tuning: {
          considerDisabling: Number(ls.policies_to_disable ?? 0),
          promoteToAuto: Number(ls.policies_to_promote ?? 0),
          frequentlyRejected: Number(ls.policies_rejected ?? 0),
          timingIssue: Number(ls.policies_timing_issue ?? 0),
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// POST handlers
// ---------------------------------------------------------------------------

async function handleAcceptProposal(
  db: any,
  tenantUuid: string,
  body: any,
  userId: string,
) {
  const { entityCode, fingerprint } = body;
  if (!entityCode || !fingerprint) {
    return errorResponse("VALIDATION", "entityCode and fingerprint are required", 400);
  }

  // Load the proposal from the view
  const proposalResult = await sql`
    SELECT * FROM fin.vw_program_proposal
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
      AND fingerprint = ${fingerprint}
    LIMIT 1
  `.execute(db);

  const proposal = (proposalResult.rows as any[])[0];
  if (!proposal) {
    return errorResponse("NOT_FOUND", "Proposal not found or already addressed", 404);
  }

  const data = proposal.proposal_data;
  const suggestedGaps = data?.suggested_gaps ?? [];
  const suggestedOutcomes = data?.suggested_outcomes ?? {};

  // Generate program_code
  const seqResult = await sql`
    SELECT count(*) + 1 AS seq FROM fin.control_program
    WHERE tenant_id = ${tenantUuid} AND entity_code = ${entityCode}
  `.execute(db);
  const seq = (seqResult.rows as any[])[0]?.seq ?? 1;
  const programCode = `CP-${entityCode}-${String(seq).padStart(3, "0")}`;

  // Create the control_program
  const programResult = await sql`
    INSERT INTO fin.control_program (
      tenant_id, entity_code, program_code, title, description,
      program_type, priority, linked_gaps, target_outcomes,
      fiscal_year, created_by
    ) VALUES (
      ${tenantUuid}, ${entityCode}, ${programCode},
      ${proposal.suggested_title},
      ${proposal.rationale},
      ${proposal.suggested_program_type},
      ${proposal.suggested_priority},
      ${JSON.stringify(suggestedGaps)}::jsonb,
      ${JSON.stringify(suggestedOutcomes)}::jsonb,
      ${proposal.fiscal_year > 0 ? proposal.fiscal_year : null},
      ${userId}
    ) RETURNING id
  `.execute(db);

  const programId = (programResult.rows as any[])[0]?.id;

  // Log the acceptance in close_action_log for learning
  await sql`
    INSERT INTO fin.close_action_log (
      tenant_id, entity_code, fiscal_year, period_number,
      policy_code, action_type, action_params, trigger_context,
      status, decided_at, decided_by, fingerprint
    ) VALUES (
      ${tenantUuid}, ${entityCode},
      ${proposal.fiscal_year ?? 0}, ${proposal.period_number ?? 0},
      ${'autonomous_optimizer'}, ${'propose_program'},
      ${JSON.stringify({ programId, programCode })}::jsonb,
      ${JSON.stringify(data)}::jsonb,
      'accepted', now(), ${userId}, ${fingerprint}
    )
    ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, fingerprint)
      WHERE fingerprint IS NOT NULL AND status NOT IN ('dismissed', 'expired', 'failed')
    DO NOTHING
  `.execute(db);

  return successResponse({
    data: { programId, programCode, title: proposal.suggested_title },
  });
}

async function handleDismissProposal(
  db: any,
  tenantUuid: string,
  body: any,
  userId: string,
) {
  const { entityCode, fingerprint, reason } = body;
  if (!entityCode || !fingerprint) {
    return errorResponse("VALIDATION", "entityCode and fingerprint are required", 400);
  }

  // Log the dismissal
  await sql`
    INSERT INTO fin.close_action_log (
      tenant_id, entity_code, fiscal_year, period_number,
      policy_code, action_type, trigger_context,
      status, decided_at, decided_by, outcome_notes, fingerprint
    ) VALUES (
      ${tenantUuid}, ${entityCode}, 0, 0,
      ${'autonomous_optimizer'}, ${'propose_program'},
      '{}'::jsonb,
      'dismissed', now(), ${userId}, ${reason ?? null}, ${fingerprint}
    )
    ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, fingerprint)
      WHERE fingerprint IS NOT NULL AND status NOT IN ('dismissed', 'expired', 'failed')
    DO UPDATE SET status = 'dismissed', decided_at = now(),
                  decided_by = ${userId}, outcome_notes = ${reason ?? null}
  `.execute(db);

  return successResponse({ data: { dismissed: true } });
}

async function handleMaterialize(
  db: any,
  tenantUuid: string,
  entityCode: string,
  userId: string,
) {
  if (!entityCode) {
    return errorResponse("VALIDATION", "entityCode is required", 400);
  }

  // Load all current proposals
  const result = await sql`
    SELECT * FROM fin.vw_program_proposal
    WHERE tenant_id = ${tenantUuid}
      AND entity_code = ${entityCode}
  `.execute(db);

  const proposals = result.rows as any[];

  // Insert each as a proposed close_action_log entry
  let materialized = 0;
  for (const p of proposals) {
    const insertResult = await sql`
      INSERT INTO fin.close_action_log (
        tenant_id, entity_code, fiscal_year, period_number,
        policy_code, action_type, action_params, trigger_context,
        status, fingerprint
      ) VALUES (
        ${tenantUuid}, ${entityCode},
        ${p.fiscal_year ?? 0}, ${p.period_number ?? 0},
        ${'autonomous_optimizer'}, ${'propose_program'},
        ${JSON.stringify({ suggestedTitle: p.suggested_title, suggestedType: p.suggested_program_type })}::jsonb,
        ${JSON.stringify(p.proposal_data)}::jsonb,
        'proposed', ${p.fingerprint}
      )
      ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number, fingerprint)
        WHERE fingerprint IS NOT NULL AND status NOT IN ('dismissed', 'expired', 'failed')
      DO NOTHING
    `.execute(db);

    if ((insertResult as any).numAffectedRows > 0n || (insertResult as any).numChangedRows > 0) {
      materialized++;
    }
  }

  return successResponse({
    data: { totalProposals: proposals.length, materialized },
  });
}
