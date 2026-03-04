/**
 * Finance Module — Purchase Invoice Repository
 *
 * Persistence layer for purchase invoices and invoice lines.
 * MC-4 compliant: all monetary fields are string (DECIMAL in DB).
 */

import type { Container } from "../../../../../kernel/container.js";
import type {
    PurchaseInvoice,
    PurchaseInvoiceLine,
    InvoiceStatus,
    CreatePurchaseInvoiceInput,
    CreateInvoiceLineInput,
} from "../domain/types.js";
import type { TransactionContext } from "../../../engines/posting-engine/services/posting-service.js";
import type { PaginationParams, PaginatedResult } from "../../../engines/shared/engine-base.js";
import { paginate } from "../../../engines/shared/engine-base.js";

// ---------------------------------------------------------------------------
// Interface — PurchaseInvoiceRepo
// ---------------------------------------------------------------------------

export interface PurchaseInvoiceRepo {
    create(
        input: CreatePurchaseInvoiceInput & { invoiceNumber: string; txnId: string },
    ): Promise<PurchaseInvoice>;

    getById(tenantId: string, id: string): Promise<PurchaseInvoice | null>;

    findByIdempotencyKey(
        tenantId: string,
        entityCode: string,
        key: string,
    ): Promise<PurchaseInvoice | null>;

    updateStatus(
        tenantId: string,
        id: string,
        status: InvoiceStatus,
        fields?: Partial<PurchaseInvoice>,
    ): Promise<PurchaseInvoice>;

    updatePaidAmount(
        tenantId: string,
        id: string,
        paidAmount: string,
        status: InvoiceStatus,
        tx?: TransactionContext,
    ): Promise<PurchaseInvoice>;

    lockForUpdate(
        ids: string[],
        tx: TransactionContext,
    ): Promise<PurchaseInvoice[]>;

    list(
        tenantId: string,
        filters: { entityCode?: string; status?: InvoiceStatus; supplierId?: string },
        pagination: PaginationParams,
    ): Promise<PaginatedResult<PurchaseInvoice>>;
}

// ---------------------------------------------------------------------------
// Interface — PurchaseInvoiceLineRepo
// ---------------------------------------------------------------------------

export interface PurchaseInvoiceLineRepo {
    bulkUpsert(
        tenantId: string,
        invoiceId: string,
        lines: CreateInvoiceLineInput[],
    ): Promise<PurchaseInvoiceLine[]>;

    getByInvoiceId(
        tenantId: string,
        invoiceId: string,
    ): Promise<PurchaseInvoiceLine[]>;

    updatePostLinks(
        tenantId: string,
        lineId: string,
        links: { assetId?: string; inventoryMovementId?: string },
    ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation — PurchaseInvoiceRepo
// ---------------------------------------------------------------------------

export class DefaultPurchaseInvoiceRepo implements PurchaseInvoiceRepo {
    constructor(private readonly container: Container) {}

    async create(
        input: CreatePurchaseInvoiceInput & { invoiceNumber: string; txnId: string },
    ): Promise<PurchaseInvoice> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `INSERT INTO fin.purchase_invoice
               (tenant_id, entity_code, txn_id, invoice_number, supplier_id,
                supplier_invoice_ref, description, ou_id, intent_id,
                spend_category_id, fp_id, accounting_profile_id,
                invoice_date, received_date, due_date,
                subtotal, tax_amount, total_amount, paid_amount,
                currency_code, functional_currency_code, exchange_rate,
                status, idempotency_key)
             VALUES ($1, $2, $3, $4, $5,
                     $6, $7, $8, $9,
                     $10, $11, $12,
                     $13, $14, $15,
                     '0', '0', '0', '0',
                     $16, $17, $18,
                     'DRAFT', $19)
             RETURNING *`,
            [
                input.tenantId,
                input.entityCode,
                input.txnId,
                input.invoiceNumber,
                input.supplierId,
                input.supplierInvoiceRef ?? null,
                input.description ?? null,
                input.ouId,
                input.intentId ?? null,
                input.spendCategoryId ?? null,
                input.fpId ?? null,
                input.accountingProfileId ?? null,
                input.invoiceDate,
                input.receivedDate ?? null,
                input.dueDate ?? null,
                input.currencyCode,
                input.functionalCurrencyCode ?? null,
                input.exchangeRate ?? null,
                input.idempotencyKey ?? null,
            ],
        );
        return mapRowToInvoice(row);
    }

