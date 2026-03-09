// framework/runtime/src/services/business/engines/event-store/services/tiering-service.ts

import type { EventTier } from "../domain/types.js";

/**
 * Tiering configuration for event storage lifecycle.
 * Can be loaded from evt.data_tiering_policy via resolve_tiering_policy().
 */
export interface TieringConfig {
  /** Days before HOT → WARM transition */
  hotRetentionDays: number;
  /** Days before WARM → COLD transition */
  warmRetentionDays: number;
  /** Years before COLD → PURGE */
  coldRetentionYears: number;
}

/**
 * Resolved tiering policy from evt.data_tiering_policy + core.data_retention_policy.
 * Returned by evt.resolve_tiering_policy() SQL function.
 */
export interface ResolvedTieringPolicy {
  policyId: string;
  hotMonths: number;
  warmMonths: number;
  warmStrategy: string;
  coldStrategy: string;
  coldStorageUri: string | null;
  priority: number;
  /** Legal hold from core.data_retention_policy — freezes all transitions */
  legalHold: boolean;
}

/**
 * Event Store Tiering Service — manages HOT → WARM → COLD → PURGE lifecycle.
 * Reuses the pattern from audit.storageTiering.
 *
 * Integration with governance tables:
 *   - Reads policy from evt.data_tiering_policy via resolve_tiering_policy()
 *   - Checks legal hold from core.data_retention_policy (freezes ALL transitions)
 *   - Writes archive records to evt.archive_manifest
 *   - Respects archive_manifest lifecycle: ARCHIVED → VERIFIED → DETACHED
 *
 * Wiring:
 *   - Registered via TOKENS.eventTieringService
 *   - Scheduled via jobRegistry.addSchedule() in event-store module contribute()
 *   - Schedule: "0 4 * * 0" (weekly at 4 AM UTC on Sundays)
 */
export interface TieringService {
  /**
   * Determine the tier for an event based on its age.
   */
  determineTier(eventCreatedAt: Date, config: TieringConfig): EventTier;

  /**
   * Execute tier migration for events older than the cutoff.
   * Returns count of events migrated.
   * MUST check legal hold before executing — returns 0 if frozen.
   */
  migrateToWarm(tenantId: string, config: TieringConfig): Promise<number>;
  migrateToCold(tenantId: string, config: TieringConfig): Promise<number>;
  purgeExpired(tenantId: string, config: TieringConfig): Promise<number>;
}

/**
 * Converts a ResolvedTieringPolicy (from SQL) to a TieringConfig (for service).
 */
export function policyToConfig(
  policy: ResolvedTieringPolicy,
): TieringConfig & { legalHold: boolean } {
  return {
    hotRetentionDays: policy.hotMonths * 30,
    warmRetentionDays: policy.warmMonths * 30,
    // Cold retention is governed by core.data_retention_policy, not tiering
    // Default to 7 years if no retention policy exists
    coldRetentionYears: 7,
    legalHold: policy.legalHold,
  };
}

/**
 * Default implementation of TieringService.
 */
export class DefaultTieringService implements TieringService {
  determineTier(eventCreatedAt: Date, config: TieringConfig): EventTier {
    const now = new Date();
    const ageMs = now.getTime() - eventCreatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < config.hotRetentionDays) return "HOT";
    if (ageDays < config.warmRetentionDays) return "WARM";
    if (ageDays < config.coldRetentionYears * 365) return "COLD";
    return "PURGE";
  }

  async migrateToWarm(
    _tenantId: string,
    _config: TieringConfig,
  ): Promise<number> {
    // Implementation: Move partitions older than hotRetentionDays to warm storage
    // This would detach old partitions and attach to a warm tablespace
    // STEP 1: Call evt.resolve_tiering_policy() to get active policy
    // STEP 2: Check legalHold — if true, return 0 (frozen)
    // STEP 3: Find partitions in HOT tier older than hot_months
    // STEP 4: Execute warm_strategy (COMPRESS, REDUCE_INDEXES, etc.)
    return 0;
  }

  async migrateToCold(
    _tenantId: string,
    _config: TieringConfig,
  ): Promise<number> {
    // Implementation: Archive warm partitions to cold storage
    // STEP 1: Call evt.resolve_tiering_policy() to get active policy
    // STEP 2: Check legalHold — if true, return 0 (frozen)
    // STEP 3: Find partitions in WARM tier older than warm_months
    // STEP 4: Export partition to NDJSON/Parquet → object storage
    // STEP 5: Compute SHA-256 hash of exported file
    // STEP 6: INSERT into evt.archive_manifest (status: ARCHIVED)
    // STEP 7: Verify archive integrity → UPDATE verified_at
    // STEP 8: Optionally detach partition → UPDATE detached_at
    return 0;
  }

  async purgeExpired(
    _tenantId: string,
    _config: TieringConfig,
  ): Promise<number> {
    // Implementation: Drop partitions older than coldRetentionYears
    // CRITICAL: Requires explicit governance approval before purge
    // STEP 1: Call core.resolve_retention_policy() for retention window
    // STEP 2: Check legal_hold — if true, return 0 (ABSOLUTELY frozen)
    // STEP 3: Verify archive_manifest.verified_at is set (cannot purge unverified)
    // STEP 4: Drop partition via DDL (not DML — bypasses immutability trigger)
    // STEP 5: UPDATE archive_manifest.detached_at
    return 0;
  }
}
