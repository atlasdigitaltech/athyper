// framework/runtime/src/services/business/engines/ou-intent/domain/inheritance-resolver.ts

/**
 * Resolve cascading defaults from parent OUs.
 * Child OUs inherit defaults from parent unless they override locally.
 */

import type { OperatingUnit, ResolvedOUDefaults } from "./types.js";

/**
 * Resolve effective defaults for an OU by walking up the hierarchy.
 * Priority: local override > parent > grandparent > ... > root
 */
export function resolveDefaults(
  ou: OperatingUnit,
  ancestors: OperatingUnit[],
): ResolvedOUDefaults {
  if (!ou.inheritFromParent || ancestors.length === 0) {
    return {
      fpId: ou.defaultFpId,
      costCenterId: ou.defaultCostCenterId,
      profitCenterId: ou.defaultProfitCenterId,
      currencyCode: ou.defaultCurrencyCode,
    };
  }

  // Build inheritance chain: [current, parent, grandparent, ...]
  const chain = [ou, ...ancestors];

  return {
    fpId: resolveField(chain, (o) => o.defaultFpId),
    costCenterId: resolveField(chain, (o) => o.defaultCostCenterId),
    profitCenterId: resolveField(chain, (o) => o.defaultProfitCenterId),
    currencyCode: resolveField(chain, (o) => o.defaultCurrencyCode),
  };
}

/**
 * Resolve a single field by walking up the chain.
 * Returns the first non-null value found, respecting inheritance flags.
 */
function resolveField<T>(
  chain: OperatingUnit[],
  accessor: (ou: OperatingUnit) => T | null,
): T | null {
  for (const ou of chain) {
    const value = accessor(ou);
    if (value !== null && value !== undefined) {
      return value;
    }
    // Stop walking if this OU doesn't inherit
    if (!ou.inheritFromParent) {
      break;
    }
  }
  return null;
}
