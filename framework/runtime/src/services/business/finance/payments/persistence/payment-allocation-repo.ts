/**
 * Finance Module — Payment Allocation Repository
 *
 * Persistence layer for payment allocations (invoice-to-payment links).
 * Supports GROSS SETTLEMENT semantics: allocatedAmount is the total AP
 * reduction; net cash = allocatedAmount - withholdingAmount - discountAmount.
 * MC-4 compliant: all monetary fields are string (DECIMAL in DB).
 */

import type { Container } from "../../../../../kernel/container.js";
import type {
  PaymentAllocation,
  CreateAllocationInput,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PaymentAllocationRepo {
  bulkUpsert(
    tenantId: string,
    paymentId: string,
    allocations: CreateAllocationInput[],
  ): Promise<PaymentAllocation[]>;

  getByPaymentId(
    tenantId: string,
    paymentId: string,
  ): Promise<PaymentAllocation[]>;

  getByInvoiceId(
    tenantId: string,
    invoiceId: string,
  ): Promise<PaymentAllocation[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultPaymentAllocationRepo implements PaymentAllocationRepo {
  constructor(private readonly container: Container) {}

  async bulkUpsert(
    tenantId: string,
    paymentId: string,
    allocations: CreateAllocationInput[],
  ): Promise<PaymentAllocation[]> {
    const db = await this.container.resolve<any>("db");
    const results: PaymentAllocation[] = [];

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      const lineNo = i + 1;
      const row = await db.queryOne(
        `INSERT INTO fin.payment_allocation
                   (tenant_id, payment_id, invoice_id, line_no,
                    allocated_amount, discount_amount, withholding_amount,
                    commitment_id, description)
                 VALUES ($1, $2, $3, $4,
                         $5, $6, $7,
                         $8, $9)
                 ON CONFLICT (tenant_id, payment_id, invoice_id)
                 DO UPDATE SET
                   line_no = EXCLUDED.line_no,
                   allocated_amount = EXCLUDED.allocated_amount,
                   discount_amount = EXCLUDED.discount_amount,
                   withholding_amount = EXCLUDED.withholding_amount,
                   commitment_id = EXCLUDED.commitment_id,
                   description = EXCLUDED.description,
                   updated_at = now()
                 RETURNING *`,
        [
          tenantId,
          paymentId,
          alloc.invoiceId,
          lineNo,
          alloc.allocatedAmount,
          alloc.discountAmount ?? "0",
          alloc.withholdingAmount ?? "0",
          alloc.commitmentId ?? null,
          alloc.description ?? null,
        ],
      );
      results.push(mapRowToAllocation(row));
    }

    // Remove allocations no longer in the set
    const invoiceIds = allocations.map((a) => a.invoiceId);
    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map((_, i) => `$${i + 3}`).join(", ");
      await db.query(
        `DELETE FROM fin.payment_allocation
                 WHERE tenant_id = $1 AND payment_id = $2
                   AND invoice_id NOT IN (${placeholders})`,
        [tenantId, paymentId, ...invoiceIds],
      );
    } else {
      await db.query(
        `DELETE FROM fin.payment_allocation
                 WHERE tenant_id = $1 AND payment_id = $2`,
        [tenantId, paymentId],
      );
    }

    return results;
  }

  async getByPaymentId(
    tenantId: string,
    paymentId: string,
  ): Promise<PaymentAllocation[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.payment_allocation
             WHERE tenant_id = $1 AND payment_id = $2
             ORDER BY line_no`,
      [tenantId, paymentId],
    );
    return rows.map(mapRowToAllocation);
  }

  async getByInvoiceId(
    tenantId: string,
    invoiceId: string,
  ): Promise<PaymentAllocation[]> {
    const db = await this.container.resolve<any>("db");
    const rows = await db.query(
      `SELECT * FROM fin.payment_allocation
             WHERE tenant_id = $1 AND invoice_id = $2
             ORDER BY created_at`,
      [tenantId, invoiceId],
    );
    return rows.map(mapRowToAllocation);
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToAllocation(row: any): PaymentAllocation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    paymentId: row.payment_id,
    invoiceId: row.invoice_id,
    lineNo: row.line_no,
    allocatedAmount: String(row.allocated_amount),
    discountAmount: String(row.discount_amount),
    withholdingAmount: String(row.withholding_amount),
    whtTaxCalcId: row.wht_tax_calc_id ?? null,
    commissionCalcIds: row.commission_calc_ids ?? [],
    commitmentId: row.commitment_id ?? null,
    description: row.description ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
