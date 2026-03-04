// framework/runtime/src/services/business/finance/shared/post-action-handlers.ts
//
// Idempotent post-action handlers for finance document posting side effects.
// Each handler processes events from the outbox and uses idempotency keys
// to prevent duplicate processing.

import type { PostActionEvent, PostActionHandler } from "./outbox.js";
import type { Container } from "../../../../kernel/container.js";

// ---------------------------------------------------------------------------
// Inventory Receipt Handler
// ---------------------------------------------------------------------------

/**
 * Creates inventory receipt movements for invoice lines with item_id.
 * Idempotency key: `inventory:{docId}:{lineId}:RECEIPT`
 */
export class InventoryReceiptHandler implements PostActionHandler {
  readonly name = "inventory-receipt";

  constructor(private readonly container: Container) {}

  async handle(event: PostActionEvent): Promise<boolean> {
    const linesWithItems = event.lines.filter((l) => l.itemId != null);
    if (linesWithItems.length === 0) return false;

    const inventoryOps = await this.container.resolve<any>(
      "fin.engines.inventoryOps",
    );
    let processed = false;

    for (const line of linesWithItems) {
      const idempotencyKey = `inventory:${event.docId}:${line.lineId}:RECEIPT`;

      try {
        await inventoryOps.receiveStock({
          tenantId: event.tenantId,
          entityCode: event.entityCode,
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantity: line.amount, // Simplified — real impl uses line quantity
          sourceDocId: event.docId,
          sourceDocLineId: line.lineId,
          idempotencyKey,
        });
        processed = true;
      } catch (err: unknown) {
        // If idempotency duplicate, skip silently
        if ((err as Record<string, unknown>)?.code === "IDEMPOTENT_DUPLICATE") continue;
        throw err;
      }
    }

    return processed;
  }
}

// ---------------------------------------------------------------------------
// Asset WIP Handler
// ---------------------------------------------------------------------------

/**
 * Creates WIP assets for CAPEX invoice lines.
 * Idempotency key: `asset:{docId}:{lineId}:WIP`
 */
export class AssetWIPHandler implements PostActionHandler {
  readonly name = "asset-wip";

  constructor(private readonly container: Container) {}

  async handle(event: PostActionEvent): Promise<boolean> {
    const capexLines = event.lines.filter((l) => l.intentDomain === "CAPEX");
    if (capexLines.length === 0) return false;

    const assetOps = await this.container.resolve<any>("fin.engines.assetOps");
    let processed = false;

    for (const line of capexLines) {
      const idempotencyKey = `asset:${event.docId}:${line.lineId}:WIP`;

      try {
        await assetOps.createAsset({
          tenantId: event.tenantId,
          entityCode: event.entityCode,
          sourceDocId: event.docId,
          sourceDocLineId: line.lineId,
          amount: line.amount,
          accountId: line.accountId,
          idempotencyKey,
        });
        processed = true;
      } catch (err: unknown) {
        if ((err as Record<string, unknown>)?.code === "IDEMPOTENT_DUPLICATE") continue;
        throw err;
      }
    }

    return processed;
  }
}

// ---------------------------------------------------------------------------
// Commission Calculation Handler
// ---------------------------------------------------------------------------

/**
 * Calculates commissions for the posted document.
 * Idempotency key: `commission:{docId}:CALC`
 */
export class CommissionCalcHandler implements PostActionHandler {
  readonly name = "commission-calc";

  constructor(private readonly container: Container) {}

  async handle(event: PostActionEvent): Promise<boolean> {
    const commissionOps = await this.container.resolve<any>(
      "fin.engines.commissionOps",
    );
    const idempotencyKey = `commission:${event.docId}:CALC`;

    try {
      await commissionOps.calculateCommission({
        tenantId: event.tenantId,
        entityCode: event.entityCode,
        docId: event.docId,
        docType: event.docType,
        supplierId: event.supplierId,
        idempotencyKey,
      });
      return true;
    } catch (err: unknown) {
      if ((err as Record<string, unknown>)?.code === "IDEMPOTENT_DUPLICATE") return false;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Federation IC Handler
// ---------------------------------------------------------------------------

/**
 * Creates intercompany transaction for cross-entity postings.
 * Idempotency key: `federation:{docId}:IC`
 */
export class FederationICHandler implements PostActionHandler {
  readonly name = "federation-ic";

  constructor(private readonly container: Container) {}

  async handle(event: PostActionEvent): Promise<boolean> {
    const federationOps = await this.container.resolve<any>(
      "fin.engines.federationOps",
    );
    const idempotencyKey = `federation:${event.docId}:IC`;

    try {
      await federationOps.createICTransaction({
        tenantId: event.tenantId,
        entityCode: event.entityCode,
        docId: event.docId,
        docType: event.docType,
        jeId: event.jeId,
        supplierId: event.supplierId,
        idempotencyKey,
      });
      return true;
    } catch (err: unknown) {
      if ((err as Record<string, unknown>)?.code === "IDEMPOTENT_DUPLICATE") return false;
      throw err;
    }
  }
}
