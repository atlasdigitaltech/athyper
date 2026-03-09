/**
 * Governance Explainability API
 *
 * GET /api/admin/governance/explain?type=retention&schema=evt&table=event
 * GET /api/admin/governance/explain?type=tiering&schema=evt&table=event
 * GET /api/admin/governance/explain?type=quota&quotaKey=api_rate_limit
 * GET /api/admin/governance/explain?type=privacy&entity=Employee&field=tax_id
 *
 * Returns structured explanations of governance decisions for admin dashboards.
 */

export const runtime = "nodejs";

import { sql } from "kysely";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDb } from "@/lib/db";
import { getApiContext, resolveTenantUuid, unauthorizedResponse } from "@/lib/api-context";

export async function GET(req: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "Database not configured" } },
      { status: 503 },
    );
  }

  const { context } = await getApiContext();
  if (!context) return unauthorizedResponse();
  const tid = await resolveTenantUuid(db, context.tenantId);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  try {
    switch (type) {
      case "retention": {
        const schema = url.searchParams.get("schema") ?? "evt";
        const table = url.searchParams.get("table") ?? "event";
        const entityId = url.searchParams.get("entityId") ?? null;

        // Resolve winning policy
        const resolved = await sql<{
          policy_id: string;
          retention_days: number;
          action_on_expiry: string;
          compliance_framework: string | null;
          legal_hold: boolean;
          resolved_scope: string;
          priority: number;
        }>`
          SELECT * FROM core.resolve_retention_policy(
            ${tid}::uuid, ${schema}, ${table}, ${entityId}::uuid
          )
        `.execute(db);

        // All candidates
        const candidates = await sql<{
          id: string;
          policy_scope: string;
          retention_days: number;
          priority: number;
          is_active: boolean;
        }>`
          SELECT id, policy_scope, retention_days, priority, is_active
          FROM core.data_retention_policy
          WHERE tenant_id = ${tid}::uuid
            AND target_schema = ${schema}
            AND (target_table = ${table} OR target_table IS NULL)
          ORDER BY
            CASE policy_scope WHEN 'entity' THEN 1 WHEN 'table' THEN 2 WHEN 'schema' THEN 3 END,
            priority DESC
        `.execute(db);

        // Active legal holds affecting this scope
        const holds = await sql<{
          id: string;
          hold_reference: string;
          hold_source: string;
          reason: string;
          scope_type: string;
          issued_by: string;
          issued_at: Date;
        }>`
          SELECT id, hold_reference, hold_source, reason, scope_type, issued_by, issued_at
          FROM core.legal_hold
          WHERE tenant_id = ${tid}::uuid
            AND released_at IS NULL
            AND (
              scope_type = 'global'
              OR (scope_type = 'schema' AND target_schema = ${schema})
              OR (scope_type = 'table' AND target_schema = ${schema} AND target_table = ${table})
            )
        `.execute(db);

        const winner = resolved.rows[0] ?? null;

        return NextResponse.json({
          success: true,
          data: {
            type: "retention",
            resolvedPolicy: winner ? {
              policyId: winner.policy_id,
              retentionDays: winner.retention_days,
              actionOnExpiry: winner.action_on_expiry,
              complianceFramework: winner.compliance_framework,
              legalHold: winner.legal_hold,
              resolvedScope: winner.resolved_scope,
              priority: winner.priority,
            } : null,
            candidatePolicies: candidates.rows.map((c) => ({
              policyId: c.id,
              scope: c.policy_scope,
              retentionDays: c.retention_days,
              priority: c.priority,
              isActive: c.is_active,
              isWinner: c.id === winner?.policy_id,
            })),
            activeHolds: holds.rows.map((h) => ({
              holdId: h.id,
              reference: h.hold_reference,
              source: h.hold_source,
              reason: h.reason,
              scopeType: h.scope_type,
              issuedBy: h.issued_by,
              issuedAt: h.issued_at,
            })),
            explanation: winner
              ? `Retention: ${winner.resolved_scope} scope, ${winner.retention_days} days, action=${winner.action_on_expiry}. ${winner.legal_hold ? "LEGAL HOLD ACTIVE — processing frozen." : ""} ${candidates.rows.length - 1} other candidate(s).`
              : `No active retention policy for ${schema}.${table}. Default 90-day retention applies.`,
          },
        });
      }

      case "tiering": {
        const schema = url.searchParams.get("schema") ?? "evt";
        const table = url.searchParams.get("table") ?? "event";
        const domain = url.searchParams.get("domain") ?? null;

        const tiering = await sql<{
          policy_id: string;
          hot_months: number;
          warm_months: number;
          warm_strategy: string;
          cold_strategy: string;
          priority: number;
          legal_hold: boolean;
        }>`
          SELECT * FROM evt.resolve_tiering_policy(
            ${tid}::uuid, ${schema}, ${table}, ${domain}
          )
        `.execute(db);

        const retention = await sql<{ retention_days: number }>`
          SELECT retention_days FROM core.resolve_retention_policy(
            ${tid}::uuid, ${schema}, ${table}
          )
        `.execute(db);

        const tier = tiering.rows[0] ?? null;
        const ret = retention.rows[0] ?? null;
        const warmDays = tier ? tier.warm_months * 30 : null;
        const isConsistent = !ret || !warmDays || ret.retention_days >= warmDays;

        return NextResponse.json({
          success: true,
          data: {
            type: "tiering",
            resolvedPolicy: tier ? {
              policyId: tier.policy_id,
              hotMonths: tier.hot_months,
              warmMonths: tier.warm_months,
              warmStrategy: tier.warm_strategy,
              coldStrategy: tier.cold_strategy,
              priority: tier.priority,
              legalHold: tier.legal_hold,
            } : null,
            retentionConstraint: {
              retentionDays: ret?.retention_days ?? null,
              warmMonthsDays: warmDays,
              isConsistent,
              warning: isConsistent ? null : `retention_days (${ret?.retention_days}) < warm_months*30 (${warmDays})`,
            },
            explanation: tier
              ? `HOT (0-${tier.hot_months}mo) → WARM/${tier.warm_strategy} → COLD/${tier.cold_strategy}. ${tier.legal_hold ? "LEGAL HOLD — transitions frozen." : ""}`
              : "No tiering policy. Data stays in HOT tier.",
          },
        });
      }

      case "quota": {
        const quotaKey = url.searchParams.get("quotaKey") ?? "api_rate_limit";

        const check = await sql<{
          allowed: boolean;
          current_value: number;
          limit_value: number;
          remaining: number;
          enforcement: string;
          overage_action: string;
        }>`
          SELECT * FROM core.check_quota(${tid}::uuid, ${quotaKey}, 0::bigint)
        `.execute(db);

        const snapshots = await sql<{
          measured_value: number;
          limit_at_time: number;
          utilization_pct: number;
          period_end: Date;
          measured_by: string;
        }>`
          SELECT s.measured_value, s.limit_at_time, s.utilization_pct, s.period_end, s.measured_by
          FROM core.quota_usage_snapshot s
          JOIN core.tenant_resource_quota q ON s.quota_id = q.id
          WHERE q.tenant_id = ${tid}::uuid AND q.quota_key = ${quotaKey}
          ORDER BY s.period_end DESC
          LIMIT 10
        `.execute(db);

        const decision = check.rows[0] ?? null;

        return NextResponse.json({
          success: true,
          data: {
            type: "quota",
            quotaKey,
            decision: decision ? {
              allowed: decision.allowed,
              currentValue: decision.current_value,
              limitValue: decision.limit_value,
              remaining: decision.remaining,
              enforcement: decision.enforcement,
              overageAction: decision.overage_action,
            } : null,
            recentSnapshots: snapshots.rows.map((s) => ({
              measuredValue: s.measured_value,
              limitAtTime: s.limit_at_time,
              utilizationPct: s.utilization_pct,
              periodEnd: s.period_end,
              measuredBy: s.measured_by,
            })),
          },
        });
      }

      case "privacy": {
        const entity = url.searchParams.get("entity");
        const field = url.searchParams.get("field");
        if (!entity || !field) {
          return NextResponse.json(
            { success: false, error: { code: "BAD_REQUEST", message: "entity and field params required" } },
            { status: 400 },
          );
        }

        const pii = await sql<{
          pii_classification: string | null;
          mask_strategy: string | null;
          lawful_basis: string | null;
          consent_required: boolean;
          retention_override_days: number | null;
          anonymization_strategy: string | null;
          cross_border_restricted: boolean;
          data_subject_type: string | null;
        }>`
          SELECT pii_classification, mask_strategy, lawful_basis, consent_required,
                 retention_override_days, anonymization_strategy,
                 cross_border_restricted, data_subject_type
          FROM meta.pii_field_inventory
          WHERE tenant_id = ${tid}::uuid
            AND entity_name = ${entity}
            AND field_path = ${field}
          LIMIT 1
        `.execute(db);

        const policies = await sql<{
          id: string;
          policy_type: string;
          scope: string;
          priority: number;
          role_list: string[];
          is_active: boolean;
        }>`
          SELECT fsp.id, fsp.policy_type, fsp.scope, fsp.priority, fsp.role_list, fsp.is_active
          FROM meta.field_security_policy fsp
          JOIN meta.entity e ON fsp.entity_id = e.id AND fsp.tenant_id = e.tenant_id
          WHERE fsp.tenant_id = ${tid}::uuid
            AND e.name = ${entity}
            AND fsp.field_path = ${field}
          ORDER BY fsp.priority DESC
        `.execute(db);

        const p = pii.rows[0] ?? null;

        return NextResponse.json({
          success: true,
          data: {
            type: "privacy",
            entity,
            field,
            piiClassification: p?.pii_classification ?? null,
            maskStrategy: p?.mask_strategy ?? null,
            privacyMetadata: p ? {
              lawfulBasis: p.lawful_basis,
              consentRequired: p.consent_required ?? false,
              retentionOverrideDays: p.retention_override_days,
              anonymizationStrategy: p.anonymization_strategy,
              crossBorderRestricted: p.cross_border_restricted ?? false,
              dataSubjectType: p.data_subject_type,
            } : null,
            appliedPolicies: policies.rows.map((r) => ({
              policyId: r.id,
              policyType: r.policy_type,
              scope: r.scope,
              priority: r.priority,
              roleList: r.role_list ?? [],
              isActive: r.is_active,
            })),
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "type must be one of: retention, tiering, quota, privacy" } },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error("[governance/explain] Error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      { status: 500 },
    );
  }
}
