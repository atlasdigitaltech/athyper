// =============================================================================
// Inventory Subledger Engine — Valuation Calculators
// Athyper v2.1 Business Operating Platform
// =============================================================================

import { ValuationMethod } from "./types.js";

import type {
  ValuationLayer,
  InventoryBalance,
  ValuationResult,
  LayerConsumption,
} from "./types.js";

// ---------------------------------------------------------------------------
// Valuation Calculator Interface
// ---------------------------------------------------------------------------

export interface ValuationCalculator {
  /**
   * Calculate the unit cost for an issuance and determine which layers to consume.
   *
   * @param layers - Existing unconsumed valuation layers (ordered by layer_date ASC)
   * @param balance - Current inventory balance for the item/warehouse
   * @param issueQty - Quantity being issued (always positive)
   * @param standardCost - Standard cost (used only for STANDARD method)
   * @returns ValuationResult with unit cost, total cost, and layer consumptions
   */
  calculate(
    layers: readonly ValuationLayer[],
    balance: InventoryBalance | null,
    issueQty: number,
    standardCost?: number | null,
  ): ValuationResult;
}

// ---------------------------------------------------------------------------
// FIFO Calculator — First In, First Out
// Consumes layers in chronological order (oldest first)
// ---------------------------------------------------------------------------

export class FifoCalculator implements ValuationCalculator {
  calculate(
    layers: readonly ValuationLayer[],
    _balance: InventoryBalance | null,
    issueQty: number,
  ): ValuationResult {
    // Sort layers by date ascending (oldest first)
    const sorted = [...layers]
      .filter((l) => !l.isConsumed && l.remainingQty > 0)
      .sort((a, b) => a.layerDate.getTime() - b.layerDate.getTime());

    return consumeLayersInOrder(sorted, issueQty);
  }
}

// ---------------------------------------------------------------------------
// LIFO Calculator — Last In, First Out
// Consumes layers in reverse chronological order (newest first)
// ---------------------------------------------------------------------------

export class LifoCalculator implements ValuationCalculator {
  calculate(
    layers: readonly ValuationLayer[],
    _balance: InventoryBalance | null,
    issueQty: number,
  ): ValuationResult {
    // Sort layers by date descending (newest first)
    const sorted = [...layers]
      .filter((l) => !l.isConsumed && l.remainingQty > 0)
      .sort((a, b) => b.layerDate.getTime() - a.layerDate.getTime());

    return consumeLayersInOrder(sorted, issueQty);
  }
}

// ---------------------------------------------------------------------------
// Weighted Average Calculator
// Uses the current balance's average unit cost
// ---------------------------------------------------------------------------

export class WeightedAvgCalculator implements ValuationCalculator {
  calculate(
    _layers: readonly ValuationLayer[],
    balance: InventoryBalance | null,
    issueQty: number,
  ): ValuationResult {
    if (!balance || balance.quantityOnHand <= 0) {
      return {
        unitCost: 0,
        totalCost: 0,
        layerConsumptions: [],
      };
    }

    // Weighted average cost = total_value / quantity_on_hand
    const avgUnitCost = balance.totalValue / balance.quantityOnHand;
    const roundedUnitCost = roundTo4(avgUnitCost);

    return {
      unitCost: roundedUnitCost,
      totalCost: roundTo4(roundedUnitCost * issueQty),
      layerConsumptions: [], // No layer tracking for weighted average
    };
  }
}

// ---------------------------------------------------------------------------
// Standard Cost Calculator
// Uses a predetermined standard cost per item
// ---------------------------------------------------------------------------

export class StandardCostCalculator implements ValuationCalculator {
  calculate(
    _layers: readonly ValuationLayer[],
    _balance: InventoryBalance | null,
    issueQty: number,
    standardCost?: number | null,
  ): ValuationResult {
    const cost = standardCost ?? 0;

    return {
      unitCost: cost,
      totalCost: roundTo4(cost * issueQty),
      layerConsumptions: [], // No layer tracking for standard cost
    };
  }
}

// ---------------------------------------------------------------------------
// Specific Identification Calculator
// Consumes a specific layer identified by the caller (first matching layer).
// In practice, the caller narrows layers to the specific lot/serial before
// invoking the calculator.
// ---------------------------------------------------------------------------

export class SpecificIdentificationCalculator implements ValuationCalculator {
  calculate(
    layers: readonly ValuationLayer[],
    _balance: InventoryBalance | null,
    issueQty: number,
  ): ValuationResult {
    // For specific identification, we expect the caller to have pre-filtered
    // layers to only those matching the specific lot/serial. We consume them
    // in date order (like FIFO within the filtered set).
    const sorted = [...layers]
      .filter((l) => !l.isConsumed && l.remainingQty > 0)
      .sort((a, b) => a.layerDate.getTime() - b.layerDate.getTime());

    return consumeLayersInOrder(sorted, issueQty);
  }
}

// ---------------------------------------------------------------------------
// Factory — Obtain calculator by valuation method
// ---------------------------------------------------------------------------

const calculatorInstances: Record<ValuationMethod, ValuationCalculator> = {
  [ValuationMethod.FIFO]: new FifoCalculator(),
  [ValuationMethod.LIFO]: new LifoCalculator(),
  [ValuationMethod.WEIGHTED_AVG]: new WeightedAvgCalculator(),
  [ValuationMethod.STANDARD]: new StandardCostCalculator(),
  [ValuationMethod.SPECIFIC]: new SpecificIdentificationCalculator(),
};

export function getValuationCalculator(
  method: ValuationMethod,
): ValuationCalculator {
  return calculatorInstances[method];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Consume layers in the given order until issueQty is fulfilled.
 * Returns the weighted unit cost and per-layer consumptions.
 */
function consumeLayersInOrder(
  orderedLayers: readonly ValuationLayer[],
  issueQty: number,
): ValuationResult {
  let remaining = issueQty;
  let totalCost = 0;
  const consumptions: LayerConsumption[] = [];

  for (const layer of orderedLayers) {
    if (remaining <= 0) break;

    const consume = Math.min(layer.remainingQty, remaining);
    totalCost += consume * layer.unitCost;
    remaining -= consume;

    consumptions.push({
      layerId: layer.id,
      quantityConsumed: consume,
      unitCost: layer.unitCost,
    });
  }

  if (remaining > 0) {
    // Insufficient layers to cover the full issue quantity.
    // This is an error condition — caller should validate beforehand.
    // We return what we can cost; the service layer will handle the shortfall.
  }

  const costableQty = issueQty - remaining;
  const unitCost = costableQty > 0 ? roundTo4(totalCost / costableQty) : 0;

  return {
    unitCost,
    totalCost: roundTo4(totalCost),
    layerConsumptions: consumptions,
  };
}

/**
 * Round to 4 decimal places (matching DECIMAL(18,4) precision).
 */
function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
