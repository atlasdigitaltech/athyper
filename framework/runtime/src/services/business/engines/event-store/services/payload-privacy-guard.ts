/**
 * Payload Privacy Guard
 *
 * Pre-publish interceptor that inspects event payloads against
 * meta.field_security_policy PII classification rules.
 *
 * Enforcement modes:
 *   - REJECT:  Refuse to publish if raw PII detected in payload
 *   - REDACT:  Auto-redact PII fields before publishing
 *   - WARN:    Log a violation but allow publish (for migration)
 *   - OFF:     No enforcement (default until policies seeded)
 *
 * Integration:
 *   Plugs into DefaultEventPublisher via the guard parameter.
 *   The publisher calls guard.inspect() before hash + persist.
 *   If inspect() returns violations and mode=REJECT, publish throws.
 *
 * Design:
 *   - Does NOT query the DB on every publish (too slow)
 *   - Loads PII field rules once at startup, refreshes periodically
 *   - Uses in-memory Map<entityCode, Set<fieldPath>> for O(1) lookups
 *   - Matches against flat payload keys (dot-path not supported yet)
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export type PrivacyGuardMode = "REJECT" | "REDACT" | "WARN" | "OFF";

export interface PrivacyViolation {
  fieldPath: string;
  piiClassification: string;
  maskStrategy: string | null;
  entityCode: string | null;
  message: string;
}

export interface PrivacyInspectionResult {
  allowed: boolean;
  violations: PrivacyViolation[];
  redactedPayload?: unknown;
}

interface PiiFieldRule {
  fieldPath: string;
  piiClassification: string;
  maskStrategy: string | null;
  entityName: string;
}

// ============================================================================
// Guard
// ============================================================================

export class PayloadPrivacyGuard {
  private piiRules: Map<string, PiiFieldRule[]> = new Map();
  private globalPiiFields: Set<string> = new Set();
  private lastRefresh: Date | null = null;
  private refreshIntervalMs: number;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly mode: PrivacyGuardMode = "WARN",
    refreshIntervalMs: number = 5 * 60 * 1000, // 5 minutes
  ) {
    this.refreshIntervalMs = refreshIntervalMs;
  }

  /**
   * Load PII field rules from meta.pii_field_inventory.
   * Called at startup and periodically refreshed.
   */
  async loadRules(tenantId: string): Promise<void> {
    const rows = await sql<{
      entity_name: string;
      field_path: string;
      pii_classification: string;
      mask_strategy: string | null;
    }>`
      SELECT entity_name, field_path, pii_classification, mask_strategy
      FROM meta.pii_field_inventory
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
    `.execute(this.db);

    this.piiRules.clear();
    this.globalPiiFields.clear();

    for (const row of rows.rows) {
      const key = row.entity_name.toLowerCase();
      if (!this.piiRules.has(key)) {
        this.piiRules.set(key, []);
      }
      this.piiRules.get(key)!.push({
        fieldPath: row.field_path,
        piiClassification: row.pii_classification,
        maskStrategy: row.mask_strategy,
        entityName: row.entity_name,
      });
      this.globalPiiFields.add(row.field_path);
    }

    this.lastRefresh = new Date();
  }

  /**
   * Inspect an event payload for PII violations.
   *
   * @param payload - The event payload to inspect
   * @param entityCode - Optional entity code for entity-specific rules
   * @param tenantId - Tenant ID for rule refresh
   */
  async inspect(
    payload: unknown,
    entityCode: string | null,
    tenantId: string,
  ): Promise<PrivacyInspectionResult> {
    if (this.mode === "OFF") {
      return { allowed: true, violations: [] };
    }

    // Lazy refresh
    if (
      !this.lastRefresh ||
      Date.now() - this.lastRefresh.getTime() > this.refreshIntervalMs
    ) {
      await this.loadRules(tenantId);
    }

    const violations: PrivacyViolation[] = [];

    if (payload && typeof payload === "object") {
      const flatKeys = this.extractKeys(payload as Record<string, unknown>);

      for (const key of flatKeys) {
        // Check entity-specific rules first
        if (entityCode) {
          const entityRules =
            this.piiRules.get(entityCode.toLowerCase()) ?? [];
          const match = entityRules.find((r) => r.fieldPath === key);
          if (match) {
            violations.push({
              fieldPath: key,
              piiClassification: match.piiClassification,
              maskStrategy: match.maskStrategy,
              entityCode,
              message: `PII field "${key}" (${match.piiClassification}) found in event payload for entity "${entityCode}". Raw PII should not be stored in event payloads.`,
            });
            continue;
          }
        }

        // Check global PII fields (any entity)
        if (this.globalPiiFields.has(key)) {
          violations.push({
            fieldPath: key,
            piiClassification: "UNKNOWN",
            maskStrategy: null,
            entityCode,
            message: `Known PII field "${key}" found in event payload. Use reference IDs or encrypted values instead.`,
          });
        }
      }
    }

    if (violations.length === 0) {
      return { allowed: true, violations: [] };
    }

    // Apply mode
    switch (this.mode) {
      case "REJECT":
        return { allowed: false, violations };

      case "REDACT": {
        const redacted = this.redactPayload(
          payload as Record<string, unknown>,
          violations,
        );
        return { allowed: true, violations, redactedPayload: redacted };
      }

      case "WARN":
      default:
        return { allowed: true, violations };
    }
  }

  /**
   * Extract all top-level keys from a payload object.
   */
  private extractKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  /**
   * Redact PII fields in a payload by replacing values with "[REDACTED]".
   */
  private redactPayload(
    payload: Record<string, unknown>,
    violations: PrivacyViolation[],
  ): Record<string, unknown> {
    const redacted = { ...payload };
    for (const v of violations) {
      if (v.fieldPath in redacted) {
        redacted[v.fieldPath] = "[REDACTED]";
      }
    }
    return redacted;
  }
}
