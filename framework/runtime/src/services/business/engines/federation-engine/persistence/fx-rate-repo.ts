// framework/runtime/src/services/business/engines/federation-engine/persistence/fx-rate-repo.ts

import type { FxRate, CreateFxRateInput, FxRateType } from "../domain/types.js";

export interface FxRateRepo {
    create(input: CreateFxRateInput): Promise<FxRate>;
    createBatch(inputs: CreateFxRateInput[]): Promise<FxRate[]>;
    getRate(tenantId: string, fromCurrency: string, toCurrency: string, rateType: FxRateType, asOfDate: Date): Promise<FxRate | null>;
    listRates(tenantId: string, fromCurrency: string, toCurrency: string, filters?: { rateType?: FxRateType; fromDate?: Date; toDate?: Date }): Promise<FxRate[]>;
}
