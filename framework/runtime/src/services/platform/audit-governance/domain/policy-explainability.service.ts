/**
 * Policy Explainability Service
 *
 * Provides structured explanations for governance decisions:
 *   - Retention policy resolution (which policy matched, why)
 *   - Tiering policy resolution (which tier, legal hold status)
 *   - Quota enforcement decisions (allowed/denied, remaining)
 *   - Field privacy controls (PII classification, lawful basis, masking)
 *
 * Follows the AuditExplainabilityService pattern: read-only queries that
 * reconstruct decision paths from governance tables.
 *
 * Surfaces:
 *   - Admin API: GET /api/admin/governance/explain/:type
 *   - Debug CLI: `athyper explain retention --schema=evt --table=event`
 *   - Neon admin dashboard: governance explanation panels
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface ActiveHoldInfo {
  holdId: string;
  holdReference: string;
  holdSource: string;
  reason: string;
  scopeType: string;
  issuedBy: string;
  issuedAt: Date;
  complianceFramework: string | null;
  heldManifestCount: number;
}

export interface RetentionExplanation {
  tenantId: string;
  targetSchema: string;
  targetTable: string | null;
  entityId: string | null;
  resolvedPolicy: {
    policyId: string;
    retentionDays: number;
    actionOnExpiry: string;
    complianceFramework: string | null;
    legalHold: boolean;
    resolvedScope: string;
    priority: number;
  } | null;
  candidatePolicies: Array<{
    policyId: string;
    scope: string;
    retentionDays: number;
    priority: number;
    isActive: boolean;
    legalHold: boolean;
    reason: string;
  }>;
  activeHolds: ActiveHoldInfo[];
  explanation: string;
}

export interface TieringExplanation {
  tenantId: string;
  sourceSchema: string;
  sourceTable: string;
  partitionDomain: string | null;
  resolvedPolicy: {
    policyId: string;
    hotMonths: number;
    warmMonths: number;
    warmStrategy: string;
    coldStrategy: string;
    priority: number;
    legalHold: boolean;
  } | null;
  retentionConstraint: {
    retentionDays: number | null;
    warmMonthsDays: number | null;
    isConsistent: boolean;
    warning: string | null;
  };
  activeHolds: ActiveHoldInfo[];
  explanation: string;
}

export interface QuotaExplanation {
  tenantId: string;
  quotaKey: string;
  decision: {
    allowed: boolean;
    currentValue: number;
    limitValue: number;
    remaining: number;
    enforcement: string;
    overageAction: string;
  } | null;
  utilizationPct: number;
  status: string;
  recentSnapshots: Array<{
    measuredValue: number;
    limitAtTime: number;
    utilizationPct: number;
    periodEnd: Date;
    measuredBy: string;
  }>;
  explanation: string;
}

export interface FieldPrivacyExplanation {
  tenantId: string;
  entityName: string;
  fieldPath: string;
  piiClassification: string | null;
  maskStrategy: string | null;
  privacyMetadata: {
    lawfulBasis: string | null;
    consentRequired: boolean;
    retentionOverrideDays: number | null;
    anonymizationStrategy: string | null;
    crossBorderRestricted: boolean;
    dataSubjectType: string | null;
  } | null;
  appliedPolicies: Array<{
    policyId: string;
    policyType: string;
    scope: string;
    priority: number;
    roleList: string[];
    isActive: boolean;
  }>;
  explanation: string;
}

// ============================================================================
// Service
// ============================================================================

export class PolicyExplainabilityService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Explain retention policy resolution for a given schema/table.
   * Shows which policy won, why, and what alternatives were considered.
   */
  async explainRetention(
    tenantId: string,
    targetSchema: string,
    targetTable: string | null = null,
    entityId: string | null = null,
  ): Promise<RetentionExplanation> {
    // 1. Resolve winning policy via SQL function
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
        ${tenantId}::uuid,
        ${targetSchema},
        ${targetTable},
        ${entityId}::uuid
      )
    `.execute(this.db);

    // 2. Fetch all candidate policies for the same target
    const candidates = await sql<{
      id: string;
      policy_scope: string;
      retention_days: number;
      priority: number;
      is_active: boolean;
      legal_hold: boolean;
    }>`
      SELECT id, policy_scope, retention_days, priority, is_active, legal_hold
      FROM core.data_retention_policy
      WHERE tenant_id = ${tenantId}::uuid
        AND target_schema = ${targetSchema}
        AND (target_table = ${targetTable} OR target_table IS NULL)
      ORDER BY
        CASE policy_scope WHEN 'entity' THEN 1 WHEN 'table' THEN 2 WHEN 'schema' THEN 3 END,
        priority DESC
    `.execute(this.db);

    // 3. Fetch all active holds covering this scope
    const holds = await sql<{
      hold_id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      issued_by: string;
      issued_at: Date;
      compliance_framework: string | null;
      held_manifest_count: string;
    }>`
      SELECT * FROM core.active_holds_for_scope(
        ${tenantId}::uuid, ${targetSchema}, ${targetTable}, ${entityId}::uuid
      )
    `.execute(this.db);

    const winner = resolved.rows[0] ?? null;
    const activeHolds: ActiveHoldInfo[] = holds.rows.map((h) => ({
      holdId: h.hold_id,
      holdReference: h.hold_reference,
      holdSource: h.hold_source,
      reason: h.reason,
      scopeType: h.scope_type,
      issuedBy: h.issued_by,
      issuedAt: h.issued_at,
      complianceFramework: h.compliance_framework,
      heldManifestCount: Number(h.held_manifest_count),
    }));

    // 4. Build explanation
    const parts: string[] = [];
    if (!winner) {
      parts.push(
        `No active retention policy found for ${targetSchema}.${targetTable ?? "*"}.`,
      );
      parts.push("The system will use the default retention (90 days).");
    } else {
      parts.push(
        `Resolved retention policy: ${winner.resolved_scope} scope, ${winner.retention_days} days, action=${winner.action_on_expiry}.`,
      );
      if (winner.legal_hold) {
        parts.push(
          `LEGAL HOLD ACTIVE (${activeHolds.length} hold(s)) — all retention and tiering processing is frozen.`,
        );
        for (const h of activeHolds) {
          parts.push(
            `Hold "${h.holdReference}" (${h.holdSource}): ${h.reason} [issued by ${h.issuedBy}].`,
          );
        }
      }
      if (winner.compliance_framework) {
        parts.push(
          `Compliance framework: ${winner.compliance_framework}.`,
        );
      }
    }

    if (candidates.rows.length > 1) {
      const skipped = candidates.rows.filter(
        (c) => c.id !== winner?.policy_id,
      );
      parts.push(
        `${skipped.length} other candidate(s) were considered but outranked by scope specificity or priority.`,
      );
    }

    return {
      tenantId,
      targetSchema,
      targetTable,
      entityId,
      resolvedPolicy: winner
        ? {
            policyId: winner.policy_id,
            retentionDays: winner.retention_days,
            actionOnExpiry: winner.action_on_expiry,
            complianceFramework: winner.compliance_framework,
            legalHold: winner.legal_hold,
            resolvedScope: winner.resolved_scope,
            priority: winner.priority,
          }
        : null,
      candidatePolicies: candidates.rows.map((c) => ({
        policyId: c.id,
        scope: c.policy_scope,
        retentionDays: c.retention_days,
        priority: c.priority,
        isActive: c.is_active,
        legalHold: c.legal_hold,
        reason:
          c.id === winner?.policy_id
            ? "WINNER — highest scope specificity + priority"
            : !c.is_active
              ? "SKIPPED — inactive"
              : "OUTRANKED — lower scope specificity or priority",
      })),
      activeHolds,
      explanation: parts.join(" "),
    };
  }

  /**
   * Explain tiering policy resolution and its consistency with retention policy.
   */
  async explainTiering(
    tenantId: string,
    sourceSchema: string = "evt",
    sourceTable: string = "event",
    partitionDomain: string | null = null,
  ): Promise<TieringExplanation> {
    // 1. Resolve tiering policy
    const tiering = await sql<{
      policy_id: string;
      hot_months: number;
      warm_months: number;
      warm_strategy: string;
      cold_strategy: string;
      cold_storage_uri: string | null;
      priority: number;
      legal_hold: boolean;
    }>`
      SELECT * FROM evt.resolve_tiering_policy(
        ${tenantId}::uuid,
        ${sourceSchema},
        ${sourceTable},
        ${partitionDomain}
      )
    `.execute(this.db);

    // 2. Resolve corresponding retention policy
    const retention = await sql<{
      retention_days: number;
    }>`
      SELECT retention_days FROM core.resolve_retention_policy(
        ${tenantId}::uuid,
        ${sourceSchema},
        ${sourceTable}
      )
    `.execute(this.db);

    // 3. Fetch all active holds covering this scope
    const holds = await sql<{
      hold_id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      issued_by: string;
      issued_at: Date;
      compliance_framework: string | null;
      held_manifest_count: string;
    }>`
      SELECT * FROM core.active_holds_for_scope(
        ${tenantId}::uuid, ${sourceSchema}, ${sourceTable}
      )
    `.execute(this.db);

    const tier = tiering.rows[0] ?? null;
    const ret = retention.rows[0] ?? null;
    const activeHolds: ActiveHoldInfo[] = holds.rows.map((h) => ({
      holdId: h.hold_id,
      holdReference: h.hold_reference,
      holdSource: h.hold_source,
      reason: h.reason,
      scopeType: h.scope_type,
      issuedBy: h.issued_by,
      issuedAt: h.issued_at,
      complianceFramework: h.compliance_framework,
      heldManifestCount: Number(h.held_manifest_count),
    }));

    // 4. Check consistency: retention_days >= warm_months * 30
    const warmDays = tier ? tier.warm_months * 30 : null;
    const retDays = ret?.retention_days ?? null;
    const isConsistent =
      retDays === null || warmDays === null || retDays >= warmDays;

    const parts: string[] = [];
    if (!tier) {
      parts.push("No active tiering policy found. Data stays in HOT tier.");
    } else {
      parts.push(
        `Tiering: HOT (0-${tier.hot_months}mo) → WARM/${tier.warm_strategy} (${tier.hot_months}-${tier.warm_months}mo) → COLD/${tier.cold_strategy} (${tier.warm_months}mo+).`,
      );
      if (tier.legal_hold) {
        parts.push(
          `LEGAL HOLD ACTIVE (${activeHolds.length} hold(s)) — all tier transitions FROZEN.`,
        );
        for (const h of activeHolds) {
          parts.push(
            `Hold "${h.holdReference}" (${h.holdSource}): ${h.reason} [issued by ${h.issuedBy}].`,
          );
        }
      }
    }
    if (!isConsistent) {
      parts.push(
        `WARNING: retention_days (${retDays}) < warm_months*30 (${warmDays}). Data could be archived before retention expires.`,
      );
    }

    return {
      tenantId,
      sourceSchema,
      sourceTable,
      partitionDomain,
      resolvedPolicy: tier
        ? {
            policyId: tier.policy_id,
            hotMonths: tier.hot_months,
            warmMonths: tier.warm_months,
            warmStrategy: tier.warm_strategy,
            coldStrategy: tier.cold_strategy,
            priority: tier.priority,
            legalHold: tier.legal_hold,
          }
        : null,
      retentionConstraint: {
        retentionDays: retDays,
        warmMonthsDays: warmDays,
        isConsistent,
        warning: isConsistent
          ? null
          : `retention_days (${retDays}) must be >= warm_months * 30 (${warmDays})`,
      },
      activeHolds,
      explanation: parts.join(" "),
    };
  }

  /**
   * Explain a quota enforcement decision for a given tenant and quota key.
   * Includes recent usage snapshots for context.
   */
  async explainQuota(
    tenantId: string,
    quotaKey: string,
    increment: number = 1,
  ): Promise<QuotaExplanation> {
    // 1. Check quota via SQL function
    const check = await sql<{
      allowed: boolean;
      current_value: number;
      limit_value: number;
      remaining: number;
      enforcement: string;
      overage_action: string;
    }>`
      SELECT * FROM core.check_quota(${tenantId}::uuid, ${quotaKey}, ${increment}::bigint)
    `.execute(this.db);

    // 2. Fetch recent snapshots
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
      WHERE q.tenant_id = ${tenantId}::uuid AND q.quota_key = ${quotaKey}
      ORDER BY s.period_end DESC
      LIMIT 10
    `.execute(this.db);

    const decision = check.rows[0] ?? null;
    const utilizationPct = decision
      ? decision.limit_value > 0
        ? Math.round(
            (decision.current_value / decision.limit_value) * 100 * 100,
          ) / 100
        : 0
      : 0;
    const status =
      !decision
        ? "NOT_FOUND"
        : utilizationPct >= 100
          ? "EXCEEDED"
          : utilizationPct >= 80
            ? "WARNING"
            : "OK";

    const parts: string[] = [];
    if (!decision) {
      parts.push(`No active quota found for key "${quotaKey}".`);
    } else {
      parts.push(
        `Quota "${quotaKey}": ${decision.current_value}/${decision.limit_value} (${utilizationPct}%).`,
      );
      parts.push(
        `Enforcement: ${decision.enforcement}. Overage action: ${decision.overage_action}.`,
      );
      if (decision.allowed) {
        parts.push(
          `Decision: ALLOWED (${decision.remaining} remaining after increment of ${increment}).`,
        );
      } else {
        parts.push(
          `Decision: DENIED — quota exceeded. Action: ${decision.overage_action}.`,
        );
      }
      if (
        decision.enforcement === "SOFT" &&
        decision.current_value > decision.limit_value
      ) {
        parts.push("SOFT enforcement allows up to 10% overage.");
      }
    }

    return {
      tenantId,
      quotaKey,
      decision: decision
        ? {
            allowed: decision.allowed,
            currentValue: decision.current_value,
            limitValue: decision.limit_value,
            remaining: decision.remaining,
            enforcement: decision.enforcement,
            overageAction: decision.overage_action,
          }
        : null,
      utilizationPct,
      status,
      recentSnapshots: snapshots.rows.map((s) => ({
        measuredValue: s.measured_value,
        limitAtTime: s.limit_at_time,
        utilizationPct: s.utilization_pct,
        periodEnd: s.period_end,
        measuredBy: s.measured_by,
      })),
      explanation: parts.join(" "),
    };
  }

  /**
   * Explain privacy controls on a specific field.
   * Shows PII classification, masking strategy, GDPR lawful basis,
   * and all applied security policies.
   */
  async explainFieldPrivacy(
    tenantId: string,
    entityName: string,
    fieldPath: string,
  ): Promise<FieldPrivacyExplanation> {
    // 1. Get PII field from inventory view
    const piiField = await sql<{
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
      WHERE tenant_id = ${tenantId}::uuid
        AND entity_name = ${entityName}
        AND field_path = ${fieldPath}
      LIMIT 1
    `.execute(this.db);

    // 2. Get all applied security policies for this field
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
      WHERE fsp.tenant_id = ${tenantId}::uuid
        AND e.name = ${entityName}
        AND fsp.field_path = ${fieldPath}
      ORDER BY fsp.priority DESC
    `.execute(this.db);

    const pii = piiField.rows[0] ?? null;

    const parts: string[] = [];
    if (!pii?.pii_classification) {
      parts.push(
        `Field "${entityName}.${fieldPath}" has no PII classification.`,
      );
    } else {
      parts.push(
        `Field "${entityName}.${fieldPath}" is classified as ${pii.pii_classification}.`,
      );
      parts.push(
        `Masking: ${pii.mask_strategy ?? "none"}. Anonymization: ${pii.anonymization_strategy ?? "none"}.`,
      );
      if (pii.lawful_basis) {
        parts.push(`GDPR lawful basis: ${pii.lawful_basis}.`);
      }
      if (pii.consent_required) {
        parts.push("Consent REQUIRED before processing.");
      }
      if (pii.cross_border_restricted) {
        parts.push("Cross-border transfer RESTRICTED.");
      }
      if (pii.retention_override_days) {
        parts.push(
          `Field-level retention override: ${pii.retention_override_days} days.`,
        );
      }
    }
    parts.push(
      `${policies.rows.length} security policy/ies apply to this field.`,
    );

    return {
      tenantId,
      entityName,
      fieldPath,
      piiClassification: pii?.pii_classification ?? null,
      maskStrategy: pii?.mask_strategy ?? null,
      privacyMetadata: pii
        ? {
            lawfulBasis: pii.lawful_basis,
            consentRequired: pii.consent_required ?? false,
            retentionOverrideDays: pii.retention_override_days,
            anonymizationStrategy: pii.anonymization_strategy,
            crossBorderRestricted: pii.cross_border_restricted ?? false,
            dataSubjectType: pii.data_subject_type,
          }
        : null,
      appliedPolicies: policies.rows.map((p) => ({
        policyId: p.id,
        policyType: p.policy_type,
        scope: p.scope,
        priority: p.priority,
        roleList: p.role_list ?? [],
        isActive: p.is_active,
      })),
      explanation: parts.join(" "),
    };
  }
}
