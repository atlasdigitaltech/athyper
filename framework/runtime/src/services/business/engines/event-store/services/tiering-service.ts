// framework/runtime/src/services/business/engines/event-store/services/tiering-service.ts

import type { EventTier } from "../domain/types.js";

/**
 * Tiering configuration for event storage lifecycle.
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
 * Event Store Tiering Service — manages HOT → WARM → COLD → PURGE lifecycle.
 * Reuses the pattern from audit.storageTiering.
 */
export interface TieringService {
    /**
     * Determine the tier for an event based on its age.
     */
    determineTier(eventCreatedAt: Date, config: TieringConfig): EventTier;

    /**
     * Execute tier migration for events older than the cutoff.
     * Returns count of events migrated.
     */
    migrateToWarm(tenantId: string, config: TieringConfig): Promise<number>;
    migrateToCold(tenantId: string, config: TieringConfig): Promise<number>;
    purgeExpired(tenantId: string, config: TieringConfig): Promise<number>;
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

    async migrateToWarm(_tenantId: string, _config: TieringConfig): Promise<number> {
        // Implementation: Move partitions older than hotRetentionDays to warm storage
        // This would detach old partitions and attach to a warm tablespace
        return 0;
    }

    async migrateToCold(_tenantId: string, _config: TieringConfig): Promise<number> {
        // Implementation: Compress and archive warm partitions to cold storage
        return 0;
    }

    async purgeExpired(_tenantId: string, _config: TieringConfig): Promise<number> {
        // Implementation: Drop partitions older than coldRetentionYears
        // CRITICAL: Requires explicit governance approval before purge
        return 0;
    }
}
