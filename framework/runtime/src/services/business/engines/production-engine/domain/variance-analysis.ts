// framework/runtime/src/services/business/engines/production-engine/domain/variance-analysis.ts

import type { VarianceType, CostType } from "./types.js";

/**
 * Calculate production variances at work order close.
 * Returns variance records for each cost type.
 */

export interface VarianceInput {
    costType: CostType;
    standardRate: number;
    actualRate: number;
    standardQty: number;
    actualQty: number;
    standardAmount: number;
    actualAmount: number;
}

export interface VarianceResult {
    varianceType: VarianceType;
    costType: CostType;
    standardAmount: string;
    actualAmount: string;
    varianceAmount: string;
}

/**
 * Calculate material variances: PRICE and USAGE.
 */
export function calculateMaterialVariances(input: VarianceInput): VarianceResult[] {
    const results: VarianceResult[] = [];

    // Price variance = (Actual Price - Standard Price) × Actual Quantity
    const priceVariance = (input.actualRate - input.standardRate) * input.actualQty;
    results.push({
        varianceType: "PRICE",
        costType: "MATERIAL",
        standardAmount: (input.standardRate * input.actualQty).toFixed(4),
        actualAmount: (input.actualRate * input.actualQty).toFixed(4),
        varianceAmount: priceVariance.toFixed(4),
    });

    // Usage variance = (Actual Quantity - Standard Quantity) × Standard Price
    const usageVariance = (input.actualQty - input.standardQty) * input.standardRate;
    results.push({
        varianceType: "USAGE",
        costType: "MATERIAL",
        standardAmount: (input.standardRate * input.standardQty).toFixed(4),
        actualAmount: (input.standardRate * input.actualQty).toFixed(4),
        varianceAmount: usageVariance.toFixed(4),
    });

    return results;
}

/**
 * Calculate labor variances: RATE and EFFICIENCY.
 */
export function calculateLaborVariances(input: VarianceInput): VarianceResult[] {
    const results: VarianceResult[] = [];

    // Rate variance = (Actual Rate - Standard Rate) × Actual Hours
    const rateVariance = (input.actualRate - input.standardRate) * input.actualQty;
    results.push({
        varianceType: "RATE",
        costType: "LABOR",
        standardAmount: (input.standardRate * input.actualQty).toFixed(4),
        actualAmount: (input.actualRate * input.actualQty).toFixed(4),
        varianceAmount: rateVariance.toFixed(4),
    });

    // Efficiency variance = (Actual Hours - Standard Hours) × Standard Rate
    const efficiencyVariance = (input.actualQty - input.standardQty) * input.standardRate;
    results.push({
        varianceType: "EFFICIENCY",
        costType: "LABOR",
        standardAmount: (input.standardRate * input.standardQty).toFixed(4),
        actualAmount: (input.standardRate * input.actualQty).toFixed(4),
        varianceAmount: efficiencyVariance.toFixed(4),
    });

    return results;
}

/**
 * Calculate overhead variance: VOLUME.
 */
export function calculateOverheadVariances(input: VarianceInput): VarianceResult[] {
    // Volume variance = Budgeted OH - Applied OH
    const volumeVariance = input.actualAmount - input.standardAmount;
    return [{
        varianceType: "VOLUME",
        costType: "OVERHEAD",
        standardAmount: input.standardAmount.toFixed(4),
        actualAmount: input.actualAmount.toFixed(4),
        varianceAmount: volumeVariance.toFixed(4),
    }];
}

/**
 * Calculate all variances for a work order.
 */
export function calculateAllVariances(inputs: VarianceInput[]): VarianceResult[] {
    const results: VarianceResult[] = [];

    for (const input of inputs) {
        switch (input.costType) {
            case "MATERIAL":
                results.push(...calculateMaterialVariances(input));
                break;
            case "LABOR":
                results.push(...calculateLaborVariances(input));
                break;
            case "OVERHEAD":
                results.push(...calculateOverheadVariances(input));
                break;
        }
    }

    return results;
}
