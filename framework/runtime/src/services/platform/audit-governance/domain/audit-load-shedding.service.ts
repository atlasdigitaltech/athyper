/**
 * Audit Load Shedding Service
 *
 * Policy-driven gate that controls which audit events get written.
 * Inserted before the feature-flag check in ResilientAuditWriter.write().
 *
 * Dispositions:
 *   - "required": always write (never shed)
 *   - "sampled": write N% (probabilistic)
 *   - "disabled": drop silently with metric
 *
 * Safety: "never-drop" rules override all policies. Events matching
 * the never-drop list are always accepted regardless of policy.
 *
 * Never-drop list:
 *   - Categories: admin, recovery
 *   - Event types: workflow.approved, workflow.rejected
 *   - Any event with severity === "critical"
 */

import { sql } from "kysely";

import { AUDIT_EVENT_TAXONOMY } from "./event-taxonomy.js";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export type LoadSheddingDisposition = "required" | "sampled" | "disabled";

export interface AuditLoadSheddingPolicy {
  disposition: LoadSheddingDisposition;
  sampleRate: number;
}

export interface LoadSheddingDecision {
  accepted: boolean;
  reason: "required" | "never_drop" | "sampled_accept" | "sampled_reject" | "disabled" | "emergency_drop";
}

interface CachedPolicies {
  policies: Map<string, AuditLoadSheddingPolicy>;
  expiresAt: number;
}

// ============================================================================
// Never-drop rules (hardcoded safety — cannot be overridden)
// ============================================================================

const NEVER_DROP_CATEGORIES: ReadonlySet<string> = new Set(["admin", "recovery"]);

const NEVER_DROP_EVENT_TYPES: ReadonlySet<string> = new Set([
  "workflow.approved",
  "workflow.rejected",
]);

// ============================================================================
// Service
// ============================================================================

export class AuditLoadSheddingService {
  private readonly policyCache = new Map<string, CachedPolicies>();
  private readonly cacheTtlMs: number;
  private emergencyMode = false;

  constructor(
    private readonly db: Kysely<DB> | null,
    options?: { cacheTtlMs?: number },
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30_000;
  }

  /**
   * Evaluate whether an audit event should be accepted or shed.
   * Never-drop events always pass regardless of policy or emergency mode.
   */
  async evaluate(
    tenantId: string,
    eventType: string,
    severity: string,
  ): Promise<LoadSheddingDecision> {
    // Safety first: never-drop events always pass
    if (this.isNeverDrop(eventType, severity)) {
      return { accepted: true, reason: "never_drop" };
    }

    // Emergency mode drops everything non-required
    if (this.emergencyMode) {
      return { accepted: false, reason: "emergency_drop" };
    }

    // Resolve policy for this event's category
    const category = this.getEventCategory(eventType);
    const policy = await this.resolvePolicy(tenantId, category);

    switch (policy.disposition) {
      case "required":
        return { accepted: true, reason: "required" };

      case "sampled": {
        const accepted = this.shouldSample(policy.sampleRate);
        return {
          accepted,
          reason: accepted ? "sampled_accept" : "sampled_reject",
        };
      }

      case "disabled":
        return { accepted: false, reason: "disabled" };

      default:
        // Unknown disposition — fail-safe to accept
        return { accepted: true, reason: "required" };
    }
  }

  setEmergencyMode(enabled: boolean): void {
    this.emergencyMode = enabled;
  }

  isEmergencyMode(): boolean {
    return this.emergencyMode;
  }

  invalidateCache(tenantId?: string): void {
    if (tenantId) {
      this.policyCache.delete(tenantId);
    } else {
      this.policyCache.clear();
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private isNeverDrop(eventType: string, severity: string): boolean {
    // Critical events are always kept
    if (severity === "critical") {
      return true;
    }

    // Check explicit event types
    if (NEVER_DROP_EVENT_TYPES.has(eventType)) {
      return true;
    }

    // Check category
    const category = this.getEventCategory(eventType);
    if (category && NEVER_DROP_CATEGORIES.has(category)) {
      return true;
    }

    return false;
  }

  private getEventCategory(eventType: string): string | undefined {
    const entry = AUDIT_EVENT_TAXONOMY[eventType as keyof typeof AUDIT_EVENT_TAXONOMY];
    return entry?.category;
  }

  private async resolvePolicy(
    tenantId: string,
    category: string | undefined,
  ): Promise<AuditLoadSheddingPolicy> {
    // Default: required (fail-safe — unknown events are always accepted)
    const defaultPolicy: AuditLoadSheddingPolicy = { disposition: "required", sampleRate: 1.0 };

    if (!category) {
      return defaultPolicy;
    }

    const policies = await this.loadPolicies(tenantId);

    // Tenant-specific policy takes precedence
    const tenantPolicy = policies.get(category);
    if (tenantPolicy) {
      return tenantPolicy;
    }

    // Wildcard policy for the tenant
    const wildcardPolicy = policies.get("*");
    if (wildcardPolicy) {
      return wildcardPolicy;
    }

    // Fall back to global policies (tenant_id IS NULL)
    const globalPolicies = await this.loadPolicies("__global__");
    const globalPolicy = globalPolicies.get(category);
    if (globalPolicy) {
      return globalPolicy;
    }

    const globalWildcard = globalPolicies.get("*");
    if (globalWildcard) {
      return globalWildcard;
    }

    return defaultPolicy;
  }

  private async loadPolicies(tenantId: string): Promise<Map<string, AuditLoadSheddingPolicy>> {
    // Check cache
    const cached = this.policyCache.get(tenantId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.policies;
    }

    const policies = new Map<string, AuditLoadSheddingPolicy>();

    if (!this.db) {
      return policies;
    }

    try {
      const isGlobal = tenantId === "__global__";

      const rows = await sql<{
        event_category: string;
        disposition: string;
        sample_rate: number;
      }>`
        SELECT event_category, disposition, sample_rate
        FROM meta.audit_policy
        WHERE ${isGlobal ? sql`tenant_id IS NULL` : sql`tenant_id = ${tenantId}::uuid`}
          AND enabled = true
      `.execute(this.db);

      for (const row of rows.rows ?? []) {
        policies.set(row.event_category, {
          disposition: row.disposition as LoadSheddingDisposition,
          sampleRate: Number(row.sample_rate),
        });
      }
    } catch {
      // DB not available — return empty (defaults to "required")
    }

    this.policyCache.set(tenantId, {
      policies,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return policies;
  }

  private shouldSample(rate: number): boolean {
    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;
    return Math.random() < rate;
  }
}

/**
 * Factory for creating the load shedding service.
 */
export function createAuditLoadSheddingService(
  db: Kysely<DB> | null,
  options?: { cacheTtlMs?: number },
): AuditLoadSheddingService {
  return new AuditLoadSheddingService(db, options);
}
