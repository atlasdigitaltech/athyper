/**
 * Audit Storage Tiering Service
 *
 * Policy-driven lifecycle for audit data:
 *   - Hot:  0 to warmAfterDays (default 90)  — in PostgreSQL
 *   - Warm: warmAfterDays to coldAfterDays (90-365) — in PostgreSQL (read-only)
 *   - Cold: beyond coldAfterDays (365+) — archived to object storage
 *
 * The service does NOT move data itself; it provides tier assessments
 * that the archive worker and timeline service use to make decisions.
 */

import type { AuditArchiveMarkerRepo } from "../persistence/AuditArchiveMarkerRepo.js";

// ============================================================================
// Types
// ============================================================================

export type StorageTier = "hot" | "warm" | "cold";

export interface TierConfig {
  warmAfterDays: number;
  coldAfterDays: number;
}

export interface PartitionTierAssignment {
  partitionName: string;
  partitionMonth: Date;
  tier: StorageTier;
  isArchived: boolean;
}

export interface DateRangeTiers {
  hotRange: { start: Date; end: Date } | null;
  warmRange: { start: Date; end: Date } | null;
  coldMonths: Date[];
}

// ============================================================================
// Service
// ============================================================================

export class AuditStorageTieringService {
  constructor(
    private readonly archiveMarkerRepo: AuditArchiveMarkerRepo | null,
    private readonly config: TierConfig,
  ) {}

  /**
   * Determine which tier a partition month belongs to.
   */
  getTargetTier(partitionMonth: Date): StorageTier {
    const now = new Date();
    const ageMs = now.getTime() - partitionMonth.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays >= this.config.coldAfterDays) {
      return "cold";
    }
    if (ageDays >= this.config.warmAfterDays) {
      return "warm";
    }
    return "hot";
  }

  /**
   * Assess all partitions and assign tiers.
   * Uses the archive marker repo to check archived status.
   */
  async assessPartitions(
    partitionMonths: Array<{ name: string; month: Date }>,
  ): Promise<PartitionTierAssignment[]> {
    const assignments: PartitionTierAssignment[] = [];

    for (const partition of partitionMonths) {
      const tier = this.getTargetTier(partition.month);

      let isArchived = false;
      if (this.archiveMarkerRepo) {
        isArchived = await this.archiveMarkerRepo.isMonthArchived(partition.month);
      }

      assignments.push({
        partitionName: partition.name,
        partitionMonth: partition.month,
        tier,
        isArchived,
      });
    }

    return assignments;
  }

  /**
   * For a query date range, determine which months fall in which tier.
   * Used by the timeline service to annotate responses with cold-tier info.
   */
  async getDateRangeTiers(
    startDate: Date,
    endDate: Date,
  ): Promise<DateRangeTiers> {
    const now = new Date();
    const result: DateRangeTiers = {
      hotRange: null,
      warmRange: null,
      coldMonths: [],
    };

    const warmCutoff = new Date(now);
    warmCutoff.setDate(warmCutoff.getDate() - this.config.warmAfterDays);

    const coldCutoff = new Date(now);
    coldCutoff.setDate(coldCutoff.getDate() - this.config.coldAfterDays);

    // Hot range: max(startDate, warmCutoff) to endDate (if overlap)
    const hotStart = startDate > warmCutoff ? startDate : warmCutoff;
    if (hotStart < endDate) {
      result.hotRange = { start: hotStart, end: endDate };
    }

    // Warm range: max(startDate, coldCutoff) to min(endDate, warmCutoff)
    const warmStart = startDate > coldCutoff ? startDate : coldCutoff;
    const warmEnd = endDate < warmCutoff ? endDate : warmCutoff;
    if (warmStart < warmEnd) {
      result.warmRange = { start: warmStart, end: warmEnd };
    }

    // Cold months: enumerate months before coldCutoff that are within the range
    if (startDate < coldCutoff) {
      const coldEnd = endDate < coldCutoff ? endDate : coldCutoff;
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const cutoffMonth = new Date(coldEnd.getFullYear(), coldEnd.getMonth(), 1);

      while (current <= cutoffMonth) {
        result.coldMonths.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
    }

    return result;
  }
}
