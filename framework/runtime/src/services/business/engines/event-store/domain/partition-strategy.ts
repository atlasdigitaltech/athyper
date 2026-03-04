// framework/runtime/src/services/business/engines/event-store/domain/partition-strategy.ts

/**
 * Deterministic partition key computation for each partition domain.
 * Partition keys are canonical strings that determine event ordering boundaries.
 */

import type { PartitionDomain } from "./types.js";

export interface PartitionKeyInput {
    tenantId: string;
    entityCode: string;
    /** Primary entity ID — varies by domain */
    primaryId: string;
    /** Optional secondary ID for composite keys */
    secondaryId?: string;
}

/**
 * Compute partition key for a given domain.
 * Format: "{tenantId}:{entityCode}:{primaryId}[:{secondaryId}]"
 */
export function computePartitionKey(domain: PartitionDomain, input: PartitionKeyInput): string {
    const base = `${input.tenantId}:${input.entityCode}:${input.primaryId}`;
    if (input.secondaryId) {
        return `${base}:${input.secondaryId}`;
    }
    return base;
}

/**
 * Parse a partition key back into its components.
 */
export function parsePartitionKey(key: string): PartitionKeyInput {
    const parts = key.split(":");
    if (parts.length < 3) {
        throw new Error(`Invalid partition key format: "${key}"`);
    }
    return {
        tenantId: parts[0]!,
        entityCode: parts[1]!,
        primaryId: parts[2]!,
        secondaryId: parts[3],
    };
}

/**
 * Domain-specific partition key builders.
 * Each domain defines what the primaryId means.
 */
export const PartitionKeys = {
    /** OU lifecycle events — partition by OU ID */
    ouFlow(tenantId: string, entityCode: string, ouId: string): string {
        return computePartitionKey("OU_FLOW", { tenantId, entityCode, primaryId: ouId });
    },

    /** Commitment lifecycle — partition by commitment ID */
    commitmentFlow(tenantId: string, entityCode: string, commitmentId: string): string {
        return computePartitionKey("COMMITMENT_FLOW", { tenantId, entityCode, primaryId: commitmentId });
    },

    /** Funding profile changes — partition by FP ID */
    fundingFlow(tenantId: string, entityCode: string, fpId: string): string {
        return computePartitionKey("FUNDING_FLOW", { tenantId, entityCode, primaryId: fpId });
    },

    /** Entity-level events (COA, period, org-wide) — partition by entity code */
    entityFlow(tenantId: string, entityCode: string): string {
        return computePartitionKey("ENTITY_FLOW", { tenantId, entityCode, primaryId: "global" });
    },

    /** Inventory movements — partition by warehouse ID + item ID */
    inventoryFlow(tenantId: string, entityCode: string, warehouseId: string, itemId: string): string {
        return computePartitionKey("INVENTORY_FLOW", { tenantId, entityCode, primaryId: warehouseId, secondaryId: itemId });
    },

    /** Work order lifecycle — partition by WO ID */
    workorderFlow(tenantId: string, entityCode: string, workOrderId: string): string {
        return computePartitionKey("WORKORDER_FLOW", { tenantId, entityCode, primaryId: workOrderId });
    },

    /** Asset lifecycle — partition by asset ID */
    assetFlow(tenantId: string, entityCode: string, assetId: string): string {
        return computePartitionKey("ASSET_FLOW", { tenantId, entityCode, primaryId: assetId });
    },

    /** Commission lifecycle — partition by partner ID */
    commissionFlow(tenantId: string, entityCode: string, partnerId: string): string {
        return computePartitionKey("COMMISSION_FLOW", { tenantId, entityCode, primaryId: partnerId });
    },

    /** Intercompany transactions — partition by entity pair */
    icFlow(tenantId: string, sourceEntityCode: string, destEntityCode: string): string {
        const sorted = [sourceEntityCode, destEntityCode].sort();
        return computePartitionKey("IC_FLOW", { tenantId, entityCode: sorted[0]!, primaryId: sorted[1]! });
    },
} as const;
