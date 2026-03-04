// finance/banking/persistence/reconciliation-repo.ts

import type { Container } from "../../../../../kernel/container.js";
import type { ReconciliationSession, ReconciliationStatus } from "../domain/types.js";

export interface ReconciliationSessionRepo {
    create(input: {
        tenantId: string;
        statementId: string;
        totalLines: number;
        startedBy: string;
    }): Promise<ReconciliationSession>;
    getById(tenantId: string, id: string): Promise<ReconciliationSession | null>;
    getByStatementId(tenantId: string, statementId: string): Promise<ReconciliationSession | null>;
    updateCounts(tenantId: string, id: string, counts: {
        autoMatched: number;
        manualMatched: number;
        unmatched: number;
        excluded: number;
        discrepancy: string;
    }): Promise<ReconciliationSession>;
    complete(tenantId: string, id: string, completedBy: string): Promise<ReconciliationSession>;
    cancel(tenantId: string, id: string): Promise<ReconciliationSession>;
}

// ---------------------------------------------------------------------------
// Default Implementation — ReconciliationSessionRepo
// ---------------------------------------------------------------------------

export class DefaultReconciliationSessionRepo implements ReconciliationSessionRepo {
    constructor(private readonly container: Container) {}

    async create(input: { tenantId: string; statementId: string; totalLines: number; startedBy: string }): Promise<ReconciliationSession> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(
            `INSERT INTO fin.reconciliation_session (tenant_id, statement_id, status, total_lines, auto_matched, manual_matched, unmatched, excluded, discrepancy, started_by)
             VALUES ($1,$2,'OPEN',$3,0,0,$3,0,'0',$4) RETURNING *`,
            [input.tenantId, input.statementId, input.totalLines, input.startedBy],
        );
    }

    async getById(tenantId: string, id: string): Promise<ReconciliationSession | null> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(`SELECT * FROM fin.reconciliation_session WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    }

    async getByStatementId(tenantId: string, statementId: string): Promise<ReconciliationSession | null> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(`SELECT * FROM fin.reconciliation_session WHERE tenant_id=$1 AND statement_id=$2 ORDER BY created_at DESC LIMIT 1`, [tenantId, statementId]);
    }

    async updateCounts(tenantId: string, id: string, counts: { autoMatched: number; manualMatched: number; unmatched: number; excluded: number; discrepancy: string }): Promise<ReconciliationSession> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(
            `UPDATE fin.reconciliation_session SET auto_matched=$3, manual_matched=$4, unmatched=$5, excluded=$6, discrepancy=$7, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
            [tenantId, id, counts.autoMatched, counts.manualMatched, counts.unmatched, counts.excluded, counts.discrepancy],
        );
    }

    async complete(tenantId: string, id: string, completedBy: string): Promise<ReconciliationSession> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(
            `UPDATE fin.reconciliation_session SET status='COMPLETED', completed_by=$3, completed_at=NOW(), updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
            [tenantId, id, completedBy],
        );
    }

    async cancel(tenantId: string, id: string): Promise<ReconciliationSession> {
        const db = await this.container.resolve<any>("db");
        return db.queryOne(
            `UPDATE fin.reconciliation_session SET status='CANCELLED', updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
            [tenantId, id],
        );
    }
}
