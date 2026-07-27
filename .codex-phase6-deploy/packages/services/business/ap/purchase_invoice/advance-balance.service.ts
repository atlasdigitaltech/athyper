/**
 * AdvanceBalanceService — Phase 2
 *
 * Maintains document.party_advance_balance for non-PO AP invoices that carry
 * ADVANCE / ADVANCE_RECOVERY / RETENTION / RETENTION_RELEASE payment term clauses.
 *
 * Balance mutations happen on posted financial events only (invoice posting,
 * invoice reversal). Draft PTA creation does NOT update this table.
 *
 * Called from:
 *   invoice-posting.service.ts  handlePostInvoice    (+1 sign)
 *   invoice-posting.service.ts  handleReverseInvoice (-1 sign)
 *
 * Currency scope: currency_code is part of the natural key so that USD, EUR,
 * MYR, etc. balances are never merged within a supplier+company.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface BalanceDelta {
  advanceDelta:   number;
  retentionDelta: number;
  advanceCount:   number;
  retentionCount: number;
}

/**
 * Computes the balance delta from a list of PTA clause entries.
 * sign = +1 when posting, -1 when reversing.
 */
export function computeBalanceDelta(
  clauseEntries: Array<{ clause_type: string; applied_amount: number }>,
  sign: 1 | -1 = 1,
): BalanceDelta {
  let advanceDelta   = 0;
  let retentionDelta = 0;
  let hasAdvance     = false;
  let hasRetention   = false;

  for (const c of clauseEntries) {
    const amt = Math.abs(c.applied_amount) * sign;
    switch (c.clause_type) {
      case "ADVANCE":
        advanceDelta += amt;
        hasAdvance    = true;   // true for both posting (+1) and reversal (-1)
        break;
      case "ADVANCE_RECOVERY":
        advanceDelta -= amt;
        break;
      case "RETENTION":
        retentionDelta += amt;
        hasRetention   = true;  // true for both posting (+1) and reversal (-1)
        break;
      case "RETENTION_RELEASE":
        retentionDelta -= amt;
        break;
    }
  }

  return {
    advanceDelta,
    retentionDelta,
    // sign propagates to counts: +1 on post, -1 on reversal (GREATEST(0,...) clamps at 0)
    advanceCount:   hasAdvance   ? sign : 0,
    retentionCount: hasRetention ? sign : 0,
  };
}

/**
 * Upserts party_advance_balance, applying the delta atomically.
 *
 * Emits a structured warning if the computed new balance would be negative
 * (over-recovery / out-of-order events), and clamps to zero.  Operations
 * are not failed hard — a monitoring alert should be raised by the caller.
 *
 * No-op if both deltas are zero.
 */