    async getById(tenantId: string, id: string): Promise<PurchaseInvoice | null> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `SELECT * FROM fin.purchase_invoice
             WHERE tenant_id = $1 AND id = $2`,
            [tenantId, id],
        );
        return row ? mapRowToInvoice(row) : null;
    }

    async findByIdempotencyKey(
        tenantId: string,
        entityCode: string,
        key: string,
    ): Promise<PurchaseInvoice | null> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `SELECT * FROM fin.purchase_invoice
             WHERE tenant_id = $1 AND entity_code = $2 AND idempotency_key = $3`,
            [tenantId, entityCode, key],
        );
        return row ? mapRowToInvoice(row) : null;
    }

    async updateStatus(
        tenantId: string,
        id: string,
        status: InvoiceStatus,
        fields?: Partial<PurchaseInvoice>,
    ): Promise<PurchaseInvoice> {
        const db = await this.container.resolve<any>("db");
        const setClauses: string[] = ["status = $3", "updated_at = now()"];
        const params: unknown[] = [tenantId, id, status];
        let paramIdx = 4;

        if (fields) {
            if (fields.postingDate !== undefined) {
                setClauses.push(`posting_date = $${paramIdx++}`);
                params.push(fields.postingDate);
            }
            if (fields.jeId !== undefined) {
                setClauses.push(`je_id = $${paramIdx++}`);
                params.push(fields.jeId);
            }
            if (fields.postedAt !== undefined) {
                setClauses.push(`posted_at = $${paramIdx++}`);
                params.push(fields.postedAt);
            }
            if (fields.postedBy !== undefined) {
                setClauses.push(`posted_by = $${paramIdx++}`);
                params.push(fields.postedBy);
            }
            if (fields.submittedAt !== undefined) {
                setClauses.push(`submitted_at = $${paramIdx++}`);
                params.push(fields.submittedAt);
            }
            if (fields.submittedBy !== undefined) {
                setClauses.push(`submitted_by = $${paramIdx++}`);
                params.push(fields.submittedBy);
            }
            if (fields.approvedAt !== undefined) {
                setClauses.push(`approved_at = $${paramIdx++}`);
                params.push(fields.approvedAt);
            }
            if (fields.approvedBy !== undefined) {
                setClauses.push(`approved_by = $${paramIdx++}`);
                params.push(fields.approvedBy);
            }
            if (fields.cancelledAt !== undefined) {
                setClauses.push(`cancelled_at = $${paramIdx++}`);
                params.push(fields.cancelledAt);
            }
            if (fields.cancelledBy !== undefined) {
                setClauses.push(`cancelled_by = $${paramIdx++}`);
                params.push(fields.cancelledBy);
            }
            if (fields.decisionScore !== undefined) {
                setClauses.push(`decision_score = $${paramIdx++}`);
                params.push(fields.decisionScore);
            }
            if (fields.approvalRoute !== undefined) {
                setClauses.push(`approval_route = $${paramIdx++}`);
                params.push(fields.approvalRoute);
            }
            if (fields.approvalInstanceId !== undefined) {
                setClauses.push(`approval_instance_id = $${paramIdx++}`);
                params.push(fields.approvalInstanceId);
            }
        }

        const row = await db.queryOne(
            `UPDATE fin.purchase_invoice
             SET ${setClauses.join(", ")}
             WHERE tenant_id = $1 AND id = $2
             RETURNING *`,
            params,
        );
        return mapRowToInvoice(row);
    }

    async updatePaidAmount(
        tenantId: string,
        id: string,
        paidAmount: string,
        status: InvoiceStatus,
        tx?: TransactionContext,
    ): Promise<PurchaseInvoice> {
        const db = await this.container.resolve<any>("db");
        const client = tx ?? db;
        const row = await client.queryOne(
            `UPDATE fin.purchase_invoice
             SET paid_amount = $3, status = $4, updated_at = now()
             WHERE tenant_id = $1 AND id = $2
             RETURNING *`,
            [tenantId, id, paidAmount, status],
        );
        return mapRowToInvoice(row);
    }

    async lockForUpdate(
        ids: string[],
        tx: TransactionContext,
    ): Promise<PurchaseInvoice[]> {
        if (ids.length === 0) return [];
        const client = tx as any;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        const rows = await client.query(
            `SELECT * FROM fin.purchase_invoice
             WHERE id IN (${placeholders})
             ORDER BY id
             FOR UPDATE`,
            ids,
        );
        return rows.map(mapRowToInvoice);
    }

    async list(
        tenantId: string,
        filters: { entityCode?: string; status?: InvoiceStatus; supplierId?: string },
        pagination: PaginationParams,
    ): Promise<PaginatedResult<PurchaseInvoice>> {
        const db = await this.container.resolve<any>("db");
        const whereClauses: string[] = ["tenant_id = $1"];
        const params: unknown[] = [tenantId];
        let paramIdx = 2;

        if (filters.entityCode) {
            whereClauses.push(`entity_code = $${paramIdx++}`);
            params.push(filters.entityCode);
        }
        if (filters.status) {
            whereClauses.push(`status = $${paramIdx++}`);
            params.push(filters.status);
        }
        if (filters.supplierId) {
            whereClauses.push(`supplier_id = $${paramIdx++}`);
            params.push(filters.supplierId);
        }

        const whereSQL = whereClauses.join(" AND ");

        const countRow = await db.queryOne(
            `SELECT COUNT(*)::int AS total FROM fin.purchase_invoice WHERE ${whereSQL}`,
            params,
        );
        const total: number = countRow.total;

        const dataParams = [...params, pagination.limit, pagination.offset];
        const rows = await db.query(
            `SELECT * FROM fin.purchase_invoice
             WHERE ${whereSQL}
             ORDER BY created_at DESC
             LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
            dataParams,
        );

        return paginate(rows.map(mapRowToInvoice), total, pagination);
    }
}

// ---------------------------------------------------------------------------
// Default Implementation — PurchaseInvoiceLineRepo
// ---------------------------------------------------------------------------

export class DefaultPurchaseInvoiceLineRepo implements PurchaseInvoiceLineRepo {
    constructor(private readonly container: Container) {}

    async bulkUpsert(
        tenantId: string,
        invoiceId: string,
        lines: CreateInvoiceLineInput[],
    ): Promise<PurchaseInvoiceLine[]> {
        const db = await this.container.resolve<any>("db");
        const results: PurchaseInvoiceLine[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNo = i + 1;
            const row = await db.queryOne(
                `INSERT INTO fin.purchase_invoice_line
                   (tenant_id, invoice_id, line_no, description, item_id,
                    warehouse_id, spend_category_id, quantity, uom,
                    unit_price, amount, tax_code, tax_rate, tax_amount,
                    tax_inclusive, account_id, cost_center_id,
                    profit_center_id, fp_id, commitment_id,
                    commitment_schedule_id, tags)
                 VALUES ($1, $2, $3, $4, $5,
                         $6, $7, $8, $9,
                         $10, $11, $12, $13, $14,
                         $15, $16, $17,
                         $18, $19, $20,
                         $21, $22)
                 ON CONFLICT (tenant_id, invoice_id, line_no)
                 DO UPDATE SET
                   description = EXCLUDED.description,
                   item_id = EXCLUDED.item_id,
                   warehouse_id = EXCLUDED.warehouse_id,
                   spend_category_id = EXCLUDED.spend_category_id,
                   quantity = EXCLUDED.quantity,
                   uom = EXCLUDED.uom,
                   unit_price = EXCLUDED.unit_price,
                   amount = EXCLUDED.amount,
                   tax_code = EXCLUDED.tax_code,
                   tax_rate = EXCLUDED.tax_rate,
                   tax_amount = EXCLUDED.tax_amount,
                   tax_inclusive = EXCLUDED.tax_inclusive,
                   account_id = EXCLUDED.account_id,
                   cost_center_id = EXCLUDED.cost_center_id,
                   profit_center_id = EXCLUDED.profit_center_id,
                   fp_id = EXCLUDED.fp_id,
                   commitment_id = EXCLUDED.commitment_id,
                   commitment_schedule_id = EXCLUDED.commitment_schedule_id,
                   tags = EXCLUDED.tags,
                   updated_at = now()
                 RETURNING *`,
                [
                    tenantId,
                    invoiceId,
                    lineNo,
                    line.description,
                    line.itemId ?? null,
                    line.warehouseId ?? null,
                    line.spendCategoryId ?? null,
                    line.quantity,
                    line.uom ?? null,
                    line.unitPrice,
                    line.amount,
                    line.taxCode ?? null,
                    line.taxRate ?? "0",
                    line.taxAmount ?? "0",
                    line.taxInclusive ?? false,
                    line.accountId ?? null,
                    line.costCenterId ?? null,
                    line.profitCenterId ?? null,
                    line.fpId ?? null,
                    line.commitmentId ?? null,
                    line.commitmentScheduleId ?? null,
                    line.tags ?? [],
                ],
            );
            results.push(mapRowToLine(row));
        }

        // Remove lines beyond the new set
        await db.query(
            `DELETE FROM fin.purchase_invoice_line
             WHERE tenant_id = $1 AND invoice_id = $2 AND line_no > $3`,
            [tenantId, invoiceId, lines.length],
        );

        return results;
    }

    async getByInvoiceId(
        tenantId: string,
        invoiceId: string,
    ): Promise<PurchaseInvoiceLine[]> {
        const db = await this.container.resolve<any>("db");
        const rows = await db.query(
            `SELECT * FROM fin.purchase_invoice_line
             WHERE tenant_id = $1 AND invoice_id = $2
             ORDER BY line_no`,
            [tenantId, invoiceId],
        );
        return rows.map(mapRowToLine);
    }

    async updatePostLinks(
        tenantId: string,
        lineId: string,
        links: { assetId?: string; inventoryMovementId?: string },
    ): Promise<void> {
        const db = await this.container.resolve<any>("db");
        const setClauses: string[] = ["updated_at = now()"];
        const params: unknown[] = [tenantId, lineId];
        let paramIdx = 3;

        if (links.assetId !== undefined) {
            setClauses.push(`asset_id = $${paramIdx++}`);
            params.push(links.assetId);
        }
        if (links.inventoryMovementId !== undefined) {
            setClauses.push(`inventory_movement_id = $${paramIdx++}`);
            params.push(links.inventoryMovementId);
        }

        await db.query(
            `UPDATE fin.purchase_invoice_line
             SET ${setClauses.join(", ")}
             WHERE tenant_id = $1 AND id = $2`,
            params,
        );
    }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRowToInvoice(row: any): PurchaseInvoice {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        entityCode: row.entity_code,
        txnId: row.txn_id,
        invoiceNumber: row.invoice_number,
        supplierId: row.supplier_id,
        supplierInvoiceRef: row.supplier_invoice_ref ?? null,
        description: row.description ?? null,
        ouId: row.ou_id,
        intentId: row.intent_id ?? null,
        spendCategoryId: row.spend_category_id ?? null,
        fpId: row.fp_id ?? null,
        accountingProfileId: row.accounting_profile_id ?? null,
        invoiceDate: new Date(row.invoice_date),
        receivedDate: row.received_date ? new Date(row.received_date) : null,
        dueDate: row.due_date ? new Date(row.due_date) : null,
        postingDate: row.posting_date ? new Date(row.posting_date) : null,
        subtotal: String(row.subtotal),
        taxAmount: String(row.tax_amount),
        totalAmount: String(row.total_amount),
        paidAmount: String(row.paid_amount),
        currencyCode: row.currency_code,
        functionalCurrencyCode: row.functional_currency_code ?? null,
        exchangeRate: row.exchange_rate != null ? String(row.exchange_rate) : null,
        functionalAmount: row.functional_amount != null ? String(row.functional_amount) : null,
        status: row.status,
        decisionScore: row.decision_score ?? null,
        approvalRoute: row.approval_route ?? null,
        approvalInstanceId: row.approval_instance_id ?? null,
        jeId: row.je_id ?? null,
        postedAt: row.posted_at ? new Date(row.posted_at) : null,
        postedBy: row.posted_by ?? null,
        icTransactionId: row.ic_transaction_id ?? null,
        idempotencyKey: row.idempotency_key ?? null,
        version: row.version,
        submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
        submittedBy: row.submitted_by ?? null,
        approvedAt: row.approved_at ? new Date(row.approved_at) : null,
        approvedBy: row.approved_by ?? null,
        cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
        cancelledBy: row.cancelled_by ?? null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}

function mapRowToLine(row: any): PurchaseInvoiceLine {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        invoiceId: row.invoice_id,
        lineNo: row.line_no,
        description: row.description,
        itemId: row.item_id ?? null,
        warehouseId: row.warehouse_id ?? null,
        spendCategoryId: row.spend_category_id ?? null,
        quantity: String(row.quantity),
        uom: row.uom ?? null,
        unitPrice: String(row.unit_price),
        amount: String(row.amount),
        taxCode: row.tax_code ?? null,
        taxRate: String(row.tax_rate),
        taxAmount: String(row.tax_amount),
        taxInclusive: Boolean(row.tax_inclusive),
        accountId: row.account_id ?? null,
        costCenterId: row.cost_center_id ?? null,
        profitCenterId: row.profit_center_id ?? null,
        fpId: row.fp_id ?? null,
        commitmentId: row.commitment_id ?? null,
        commitmentScheduleId: row.commitment_schedule_id ?? null,
        assetId: row.asset_id ?? null,
        inventoryMovementId: row.inventory_movement_id ?? null,
        tags: row.tags ?? [],
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    };
}
