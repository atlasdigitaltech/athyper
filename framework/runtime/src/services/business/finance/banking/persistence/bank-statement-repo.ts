// finance/banking/persistence/bank-statement-repo.ts

import type { Container } from "../../../../../kernel/container.js";
import type { PaginationParams, PaginatedResult } from "../../../engines/shared/engine-base.js";
import { paginate } from "../../../engines/shared/engine-base.js";
import type { BankStatement, BankStatementLine, CreateBankStatementInput, StatementStatus } from "../domain/types.js";

export interface BankStatementRepo {
    create(input: CreateBankStatementInput): Promise<BankStatement>;
    getById(tenantId: string, id: string): Promise<BankStatement | null>;
    updateStatus(tenantId: string, id: string, status: StatementStatus): Promise<BankStatement>;
    list(tenantId: string, filters: {
        entityCode?: string;
        bankAccountId?: string;
        status?: StatementStatus;
    }, pagination: PaginationParams): Promise<PaginatedResult<BankStatement>>;
}

export interface BankStatementLineRepo {
    getByStatementId(tenantId: string, statementId: string): Promise<BankStatementLine[]>;
    getById(tenantId: string, id: string): Promise<BankStatementLine | null>;
    updateMatch(tenantId: string, lineId: string, updates: {
        matchStatus: string;
        matchConfidence?: number;
        matchedPaymentId?: string;
        matchedBy?: string;
    }): Promise<BankStatementLine>;
    bulkCreate(tenantId: string, statementId: string, lines: any[]): Promise<BankStatementLine[]>;
    getUnmatched(tenantId: string, statementId: string): Promise<BankStatementLine[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation — BankStatementRepo
// ---------------------------------------------------------------------------

export class DefaultBankStatementRepo implements BankStatementRepo {
    constructor(private readonly container: Container) {}

    async create(input: CreateBankStatementInput): Promise<BankStatement> {
        const db = await this.container.resolve<any>("db");
        const row = await db.queryOne(
            `INSERT INTO fin.bank_statement (tenant_id, entity_code, statement_number, bank_account_id, bank_name, statement_date, period_start, period_end, opening_balance, closing_balance, currency_code, source, status, line_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'IMPORTED',$13) RETURNING *`,
            [input.tenantId, input.entityCode, input.statementNumber, input.bankAccountId, input.bankName ?? null, input.statementDate, input.periodStart, input.periodEnd, input.openingBalance, input.closingBalance, input.currencyCode, input.source ?? "MANUAL", input.lines.length],
        );
        return row as BankStatement;
    }

    async getById(tenantId: string, id: string): Promise<BankStatement | null> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(`SELECT * FROM fin.bank_statement WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    }

    async updateStatus(tenantId: string, id: string, status: StatementStatus): Promise<BankStatement> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(`UPDATE fin.bank_statement SET status=$3, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, status]);
    }

    async list(tenantId: string, filters: { entityCode?: string; bankAccountId?: string; status?: StatementStatus }, pagination: PaginationParams): Promise<PaginatedResult<BankStatement>> {
        const db = await this.container.resolve<any>("db");
        const conditions = ["tenant_id=$1"];
        const params: unknown[] = [tenantId];
        let idx = 2;
        if (filters.entityCode) { conditions.push(`entity_code=$${idx++}`); params.push(filters.entityCode); }
        if (filters.bankAccountId) { conditions.push(`bank_account_id=$${idx++}`); params.push(filters.bankAccountId); }
        if (filters.status) { conditions.push(`status=$${idx++}`); params.push(filters.status); }
        const where = conditions.join(" AND ");
        const countResult = await db.queryOne(`SELECT COUNT(*)::int AS total FROM fin.bank_statement WHERE ${where}`, params);
        const total = countResult?.total ?? 0;
        const rows = await db.query(`SELECT * FROM fin.bank_statement WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, pagination.limit, pagination.offset]);
        return paginate(rows, total, pagination);
    }
}

// ---------------------------------------------------------------------------
// Default Implementation — BankStatementLineRepo
// ---------------------------------------------------------------------------

export class DefaultBankStatementLineRepo implements BankStatementLineRepo {
    constructor(private readonly container: Container) {}

    async getByStatementId(tenantId: string, statementId: string): Promise<BankStatementLine[]> {
        const db = await this.container.resolve<any>("db");
        return db.query(`SELECT * FROM fin.bank_statement_line WHERE tenant_id=$1 AND statement_id=$2 ORDER BY line_no`, [tenantId, statementId]);
    }

    async getById(tenantId: string, id: string): Promise<BankStatementLine | null> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(`SELECT * FROM fin.bank_statement_line WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    }

    async updateMatch(tenantId: string, lineId: string, updates: { matchStatus: string; matchConfidence?: number; matchedPaymentId?: string; matchedBy?: string }): Promise<BankStatementLine> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(
            `UPDATE fin.bank_statement_line SET match_status=$3, match_confidence=$4, matched_payment_id=$5, matched_by=$6, matched_at=NOW(), updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
            [tenantId, lineId, updates.matchStatus, updates.matchConfidence ?? null, updates.matchedPaymentId ?? null, updates.matchedBy ?? null],
        );
    }

    async bulkCreate(tenantId: string, statementId: string, lines: any[]): Promise<BankStatementLine[]> {
        const db = await this.container.resolve<any>("db");
        const results: BankStatementLine[] = [];
        for (const [i, line] of lines.entries()) {
            const row = await db.queryOne(
                `INSERT INTO fin.bank_statement_line (tenant_id, statement_id, line_no, transaction_date, value_date, amount, direction, reference, description, counterparty, bank_reference, match_status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'UNMATCHED') RETURNING *`,
                [tenantId, statementId, i + 1, line.transactionDate, line.valueDate ?? null, line.amount, line.direction, line.reference ?? null, line.description ?? null, line.counterparty ?? null, line.bankReference ?? null],
            );
            results.push(row as BankStatementLine);
        }
        return results;
    }

    async getUnmatched(tenantId: string, statementId: string): Promise<BankStatementLine[]> {
        const db = await this.container.resolve<any>("db");
        return db.query(`SELECT * FROM fin.bank_statement_line WHERE tenant_id=$1 AND statement_id=$2 AND match_status='UNMATCHED' ORDER BY line_no`, [tenantId, statementId]);
    }
}
