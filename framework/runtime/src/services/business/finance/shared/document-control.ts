// framework/runtime/src/services/business/finance/shared/document-control.ts
//
// Shared document control utilities for finance documents.
// Provides: auto-numbering, idempotency checks, optimistic concurrency.

import type { Container } from "../../../../kernel/container.js";

/**
 * DocumentControl — cross-cutting concerns for all finance documents.
 *
 * - `generateNumber`: Sequence-based document numbers (e.g., INV-2026-00001).
 * - `checkIdempotency`: Prevents duplicate submissions using idempotency keys.
 * - `assertVersion`: Optimistic concurrency guard (409 on stale writes).
 */
export class DocumentControl {
    constructor(private readonly container: Container) {}

    /**
     * Generate a unique document number for a given prefix + entity.
     *
     * Uses a DB advisory lock + sequence counter to guarantee uniqueness
     * without serializing the entire table.
     *
     * Pattern: `{prefix}-{fiscalYear}-{seqNo(5 digits)}`
     * Example: `INV-2026-00042`, `PAY-2026-00001`, `MJE-2026-00005`
     */
    async generateNumber(
        tenantId: string,
        entityCode: string,
        prefix: string,
        fiscalYear?: number,
    ): Promise<string> {
        const year = fiscalYear ?? new Date().getFullYear();
        const db = await this.container.resolve<any>("db");

        // Use a serialized counter row in a lightweight table.
        // This is safe under concurrent access because of the `FOR UPDATE` lock.
        const row = await db.queryOne(
            `INSERT INTO fin.document_sequence (tenant_id, entity_code, prefix, fiscal_year, last_value)
             VALUES ($1, $2, $3, $4, 0)
             ON CONFLICT (tenant_id, entity_code, prefix, fiscal_year)
             DO UPDATE SET last_value = fin.document_sequence.last_value + 1,
                           updated_at = now()
             RETURNING last_value`,
            [tenantId, entityCode, prefix, year],
        );

        const seq = String(row.last_value + 1).padStart(5, "0");
        return `${prefix}-${year}-${seq}`;
    }

    /**
     * Check whether a document with this idempotency key already exists.
     * Returns `true` if a duplicate exists (caller should short-circuit).
     */
    async checkIdempotency<T extends { idempotencyKey?: string | null }>(
        repo: { findByIdempotencyKey?(tenantId: string, entityCode: string, key: string): Promise<T | null> },
        tenantId: string,
        entityCode: string,
        key: string | null | undefined,
    ): Promise<T | null> {
        if (!key) return null;
        if (!repo.findByIdempotencyKey) return null;
        return repo.findByIdempotencyKey(tenantId, entityCode, key);
    }

    /**
     * Assert optimistic concurrency version matches.
     * Throws a 409-style error if the expected version doesn't match.
     */
    assertVersion(expected: number, actual: number): void {
        if (expected !== actual) {
            const err = new Error(
                `Optimistic concurrency conflict: expected version ${expected}, found ${actual}`,
            );
            (err as any).statusCode = 409;
            (err as any).code = "VERSION_CONFLICT";
            throw err;
        }
    }
}
