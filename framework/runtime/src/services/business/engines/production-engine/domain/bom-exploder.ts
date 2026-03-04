// framework/runtime/src/services/business/engines/production-engine/domain/bom-exploder.ts
//
// MC-4 compliance: All arithmetic uses BigInt via shared/money.
// No parseFloat / toFixed anywhere in this module.

import { multiplyAmounts, sumAmounts } from "../../shared/money.js";

import type { BomLine, ExplodedBomLine } from "./types.js";

// Quantity precision: 6 decimal places for manufacturing quantities
const QTY_PRECISION = 6;

/**
 * Explode a multi-level BOM recursively.
 * Phantom components are expanded to their sub-components.
 * Detects circular references.
 */
export function explodeBom(
  rootBomLines: BomLine[],
  /** Function to get BOM lines for a component product */
  getComponentBomLines: (productId: string) => BomLine[],
  parentQty: string = "1",
  level: number = 0,
  path: string[] = [],
  maxDepth: number = 20,
): ExplodedBomLine[] {
  if (level >= maxDepth) {
    throw new Error(
      `BOM explosion exceeded max depth of ${maxDepth}. Possible circular reference.`,
    );
  }

  const result: ExplodedBomLine[] = [];

  for (const line of rootBomLines) {
    // Check circular reference
    if (path.includes(line.componentProductId)) {
      throw new Error(
        `Circular BOM reference detected: ${[...path, line.componentProductId].join(" → ")}`,
      );
    }

    // MC-4 compliant: Calculate total quantity needed (parent qty * qty per unit * (1 + scrap%))
    // scrapFactor = 1 + scrapPct/100 = (100 + scrapPct) / 100
    // We compute scrapFactor as a string: sumAmounts(["100", scrapPct]) / "100"
    // Then totalQty = parentQty * qtyPer * scrapFactor
    const scrapPct = line.scrapPct || "0";
    const hundredPlusScrap = sumAmounts(["100", scrapPct], QTY_PRECISION);
    const scrapFactor = multiplyAmounts(
      hundredPlusScrap,
      "0.01",
      QTY_PRECISION,
    );
    const qtyTimesScrap = multiplyAmounts(
      line.quantityPer,
      scrapFactor,
      QTY_PRECISION,
    );
    const totalQtyStr = multiplyAmounts(
      parentQty,
      qtyTimesScrap,
      QTY_PRECISION,
    );

    const currentPath = [...path, line.componentProductId];

    if (line.isPhantom) {
      // Phantom: explode to sub-components
      const subLines = getComponentBomLines(line.componentProductId);
      if (subLines.length > 0) {
        const subResults = explodeBom(
          subLines,
          getComponentBomLines,
          totalQtyStr,
          level + 1,
          currentPath,
          maxDepth,
        );
        result.push(...subResults);
      }
    } else {
      // Regular component: add to result
      result.push({
        componentProductId: line.componentProductId,
        totalQuantity: totalQtyStr,
        level,
        path: currentPath,
      });
    }
  }

  return result;
}

/**
 * Consolidate exploded BOM lines (merge same components).
 * MC-4 compliant: uses sumAmounts instead of parseFloat addition.
 */
export function consolidateExplodedBom(
  lines: ExplodedBomLine[],
): ExplodedBomLine[] {
  const map = new Map<string, ExplodedBomLine>();

  for (const line of lines) {
    const existing = map.get(line.componentProductId);
    if (existing) {
      // MC-4 compliant: sumAmounts instead of parseFloat addition
      const newQty = sumAmounts(
        [existing.totalQuantity, line.totalQuantity],
        QTY_PRECISION,
      );
      map.set(line.componentProductId, {
        ...existing,
        totalQuantity: newQty,
      });
    } else {
      map.set(line.componentProductId, { ...line });
    }
  }

  return Array.from(map.values());
}
