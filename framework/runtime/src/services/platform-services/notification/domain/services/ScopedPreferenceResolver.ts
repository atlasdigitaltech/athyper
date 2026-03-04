/**
 * ScopedPreferenceResolver — Resolves effective preference via scope hierarchy.
 *
 * Resolution chain: user → org_unit → tenant → system default.
 * The most specific scope wins.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { ScopedNotificationPreferenceRepo } from "../../persistence/ScopedNotificationPreferenceRepo.js";
import type { ChannelCode, EffectivePreference, PreferenceFrequency } from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const OU_TABLE = "core.org_unit_member" as keyof DB & string;

export class ScopedPreferenceResolver {
    constructor(
        private readonly scopedRepo: ScopedNotificationPreferenceRepo,
        private readonly db: Kysely<DB>,
        private readonly logger: Logger,
    ) {}

    /**
     * Resolve effective preference for a principal on a given event+channel.
     *
     * Walk the chain: user → org_unit → tenant → system default.
     * Return the first match found.
     */
    async resolveEffective(
        tenantId: string,
        principalId: string,
        eventCode: string,
        channel: ChannelCode,
    ): Promise<EffectivePreference> {
        // 1. User-level
        const userPref = await this.scopedRepo.getByScope(
            tenantId, "user", principalId, eventCode, channel,
        );
        if (userPref) {
            return {
                isEnabled: userPref.isEnabled,
                frequency: userPref.frequency,
                quietHours: userPref.quietHours,
                resolvedFrom: "user",
            };
        }

        // 2. Org-unit level — look up the principal's OU
        const ouId = await this.lookupOrgUnit(tenantId, principalId);
        if (ouId) {
            const ouPref = await this.scopedRepo.getByScope(
                tenantId, "org_unit", ouId, eventCode, channel,
            );
            if (ouPref) {
                return {
                    isEnabled: ouPref.isEnabled,
                    frequency: ouPref.frequency,
                    quietHours: ouPref.quietHours,
                    resolvedFrom: "org_unit",
                };
            }
        }

        // 3. Tenant-level
        const tenantPref = await this.scopedRepo.getByScope(
            tenantId, "tenant", tenantId, eventCode, channel,
        );
        if (tenantPref) {
            return {
                isEnabled: tenantPref.isEnabled,
                frequency: tenantPref.frequency,
                quietHours: tenantPref.quietHours,
                resolvedFrom: "tenant",
            };
        }

        // 4. System default — enabled, immediate, no quiet hours
        return {
            isEnabled: true,
            frequency: "immediate" as PreferenceFrequency,
            quietHours: null,
            resolvedFrom: "default",
        };
    }

    /**
     * Look up the org unit for a principal.
     * Returns the first OU found (principals may belong to multiple OUs).
     */
    private async lookupOrgUnit(tenantId: string, principalId: string): Promise<string | null> {
        try {
            const row = await this.db
                .selectFrom(OU_TABLE as any)
                .select(["org_unit_id"])
                .where("tenant_id", "=", tenantId)
                .where("principal_id", "=", principalId)
                .executeTakeFirst();

            return (row as any)?.org_unit_id ?? null;
        } catch {
            // Table may not exist in all deployments
            this.logger.debug(
                { tenantId, principalId },
                "[notify:scoped-pref] Could not look up org unit",
            );
            return null;
        }
    }
}
