/**
 * Finance Module — Payment Entry Repository
 *
 * Persistence layer for payment entries.
 * MC-4 compliant: all monetary fields are string (DECIMAL in DB).
 */

import type { Container } from "../../../../../kernel/container.js";
import type {
    PaymentEntry,
    PaymentStatus,
    CreatePaymentEntryInput,
} from "../domain/types.js";
import type { TransactionContext } from "../../../engines/posting-engine/services/posting-service.js";
import type { PaginationParams, PaginatedResult } from "../../../engines/shared/engine-base.js";
import { paginate } from "../../../engines/shared/engine-base.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PaymentEntryRepo {
    create(
        input: CreatePaymentEntryInput & { paymentNumber: string; txnId: string },
    ): Promise<PaymentEntry>;

    getById(tenantId: string, id: string): Promise<PaymentEntry | null>;

    findByIdempotencyKey(
        tenantId: string,
        entityCode: string,
        key: string,
    ): Promise<PaymentEntry | null>;

    updateStatus(
        tenantId: string,
        id: string,
        status: PaymentStatus,
        fields?: Partial<PaymentEntry>,
        tx?: TransactionContext,
    ): Promise<PaymentEntry>;

    list(
        tenantId: string,
        filters: { entityCode?: string; status?: PaymentStatus; supplierId?: string },
        pagination: PaginationParams,
    ): Promise<PaginatedResult<PaymentEntry>>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultPaymentEntryRepo implements PaymentEntryRepo {
    constructor(private readonly container: Container) {}

    async create(
        input: CreatePaymentEntryInput & { paymentNumber: string; txnId: string },
    ): Promise<PaymentEntry> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `INSERT INTO fin.payment_entry
               (tenant_id, entity_code, txn_id, payment_number, supplier_id,
                description, ou_id, payment_method, bank_account_id,
                clearing_account_id, bank_reference,
                payment_date, value_date,
                total_amount, currency_code,
                functional_currency_code, exchange_rate,
                status, idempotency_key)
             VALUES ($1, $2, $3, $4, $5,
                     $6, $7, $8, $9,
                     $10, $11,
                     $12, $13,
                     $14, $15,
                     $16, $17,
                     'DRAFT', $18)
             RETURNING *`,
            [
                input.tenantId,
                input.entityCode,
                input.txnId,
                input.paymentNumber,
                input.supplierId,
                input.description ?? null,
                input.ouId ?? null,
                input.paymentMethod,
                input.bankAccountId ?? null,
                input.clearingAccountId ?? null,
                input.bankReference ?? null,
                input.paymentDate,
                input.valueDate ?? null,
                input.totalAmount,
                input.currencyCode,
                input.functionalCurrencyCode ?? null,
                input.exchangeRate ?? null,
                input.idempotencyKey ?? null,
            ],
        );
        return mapRowToPaymentEntry(row);
    }

    async getById(tenantId: string, id: string): Promise<PaymentEntry | null> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `SELECT * FROM fin.payment_entry
             WHERE tenant_id = $1 AND id = $2`,
            [tenantId, id],
        );
        return row ? mapRowToPaymentEntry(row) : null;
    }

    async findByIdempotencyKey(
        tenantId: string,
        entityCode: string,
        key: string,
    ): Promise<PaymentEntry | null> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `SELECT * FROM fin.payment_entry
             WHERE tenant_id = $1 AND entity_code = $2 AND idempotency_key = $3`,
            [tenantId, entityCode, key],
        );
        return row ? mapRowToPaymentEntry(row) : null;
    }

    async updateStatus(
        tenantId: string,
        id: string,
        status: PaymentStatus,
        fields?: Partial<PaymentEntry>,
        tx?: TransactionContext,
    ): Promise<PaymentEntry> {
        const db = await this.container.resolve<any>("db");
        const client = tx ?? db;
        const setClauses: string[] = ["status = $3", "updated_at = now()"];
        const params: unknown[] = [tenantId, id, status];
        let paramIdx = 4;

        if (fields) {
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
            if (fields.reconciledAt !== undefined) {
                setClauses.push(`reconciled_at = $${paramIdx++}`);
                params.push(fields.reconciledAt);
            }
            if (fields.reconciledBy !== undefined) {
                setClauses.push(`reconciled_by = $${paramIdx++}`);
                params.push(fields.reconciledBy);
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

        const row = await client.queryOne(
            `UPDATE fin.payment_entry
             SET ${setClauses.join(", ")}
             WHERE tenant_id = $1 AND id = $2
             RETURNING *`,
            params,
        );
        return mapRowToPaymentEntry(row);
    }

    async list(
        tenantId: string,
        filters: { entityCode?: string; status?: PaymentStatus; supplierId?: string },
        pagination: PaginationParams,
    ): Promise<PaginatedResult<PaymentEntry>> {
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
            `SELECT COUNT(*)::int AS total FROM fin.payment_entry WHERE ${whereSQL}`,
            params,
        );
        const total: number = countRow.total;

        const dataParams = [...params, pagination.limit, pagination.offset];
        const rows = await db.query(
            `SELECT * FROM fin.payment_entry
             WHERE ${whereSQL}
             ORDER BY created_at DESC
             LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
            dataParams,
        );

        return paginate(rows.map(mapRowToPaymentEntry), total, pagination);
    }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function mapRowToPaymentEntry(row: any): PaymentEntry {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        entityCode: row.entity_code,
        txnId: row.txn_id,
        paymentNumber: row.payment_number,
        supplierId: row.supplier_id,
        description: row.description ?? null,
        ouId: row.ou_id ?? null,
        paymentMethod: row.payment_method,
        bankAccountId: row.bank_account_id ?? null,
        clearingAccountId: row.clearing_account_id ?? null,
        bankReference: row.bank_reference ?? null,
        paymentDate: new Date(row.payment_date),
        valueDate: row.value_date ? new Date(row.value_date) : null,
        totalAmount: String(row.total_amount),
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
        reconciledAt: row.reconciled_at ? new Date(row.reconciled_at) : null,
        reconciledBy: row.reconciled_by ?? null,
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
