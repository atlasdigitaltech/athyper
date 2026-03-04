// framework/runtime/src/services/business/finance/shared/ou-intent-resolver.ts
//
// Resolves default values for finance document lines by combining
// OU hierarchy defaults with Business Intent domain defaults.

import { ok, fail } from "../../engines/shared/engine-base.js";

import type { OperatingUnitService } from "../../engines/ou-intent/services/operating-unit-service.js";
import type {
  OperationContext,
  ServiceResult,
} from "../../engines/shared/engine-base.js";

/**
 * Resolved defaults that can be applied to a document line.
 * All fields are nullable — null means "no default available, user must specify".
 */
export interface ResolvedLineDefaults {
  defaultGlAccount: string | null;
  defaultCostCenterId: string | null;
  defaultProfitCenterId: string | null;
  defaultFpId: string | null;
  defaultTaxCode: string | null;
  defaultCurrencyCode: string | null;
}

/**
 * OUIntentResolver — resolves finance line defaults from OU hierarchy + Intent.
 *
 * Resolution order:
 * 1. OU hierarchy walk (inheritFromParent cascades up to root)
 * 2. Business Intent overlay (domain-specific GL account, tax code, profile)
 * 3. Spend category smart defaults (if Decision Grid has learned patterns)
 *
 * The caller uses these as pre-fill suggestions; the user can override any field.
 */
export class OUIntentResolver {
  constructor(
    private readonly ouService: OperatingUnitService,
    private readonly intentRepo: IntentRepo,
  ) {}

  async resolveDefaults(
    ctx: OperationContext,
    ouId: string,
    intentId?: string | null,
    categoryId?: string | null,
  ): Promise<ServiceResult<ResolvedLineDefaults>> {
    // Step 1: Resolve OU defaults via hierarchy walk
    const ouResult = await this.ouService.resolveDefaults(ctx.tenantId, ouId);
    if (!ouResult.ok) {
      return fail("OU_RESOLUTION_FAILED", ouResult.error.message);
    }

    const ouDefaults = ouResult.value;

    // Start with OU-inherited values
    const resolved: ResolvedLineDefaults = {
      defaultGlAccount: null,
      defaultCostCenterId: ouDefaults.costCenterId,
      defaultProfitCenterId: ouDefaults.profitCenterId,
      defaultFpId: ouDefaults.fpId,
      defaultTaxCode: null,
      defaultCurrencyCode: ouDefaults.currencyCode,
    };

    // Step 2: Overlay Business Intent defaults (if provided)
    if (intentId) {
      const intent = await this.intentRepo.getById(ctx.tenantId, intentId);
      if (intent) {
        // Intent-level overrides take precedence over OU hierarchy
        if (intent.defaultGlAccount) {
          resolved.defaultGlAccount = intent.defaultGlAccount;
        }
        if (intent.defaultTaxCode) {
          resolved.defaultTaxCode = intent.defaultTaxCode;
        }
        if (intent.defaultAccountingProfileCode) {
          // Accounting profile may imply a specific GL account pattern
          // but we don't resolve it here — the posting engine does that.
        }
        // Intent may also refine the FP (e.g., CAPEX intents have dedicated FPs)
        if (intent.defaultFpId) {
          resolved.defaultFpId = intent.defaultFpId;
        }
      }
    }

    return ok(resolved);
  }
}

// ---------------------------------------------------------------------------
// Intent repository interface (thin — only what we need for default resolution)
// ---------------------------------------------------------------------------

export interface IntentRepo {
  getById(tenantId: string, intentId: string): Promise<IntentDefaults | null>;
}

export interface IntentDefaults {
  id: string;
  code: string;
  domain: "OPEX" | "CAPEX" | "COGS" | "STRATEGIC";
  defaultGlAccount: string | null;
  defaultTaxCode: string | null;
  defaultAccountingProfileCode: string | null;
  defaultFpId: string | null;
}