export async function applyPartyAdvanceBalanceDelta(
  db:           AnyDb,
  tenantId:     string,
  companyId:    string,
  supplierId:   string,
  currencyCode: string,
  delta:        BalanceDelta,
  principalId:  string | null,
  logger?:      { warn?(e: string, f?: Record<string, unknown>): void },
): Promise<void> {
  if (delta.advanceDelta === 0 && delta.retentionDelta === 0) return;

  const pId = principalId ?? "00000000-0000-0000-0000-000000000000";

  // Detect potential over-application before the write (advisory — does not block)
  if (delta.advanceDelta < 0 || delta.retentionDelta < 0) {
    const current = await sql<{ advance_balance: number; retention_balance: number }>`
      SELECT advance_balance, retention_balance
        FROM document.party_advance_balance
       WHERE tenant_id       = ${tenantId}
         AND company_code_id = ${companyId}
         AND supplier_id     = ${supplierId}
         AND currency_code   = ${currencyCode}
       LIMIT 1
    `.execute(db);

    const row = current.rows[0];
    if (row) {
      const newAdv = Number(row.advance_balance)   + delta.advanceDelta;
      const newRet = Number(row.retention_balance) + delta.retentionDelta;
      if (newAdv < 0 || newRet < 0) {
        logger?.warn?.("party_advance_balance_over_application", {
          tenantId, companyId, supplierId, currencyCode,
          currentAdvance:   row.advance_balance,
          currentRetention: row.retention_balance,
          advanceDelta:     delta.advanceDelta,
          retentionDelta:   delta.retentionDelta,
          note: "balance would go negative — clamped to 0; investigate PTA event ordering",
        });
      }
    }
  }

  await sql`
    INSERT INTO document.party_advance_balance (
      tenant_id, company_code_id, supplier_id, currency_code,
      advance_balance, retention_balance,
      advance_invoice_count, retention_invoice_count,
      last_updated_at, created_at, created_by
    ) VALUES (
      ${tenantId}, ${companyId}, ${supplierId}, ${currencyCode},
      GREATEST(0, ${delta.advanceDelta}::numeric),
      GREATEST(0, ${delta.retentionDelta}::numeric),
      GREATEST(0, ${delta.advanceCount}),
      GREATEST(0, ${delta.retentionCount}),
      now(), now(), ${pId}
    )
    ON CONFLICT (tenant_id, company_code_id, supplier_id, currency_code) DO UPDATE SET
      advance_balance         = GREATEST(0,
        document.party_advance_balance.advance_balance   + ${delta.advanceDelta}::numeric),
      retention_balance       = GREATEST(0,
        document.party_advance_balance.retention_balance + ${delta.retentionDelta}::numeric),
      advance_invoice_count   = GREATEST(0,
        document.party_advance_balance.advance_invoice_count   + ${delta.advanceCount}),
      retention_invoice_count = GREATEST(0,
        document.party_advance_balance.retention_invoice_count + ${delta.retentionCount}),
      last_updated_at         = now()
  `.execute(db);
}

/**
 * Reads all effective PTA rows for an invoice, computes the balance delta,
 * and applies it to party_advance_balance.
 *
 * sign = +1 when posting (invoice goes live), -1 when reversing.
 * Called only for non-PO invoices (commitment_id IS NULL PTA rows).
 */
export async function updatePartyBalanceOnPosting(
  db:           AnyDb,
  tenantId:     string,
  invoiceId:    string,
  supplierId:   string,
  companyId:    string,
  currencyCode: string,
  sign:         1 | -1,
  principalId:  string | null,
  logger?:      { warn?(e: string, f?: Record<string, unknown>): void },
): Promise<void> {
  const ptaRows = await sql<{ clause_type: string; applied_amount: number }>`
    SELECT clause_type, applied_amount
      FROM document.payment_term_application
     WHERE invoice_id      = ${invoiceId}
       AND tenant_id       = ${tenantId}
       AND commitment_id   IS NULL
       AND is_effective     = true
       AND clause_type     IN ('ADVANCE','ADVANCE_RECOVERY','RETENTION','RETENTION_RELEASE')
  `.execute(db);

  if (ptaRows.rows.length === 0) return;

  const delta = computeBalanceDelta(
    ptaRows.rows.map(r => ({ clause_type: r.clause_type, applied_amount: Number(r.applied_amount) })),
    sign,
  );

  await applyPartyAdvanceBalanceDelta(
    db, tenantId, companyId, supplierId, currencyCode, delta, principalId, logger,
  );
}

/**
 * Returns the current balance row for a supplier+company+currency (null if none exists).
 */
export async function getPartyAdvanceBalance(
  db:           AnyDb,
  tenantId:     string,
  companyId:    string,
  supplierId:   string,
  currencyCode: string,
): Promise<{ advance_balance: number; retention_balance: number } | null> {
  const result = await sql<{ advance_balance: number; retention_balance: number }>`
    SELECT advance_balance, retention_balance
      FROM document.party_advance_balance
     WHERE tenant_id       = ${tenantId}
       AND company_code_id = ${companyId}
       AND supplier_id     = ${supplierId}
       AND currency_code   = ${currencyCode}
     LIMIT 1
  `.execute(db);

  return result.rows[0] ?? null;
}
