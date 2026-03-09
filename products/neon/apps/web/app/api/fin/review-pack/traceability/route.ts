/**
 * Assurance Traceability API — Phase 14
 *
 * GET /api/fin/review-pack/traceability?entityCode=...&fiscalYear=...&periodNumber=...
 *   → Returns section-level provenance links tracing each review section
 *     back to its system evidence (readiness snapshot, certification,
 *     publication, overrides, close tasks, action items, decisions).
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
// GET — assurance traceability
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
    const fiscalYear = parseInt(url.searchParams.get("fiscalYear") ?? "", 10);
    const periodNumber = parseInt(url.searchParams.get("periodNumber") ?? "", 10);

    if (!entityCode || isNaN(fiscalYear) || isNaN(periodNumber)) {
      return errorResponse("VALIDATION", "entityCode, fiscalYear, and periodNumber are required", 400);
    }

    // Gather provenance evidence from multiple sources in parallel
    const [
      readinessSnapshotResult,
      certificationResult,
      publicationResult,
      overrideResult,
      closeTaskResult,
      actionItemResult,
      decisionResult,
      commentaryResult,
      activityResult,
    ] = await Promise.all([
      // 1. Latest readiness snapshot
      sql`
        SELECT s.id, s.readiness_score, s.completion_pct, s.sla_status,
               s.captured_at, cr.run_number
        FROM fin.close_readiness_snapshot s
        JOIN fin.close_run cr ON cr.id = s.run_id
        WHERE cr.tenant_id = ${tenantUuid}
          AND cr.entity_code = ${entityCode}
          AND cr.fiscal_year = ${fiscalYear}
          AND cr.period_number = ${periodNumber}
        ORDER BY s.captured_at DESC LIMIT 1
      `.execute(db),

      // 2. Certification chain
      sql`
        SELECT c.id, c.certification_status,
               c.prepared_by_name, c.prepared_at,
               c.reviewed_by_name, c.reviewed_at,
               c.approved_by_name, c.approved_at,
               c.certified_by_name, c.certified_at,
               c.readiness_score_at_cert, c.active_override_count,
               c.created_at
        FROM fin.pack_certification c
        JOIN fin.report_pack_instance pi ON pi.id = c.pack_instance_id
        WHERE c.tenant_id = ${tenantUuid}
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
        ORDER BY c.created_at DESC LIMIT 1
      `.execute(db),

      // 3. Publication manifest items
      sql`
        SELECT pmi.id, pmi.artifact_type, pmi.definition_code,
               pmi.artifact_hash, pmi.created_at,
               pb.status AS batch_status, pb.manifest_hash
        FROM fin.publication_manifest_item pmi
        JOIN fin.publication_batch pb ON pb.id = pmi.publication_batch_id
        WHERE pmi.tenant_id = ${tenantUuid}
          AND pmi.entity_code = ${entityCode}
          AND pmi.fiscal_year = ${fiscalYear}
          AND pmi.period_number = ${periodNumber}
        ORDER BY pmi.created_at DESC
        LIMIT 20
      `.execute(db),

      // 4. Override evidence
      sql`
        SELECT o.id, o.override_type, o.description,
               o.impact_amount, o.status,
               o.approved_by_name, o.approved_at,
               o.created_at
        FROM fin.close_override o
        JOIN fin.close_run cr ON cr.id = o.run_id
        WHERE cr.tenant_id = ${tenantUuid}
          AND cr.entity_code = ${entityCode}
          AND cr.fiscal_year = ${fiscalYear}
          AND cr.period_number = ${periodNumber}
        ORDER BY abs(o.impact_amount) DESC
      `.execute(db),

      // 5. Close task summary
      sql`
        SELECT
          count(*) AS total_tasks,
          count(*) FILTER (WHERE task_status = 'COMPLETED') AS completed,
          count(*) FILTER (WHERE task_status = 'WAIVED') AS waived,
          count(*) FILTER (WHERE task_status IN ('BLOCKED','FAILED')) AS blocked,
          max(updated_at) AS last_updated
        FROM fin.period_close_checklist
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
      `.execute(db),

      // 6. Action items with provenance
      sql`
        SELECT id, title, severity, status, source, source_ref, created_at
        FROM fin.action_item
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
        ORDER BY created_at DESC
      `.execute(db),

      // 7. Decision evidence
      sql`
        SELECT id, decision_type, title, rationale,
               decided_by_name, decided_at,
               context_snapshot IS NOT NULL AS has_context
        FROM fin.decision_log
        WHERE tenant_id = ${tenantUuid}
          AND entity_code = ${entityCode}
          AND fiscal_year = ${fiscalYear}
          AND period_number = ${periodNumber}
        ORDER BY decided_at DESC
      `.execute(db),

      // 8. Commentary records
      sql`
        SELECT rc.id, rc.commentary_type, rc.title,
               rc.version, rc.author_name, rc.created_at
        FROM fin.report_commentary rc
        JOIN fin.report_pack_instance pi ON pi.id = rc.target_id
        WHERE rc.tenant_id = ${tenantUuid}
          AND rc.target_kind = 'pack_instance'
          AND rc.is_current = TRUE
          AND pi.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
        ORDER BY rc.commentary_type
      `.execute(db),

      // 9. Key activity events
      sql`
        SELECT pa.activity_type, pa.actor_type, pa.message,
               pa.created_at
        FROM fin.pack_activity pa
        JOIN fin.report_pack_instance pi ON pi.id = pa.pack_instance_id
        WHERE pa.tenant_id = ${tenantUuid}
          AND pa.entity_code = ${entityCode}
          AND pi.fiscal_year = ${fiscalYear}
          AND pi.period_to = ${periodNumber}
          AND pa.activity_type IN (
            'CERTIFICATION_GRANTED', 'APPROVAL_GRANTED',
            'DISTRIBUTION_SENT', 'STATUS_CHANGED', 'EXPORTED'
          )
        ORDER BY pa.created_at DESC
        LIMIT 20
      `.execute(db),
    ]);

    // Build section-level provenance mapping
    const provenance = buildProvenance({
      readinessSnapshot: (readinessSnapshotResult.rows as any[])[0] ?? null,
      certification: (certificationResult.rows as any[])[0] ?? null,
      publications: publicationResult.rows as any[],
      overrides: overrideResult.rows as any[],
      closeTasks: (closeTaskResult.rows as any[])[0] ?? null,
      actionItems: actionItemResult.rows as any[],
      decisions: decisionResult.rows as any[],
      commentary: commentaryResult.rows as any[],
      activities: activityResult.rows as any[],
    });

    return successResponse({ data: provenance });
  } catch (error) {
    console.error("[GET /api/fin/review-pack/traceability] Error:", error);
    return errorResponse("INTERNAL_ERROR", "Failed to compute traceability");
  } finally {
    await redis?.quit();
  }
}

// ---------------------------------------------------------------------------
// Build provenance per section
// ---------------------------------------------------------------------------

interface EvidenceLink {
  sourceType: string;   // readiness_snapshot, certification, override, close_task, etc.
  sourceId: string | null;
  label: string;
  detail: string;
  timestamp: string | null;
  integrity?: string;   // hash if available
}

interface SectionProvenance {
  sectionKey: string;
  title: string;
  evidence: EvidenceLink[];
}

function buildProvenance(data: {
  readinessSnapshot: any;
  certification: any;
  publications: any[];
  overrides: any[];
  closeTasks: any;
  actionItems: any[];
  decisions: any[];
  commentary: any[];
  activities: any[];
}): SectionProvenance[] {
  const sections: SectionProvenance[] = [];

  // Executive Summary — linked to readiness + certification
  const execEvidence: EvidenceLink[] = [];
  if (data.readinessSnapshot) {
    execEvidence.push({
      sourceType: "readiness_snapshot",
      sourceId: data.readinessSnapshot.id,
      label: "Readiness Snapshot",
      detail: `Score: ${data.readinessSnapshot.readiness_score}%, Completion: ${data.readinessSnapshot.completion_pct}%`,
      timestamp: data.readinessSnapshot.captured_at,
    });
  }
  if (data.certification) {
    execEvidence.push({
      sourceType: "certification",
      sourceId: data.certification.id,
      label: `Certification (${data.certification.certification_status})`,
      detail: data.certification.certified_by_name
        ? `Certified by ${data.certification.certified_by_name}`
        : `Status: ${data.certification.certification_status}`,
      timestamp: data.certification.certified_at ?? data.certification.created_at,
    });
  }
  if (data.closeTasks) {
    execEvidence.push({
      sourceType: "close_tasks",
      sourceId: null,
      label: "Close Task Summary",
      detail: `${data.closeTasks.completed}/${data.closeTasks.total_tasks} completed, ${data.closeTasks.waived} waived, ${data.closeTasks.blocked} blocked`,
      timestamp: data.closeTasks.last_updated,
    });
  }
  const narrativeComm = data.commentary.find((c: any) => c.commentary_type === "NARRATIVE");
  if (narrativeComm) {
    execEvidence.push({
      sourceType: "commentary",
      sourceId: narrativeComm.id,
      label: `Commentary v${narrativeComm.version}`,
      detail: `By ${narrativeComm.author_name ?? "system"}`,
      timestamp: narrativeComm.created_at,
    });
  }
  sections.push({ sectionKey: "executive_summary", title: "Executive Summary", evidence: execEvidence });

  // Key Exceptions — action items + blockers
  const exceptionEvidence: EvidenceLink[] = [];
  const criticalItems = data.actionItems.filter((a: any) =>
    a.severity === "critical" || a.severity === "high",
  );
  for (const item of criticalItems.slice(0, 5)) {
    exceptionEvidence.push({
      sourceType: "action_item",
      sourceId: item.id,
      label: `[${item.severity.toUpperCase()}] ${item.title}`,
      detail: `Status: ${item.status}, Source: ${item.source}`,
      timestamp: item.created_at,
    });
  }
  const riskComm = data.commentary.find((c: any) => c.commentary_type === "RISK");
  if (riskComm) {
    exceptionEvidence.push({
      sourceType: "commentary",
      sourceId: riskComm.id,
      label: `Risk Commentary v${riskComm.version}`,
      detail: `By ${riskComm.author_name ?? "system"}`,
      timestamp: riskComm.created_at,
    });
  }
  if (exceptionEvidence.length > 0) {
    sections.push({ sectionKey: "key_exceptions", title: "Key Exceptions & Risks", evidence: exceptionEvidence });
  }

  // Material Movements — GL + publication manifest
  const movementEvidence: EvidenceLink[] = [];
  for (const pub of data.publications.slice(0, 5)) {
    movementEvidence.push({
      sourceType: "publication_manifest",
      sourceId: pub.id,
      label: `${pub.artifact_type}: ${pub.definition_code}`,
      detail: `Batch: ${pub.batch_status}`,
      timestamp: pub.created_at,
      integrity: pub.artifact_hash,
    });
  }
  if (movementEvidence.length > 0) {
    sections.push({ sectionKey: "material_movements", title: "Material Financial Movements", evidence: movementEvidence });
  }

  // Controls & Overrides
  const controlEvidence: EvidenceLink[] = [];
  for (const override of data.overrides.slice(0, 5)) {
    controlEvidence.push({
      sourceType: "override",
      sourceId: override.id,
      label: `${override.override_type}: ${override.description}`,
      detail: `Impact: ${Number(override.impact_amount).toLocaleString()}, Status: ${override.status}`,
      timestamp: override.approved_at ?? override.created_at,
    });
  }
  if (controlEvidence.length > 0) {
    sections.push({ sectionKey: "controls_overrides", title: "Controls & Override Commentary", evidence: controlEvidence });
  }

  // Decisions & Follow-Up
  const decisionEvidence: EvidenceLink[] = [];
  for (const d of data.decisions.slice(0, 10)) {
    decisionEvidence.push({
      sourceType: "decision",
      sourceId: d.id,
      label: `[${d.decision_type.toUpperCase()}] ${d.title}`,
      detail: d.decided_by_name ? `By ${d.decided_by_name}` : "System",
      timestamp: d.decided_at,
    });
  }
  const actionComm = data.commentary.find((c: any) => c.commentary_type === "ACTION");
  if (actionComm) {
    decisionEvidence.push({
      sourceType: "commentary",
      sourceId: actionComm.id,
      label: `Action Commentary v${actionComm.version}`,
      detail: `By ${actionComm.author_name ?? "system"}`,
      timestamp: actionComm.created_at,
    });
  }
  if (decisionEvidence.length > 0) {
    sections.push({ sectionKey: "decisions_followup", title: "Decisions & Required Follow-Up", evidence: decisionEvidence });
  }

  // Key governance events
  const governanceEvidence: EvidenceLink[] = [];
  for (const act of data.activities.slice(0, 10)) {
    governanceEvidence.push({
      sourceType: "activity",
      sourceId: null,
      label: act.activity_type.replace(/_/g, " "),
      detail: act.message ?? `${act.actor_type} event`,
      timestamp: act.created_at,
    });
  }
  if (governanceEvidence.length > 0) {
    sections.push({ sectionKey: "governance_events", title: "Governance Events", evidence: governanceEvidence });
  }

  return sections;
}
