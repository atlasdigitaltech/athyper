/**
 * Numbering Engine Service
 *
 * Generates unique document numbers atomically using INSERT...ON CONFLICT DO UPDATE.
 * Numbers are formatted from patterns like "INV-{YYYY}-{SEQ:6}".
 * Sequences can reset by period (yearly, monthly, daily, or never).
 */

import { sql } from "kysely";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  HealthCheckResult,
  NumberingEngine,
  NumberingResetPolicy,
  NumberingRule,
} from "@athyper/core/meta";

/**
 * Compute period key from reset policy and reference date.
 * All date components use UTC to avoid timezone-dependent reset boundaries.
 */
function computePeriodKey(
  resetPolicy: NumberingResetPolicy,
  referenceDate: Date
): string {
  const yyyy = String(referenceDate.getUTCFullYear());
  const mm = String(referenceDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(referenceDate.getUTCDate()).padStart(2, "0");

  switch (resetPolicy) {
    case "none":
      return "__global__";
    case "yearly":
      return yyyy;
    case "monthly":
      return `${yyyy}-${mm}`;
    case "daily":
      return `${yyyy}-${mm}-${dd}`;
    default:
      return "__global__";
  }
}

/**
 * Format a number using the pattern and date tokens
 *
 * Supported tokens:
 * - {YYYY} → 4-digit year
 * - {YY} → 2-digit year
 * - {MM} → 2-digit month
 * - {DD} → 2-digit day
 * - {SEQ:N} → sequence number zero-padded to N digits
 */
function formatNumber(
  pattern: string,
  sequenceValue: number,
  referenceDate: Date
): string {
  // All date tokens use UTC for consistency with period key computation
  const yyyy = String(referenceDate.getUTCFullYear());
  const yy = yyyy.slice(2);
  const mm = String(referenceDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(referenceDate.getUTCDate()).padStart(2, "0");

  let result = pattern;
  result = result.replace(/\{YYYY\}/g, yyyy);
  result = result.replace(/\{YY\}/g, yy);
  result = result.replace(/\{MM\}/g, mm);
  result = result.replace(/\{DD\}/g, dd);

  // Replace {SEQ:N} where N is the zero-pad width
  result = result.replace(/\{SEQ:(\d+)\}/g, (_match, width) => {
    return String(sequenceValue).padStart(Number(width), "0");
  });

  // Replace bare {SEQ} without padding
  result = result.replace(/\{SEQ\}/g, String(sequenceValue));

  return result;
}

/**
 * Numbering Engine Service Implementation
 */
export class NumberingEngineService implements NumberingEngine {
  constructor(private readonly db: LifecycleDB_Type) {}

  async generateNumber(
    entityName: string,
    tenantId: string,
    referenceDate?: Date
  ): Promise<string> {
    const date = referenceDate ?? new Date();

    // Load the numbering rule
    const rule = await this.getRule(entityName, tenantId);
    if (!rule) {
      throw new Error(
        `No numbering rule configured for entity "${entityName}" in tenant "${tenantId}"`
      );
    }
    if (!rule.is_active) {
      throw new Error(
        `Numbering rule "${rule.code}" is not active for entity "${entityName}"`
      );
    }

    // Compute period key from reset policy
    const periodKey = computePeriodKey(rule.reset_policy, date);

    // Atomic increment: INSERT...ON CONFLICT DO UPDATE
    const result = await sql<{ current_value: number }>`
      INSERT INTO meta.numbering_sequence (id, tenant_id, entity_name, period_key, current_value, updated_at)
      VALUES (gen_random_uuid(), ${tenantId}, ${entityName}, ${periodKey}, ${rule.seq_start}, now())
      ON CONFLICT (tenant_id, entity_name, period_key)
      DO UPDATE SET
        current_value = meta.numbering_sequence.current_value + ${rule.seq_increment},
        updated_at = now()
      RETURNING current_value
    `.execute(this.db);

    const currentValue = result.rows[0]?.current_value;
    if (currentValue === undefined) {
      throw new Error(
        `Failed to generate number for entity "${entityName}"`
      );
    }

    return formatNumber(rule.pattern, currentValue, date);
  }

  async previewNextNumber(
    entityName: string,
    tenantId: string,
    referenceDate?: Date
  ): Promise<string | undefined> {
    const date = referenceDate ?? new Date();

    const rule = await this.getRule(entityName, tenantId);
    if (!rule || !rule.is_active) return undefined;

    const periodKey = computePeriodKey(rule.reset_policy, date);

    const row = await this.db
      .selectFrom("meta.numbering_sequence")
      .select(["current_value"])
      .where("tenant_id", "=", tenantId)
      .where("entity_name", "=", entityName)
      .where("period_key", "=", periodKey)
      .executeTakeFirst();

    const nextValue = row
      ? row.current_value + rule.seq_increment
      : rule.seq_start;

    return formatNumber(rule.pattern, nextValue, date);
  }

  async getRule(
    entityName: string,
    tenantId: string
  ): Promise<NumberingRule | undefined> {
    const row = await this.db
      .selectFrom("meta.entity")
      .select(["naming_policy"])
      .where("tenant_id", "=", tenantId)
      .where("name", "=", entityName)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (!row?.naming_policy) return undefined;

    const raw = row.naming_policy as Record<string, unknown>;
    if (!raw.pattern || typeof raw.pattern !== "string") return undefined;

    return {
      code: (raw.code as string) ?? entityName,
      pattern: raw.pattern,
      reset_policy: this.validateResetPolicy(raw.reset_policy),
      seq_start: typeof raw.seq_start === "number" ? raw.seq_start : 1,
      seq_increment:
        typeof raw.seq_increment === "number" ? raw.seq_increment : 1,
      is_active: raw.is_active !== false,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      await sql`SELECT 1 FROM meta.numbering_sequence LIMIT 0`.execute(
        this.db
      );
      return { healthy: true, name: "numbering-engine" };
    } catch (error) {
      return {
        healthy: false,
        name: "numbering-engine",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private validateResetPolicy(value: unknown): NumberingResetPolicy {
    if (
      value === "none" ||
      value === "yearly" ||
      value === "monthly" ||
      value === "daily"
    ) {
      return value;
    }
    return "none";
  }
}
