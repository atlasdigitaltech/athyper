// framework/runtime/src/services/business/engines/tax-engine/services/tax-calculation-service.ts

import { ok, fail } from "../../shared/engine-base.js";
import { calculateTax, aggregateTaxResults } from "../domain/tax-calculator.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { CalculateTaxInput, TaxCalculationResult, TaxCalculation } from "../domain/types.js";
import type { TaxCalculationRepo } from "../persistence/tax-calculation-repo.js";
import type { TaxJurisdictionRepo } from "../persistence/tax-jurisdiction-repo.js";
import type { TaxRateRepo } from "../persistence/tax-rate-repo.js";

/**
 * Tax Calculation Service — calculates taxes for transactions.
 */
export interface TaxCalculationService {
    /** Calculate taxes for a transaction line item */
    calculate(ctx: OperationContext, input: CalculateTaxInput): Promise<ServiceResult<TaxCalculationResult>>;
    /** Calculate taxes for multiple line items */
    calculateBatch(ctx: OperationContext, inputs: CalculateTaxInput[]): Promise<ServiceResult<TaxCalculationResult>>;
    /** Get existing calculations for a transaction */
    getByTxnId(tenantId: string, txnId: string): Promise<TaxCalculation[]>;
}

export class DefaultTaxCalculationService implements TaxCalculationService {
    constructor(
        private readonly jurisdictionRepo: TaxJurisdictionRepo,
        private readonly rateRepo: TaxRateRepo,
        private readonly calcRepo: TaxCalculationRepo,
    ) {}

    async calculate(ctx: OperationContext, input: CalculateTaxInput): Promise<ServiceResult<TaxCalculationResult>> {
        // Resolve jurisdiction
        const jurisdiction = await this.jurisdictionRepo.getByCode(ctx.tenantId, input.jurisdictionCode);
        if (!jurisdiction) {
            return fail("JURISDICTION_NOT_FOUND", `Tax jurisdiction "${input.jurisdictionCode}" not found`);
        }

        // Get effective rates
        const rates = await this.rateRepo.getEffectiveRates(
            ctx.tenantId,
            jurisdiction.id,
            input.taxCode,
            input.transactionDate,
        );

        if (rates.length === 0) {
            return fail("NO_RATES", `No effective tax rates found for ${input.taxCode} in ${input.jurisdictionCode}`);
        }

        // Calculate taxes
        const calculations = calculateTax(input, rates);

        // Persist
        const persisted = await this.calcRepo.createBatch(calculations);

        // Aggregate
        const summary = aggregateTaxResults(persisted);

        return ok({
            calculations: persisted,
            ...summary,
        });
    }

    async calculateBatch(ctx: OperationContext, inputs: CalculateTaxInput[]): Promise<ServiceResult<TaxCalculationResult>> {
        const allCalcs: TaxCalculation[] = [];

        for (const input of inputs) {
            const result = await this.calculate(ctx, input);
            if (!result.ok) return result;
            allCalcs.push(...result.value.calculations);
        }

        const summary = aggregateTaxResults(allCalcs);
        return ok({
            calculations: allCalcs,
            ...summary,
        });
    }

    async getByTxnId(tenantId: string, txnId: string): Promise<TaxCalculation[]> {
        return this.calcRepo.getByTxnId(tenantId, txnId);
    }
}
