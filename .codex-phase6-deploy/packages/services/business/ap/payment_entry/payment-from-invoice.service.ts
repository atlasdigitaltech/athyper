/**
 * Payment from Invoice — transactional create service.
 *
 * Closes the P2P chain (PO → Receipt → PI → Payment). User picks one or
 * more posted invoices for a single supplier, supplies the
 * amount to allocate per invoice, and the service writes a draft
 * payment_entry header + N payment_entry_allocation rows in one TX.
 *
 * Why a dedicated service (not the generic /records/payment_entry POST):
 *   - Header + allocations must be atomic. A draft payment with no
 *     allocations would be interpreted as an unallocated payment that
 *     downstream match logic cannot reconcile.
 *   - "Remaining to pay" depends on SUM(allocated_amount) from other
 *     non-voided payments against the same invoice — only meaningful
 *     inside a single TX with FOR UPDATE on the chosen invoices.
 *   - Supplier-consistency, currency-consistency, and status guards
 *     all need to evaluate the *set* of chosen invoices together;
 *     generic per-row validators can't see the cross-row invariants.
 *
 * Contract:
 *   Input:   { tenantId, principalId, companyCodeId?, documentDate?,
 *              paymentMethodId?, notes?,
 *              allocations: [{ invoiceId, allocatedAmount,
 *                              discountAmount?, withholdingTaxAmount?,
 *                              advanceRecoveryAmount?, retentionAmount?,
 *                              notes? }] }
 *   Success: { ok: true, paymentId, paymentNumber, allocationsWritten, totalAmount }
 *   Failure: { ok: false, status, error, message, fieldErrors? }
 *
 * Validation:
 *   - At least one allocation required.
 *   - Per allocation: allocatedAmount > 0; deductions >= 0.
 *   - Per allocation: (discount + wht + advRecovery + retention) <= allocated
 *     (matches the DB CHECK constraint; surfaced here for an actionable error).
 *   - Duplicate invoiceIds rejected.
 *   - All invoices must belong to the same supplier (single payment_entry
 *     can only target one supplier).
 *   - All invoices must share currency_code (payment_entry.currency_code
 *     is single-valued).
 *   - Each invoice must already be AP-posted and in posted | partially_paid
 *     status — drafts, approved-not-posted, proforma, on_hold, fully_paid,
 *     credit/debit notes, and any terminal status reject.
 *   - Per allocation: allocatedAmount <= payable_amount - SUM(prior allocations
 *     against this invoice from non-voided / non-reversed / non-cancelled
 *     payment_entries).
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { emitOutboxEvent } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface PaymentFromInvoiceAllocationInput {
  invoiceId:              string;
  allocatedAmount:        number;
  discountAmount?:        number;
  withholdingTaxAmount?:  number;
  advanceRecoveryAmount?: number;
  retentionAmount?:       number;
  notes?:                 string;
}

export interface PaymentFromInvoiceInput {
  tenantId:         string;
  principalId:      string;
  companyCodeId?:   string;
  /** ISO date; defaults to CURRENT_DATE. Used for both document_date and posting_date. */
  documentDate?:    string;
  /** ISO date; defaults to documentDate. */
  valueDate?:       string;
  /** Optional override; service resolves first active payment_method for tenant when absent. */
  paymentMethodId?: string;
  /** Optional outbound bank account selected by the caller. */
  bankAccountId?:   string;
  notes?:           string;
  /** Pre-allocated by the route handler via allocateDocumentNumber. */
  paymentNumber:    string;
  /** Pre-resolved by the route handler via resolveFiscalPeriod. */
  fiscalYear:       number;
  periodNumber:     number;
  /** Pre-resolved by the route handler via resolveCompanyAndBaseCurrency. */
  baseCurrencyCode: string;
  allocations:      PaymentFromInvoiceAllocationInput[];
}

export type PaymentFromInvoiceOutcome =
  | {
      ok: true;
      paymentId:          string;
      paymentNumber:      string;
      allocationsWritten: number;
      /** Total payment_amount (sum of allocated_amounts). */
      totalAmount:        number;
    }
  | {
      ok:           false;
      status:       number;
      error:        string;
      message:      string;
      fieldErrors?: Record<string, string>;
    };

interface InvoiceRow {
  id:                 string;
  code:     string;
  company_code_id:    string;
  supplier_id:        string;
  currency_code:      string;
  status:             string;
  terminal_status:    string | null;
  invoice_type:       string;
  payable_amount:     number;
  /** SUM(allocated_amount) from existing non-voided/reversed/cancelled
   *  payment_entries that already allocate against this invoice. */
  already_allocated:  number;
}

export async function createPaymentFromInvoice(
  db:    AnyDb,
  input: PaymentFromInvoiceInput,
): Promise<PaymentFromInvoiceOutcome> {
  const validation = await preflightPaymentFromInvoice(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createPaymentFromInvoiceInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "PAYMENT_INSERT_REJECTED", message)
      : fail(500, "PAYMENT_FROM_INVOICE_FAILED", message);
  }
}

const PAYMENT_PREFLIGHT_BOUNDARY = Symbol("payment-preflight-boundary");
const PAYMENT_PREFLIGHT_DB = { executeQuery: () => { throw PAYMENT_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightPaymentFromInvoice(input: PaymentFromInvoiceInput): Promise<PaymentFromInvoiceOutcome | null> {
  try { return await createPaymentFromInvoiceInTransaction(PAYMENT_PREFLIGHT_DB, input); }
  catch (err) { if (err === PAYMENT_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createPaymentFromInvoiceInTransaction(
  db:    AnyDb,
  input: PaymentFromInvoiceInput,
): Promise<PaymentFromInvoiceOutcome> {
  // ── Top-level validation ──────────────────────────────────────────────────
  if (input.allocations.length === 0) {
    return fail(400, "NO_ALLOCATIONS", "At least one allocation is required.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenInvoiceIds = new Set<string>();
  let totalAllocated = 0;

  for (const [idx, a] of input.allocations.entries()) {
    const path = `allocations[${idx}]`;
    if (!a.invoiceId) {
      fieldErrors[`${path}.invoiceId`] = "required";
    } else if (seenInvoiceIds.has(a.invoiceId)) {
      fieldErrors[`${path}.invoiceId`] = "duplicate";
    } else {
      seenInvoiceIds.add(a.invoiceId);
    }

    const allocated = Number(a.allocatedAmount ?? 0);
    if (!Number.isFinite(allocated) || allocated <= 0) {
      fieldErrors[`${path}.allocatedAmount`] = "must be greater than zero";
    }
    const discount   = numOrZero(a.discountAmount);
    const wht        = numOrZero(a.withholdingTaxAmount);
    const advRecover = numOrZero(a.advanceRecoveryAmount);
    const retention  = numOrZero(a.retentionAmount);
    if (discount   < 0) fieldErrors[`${path}.discountAmount`]        = "must be non-negative";
    if (wht        < 0) fieldErrors[`${path}.withholdingTaxAmount`]  = "must be non-negative";
    if (advRecover < 0) fieldErrors[`${path}.advanceRecoveryAmount`] = "must be non-negative";
    if (retention  < 0) fieldErrors[`${path}.retentionAmount`]       = "must be non-negative";

    if (allocated > 0 && (discount + wht + advRecover + retention) > allocated) {
      fieldErrors[`${path}.allocatedAmount`] =
        "sum of deductions (discount + wht + advance_recovery + retention) cannot exceed allocated_amount";
    }
    if (allocated > 0) totalAllocated += allocated;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "VALIDATION_FAILED", "One or more allocations are invalid.", fieldErrors);
  }

  // ── Single transaction: load + lock invoices, validate, insert ───────────
    const result = await (async (trx: AnyDb) => {
      const chosenIds = input.allocations.map((a) => a.invoiceId);

      const invoiceRows = await sql<InvoiceRow>`
        SELECT
            pi.id,
            pi.code,
            pi.company_code_id,
            pi.supplier_id,
            pi.currency_code,
            pi.status,
            pi.terminal_status,
            pi.invoice_type,
            pi.payable_amount::numeric AS payable_amount,
            COALESCE((
              SELECT SUM(pea.allocated_amount)::numeric
                FROM document.payment_entry_allocation pea
                JOIN document.payment_entry            pe
                  ON pe.id = pea.payment_entry_id
                 AND pe.tenant_id = pea.tenant_id
               WHERE pea.tenant_id          = pi.tenant_id
                 AND pea.purchase_invoice_id = pi.id
                 AND pe.status NOT IN ('voided', 'reversed', 'cancelled')
            ), 0) AS already_allocated
          FROM document.purchase_invoice pi
         WHERE pi.tenant_id = ${input.tenantId}::uuid
           AND pi.id        = ANY(${chosenIds}::uuid[])
           FOR UPDATE OF pi
      `.execute(trx);

      if (invoiceRows.rows.length !== chosenIds.length) {
        const found   = new Set(invoiceRows.rows.map((r) => r.id));
        const missing = chosenIds.filter((id) => !found.has(id));
        return fail(404, "INVOICES_NOT_FOUND",
          `One or more chosen invoice ids do not exist for this tenant.`,
          Object.fromEntries(missing.map((id) => [id, "not found"])));
      }

      // ── Cross-row invariants ────────────────────────────────────────
      const supplierIds = new Set(invoiceRows.rows.map((r) => r.supplier_id));
      if (supplierIds.size > 1) {
        return fail(422, "MULTIPLE_SUPPLIERS",
          "All allocations on one payment must be for invoices from the same supplier.");
      }
      const currencies = new Set(invoiceRows.rows.map((r) => r.currency_code));
      if (currencies.size > 1) {
        return fail(422, "MULTIPLE_CURRENCIES",
          "All allocations on one payment must share the same currency_code.");
      }
      const companyCodeIds = new Set(invoiceRows.rows.map((r) => r.company_code_id));
      if (companyCodeIds.size > 1) {
        return fail(422, "MULTIPLE_COMPANIES",
          "All allocations on one payment must belong to the same company_code_id.");
      }

      // ── Per-invoice status + per-line remaining gate ───────────────
      const invoiceById   = new Map(invoiceRows.rows.map((r) => [r.id, r]));
      const statusErrors: Record<string, string> = {};
      const remainingErrors: Record<string, string> = {};

      for (const a of input.allocations) {
        const inv = invoiceById.get(a.invoiceId);
        if (!inv) continue;
        if (inv.terminal_status) {
          statusErrors[a.invoiceId] = `invoice ${inv.code} is in terminal status '${inv.terminal_status}'`;
          continue;
        }
        if (["credit_note", "debit_note"].includes(inv.invoice_type)) {
          statusErrors[a.invoiceId] = `invoice ${inv.code} is a credit/debit note and must be applied through credit settlement, not paid as cash out`;
          continue;
        }
        if (!["posted", "partially_paid"].includes(inv.status)) {
          statusErrors[a.invoiceId] = `invoice ${inv.code} is in status '${inv.status}' and not payable (must be posted)`;
          continue;
        }
        const remaining = Number(inv.payable_amount) - Number(inv.already_allocated);
        const allocated = Number(a.allocatedAmount);
        if (allocated > remaining) {
          remainingErrors[a.invoiceId] =
            `allocated (${allocated}) exceeds remaining (${remaining}) on invoice ${inv.code} ` +
            `(payable=${inv.payable_amount}, already allocated=${inv.already_allocated})`;
        }
      }
      if (Object.keys(statusErrors).length > 0) {
        return fail(422, "INVOICE_NOT_PAYABLE",
          "One or more invoices are not in a payable status.", statusErrors);
      }
      if (Object.keys(remainingErrors).length > 0) {
        return fail(422, "ALLOCATION_OVER_REMAINING",
          "One or more allocations exceed the invoice's remaining-to-pay amount.",
          remainingErrors);
      }

      const firstInvoice = invoiceRows.rows[0]!;
      const supplierId   = firstInvoice.supplier_id;
      const currencyCode = firstInvoice.currency_code;
      const companyCodeIdInsert = firstInvoice.company_code_id;
      if (input.companyCodeId && input.companyCodeId !== companyCodeIdInsert) {
        return fail(422, "COMPANY_CODE_MISMATCH",
          "Payment company_code_id must match the selected invoice company_code_id.");
      }

      // ── Resolve payment_method_id if not supplied ──────────────────
      let paymentMethodId = input.paymentMethodId ?? null;
      if (paymentMethodId) {
        const suppliedPm = await sql<{ id: string }>`
          SELECT id FROM master.payment_method
           WHERE tenant_id = ${input.tenantId}::uuid
             AND id        = ${paymentMethodId}::uuid
             AND is_active = true
           LIMIT 1
        `.execute(trx);
        if (!suppliedPm.rows[0]) {
          return fail(422, "PAYMENT_METHOD_NOT_FOUND",
            "payment_method_id is not active for this tenant.");
        }
      } else {
        const pm = await sql<{ id: string }>`
          SELECT id FROM master.payment_method
           WHERE tenant_id = ${input.tenantId}::uuid AND is_active = true
           ORDER BY sort_order ASC, created_at ASC
           LIMIT 1
        `.execute(trx);
        paymentMethodId = pm.rows[0]?.id ?? null;
      }
      if (!paymentMethodId) {
        return fail(422, "PAYMENT_METHOD_REQUIRED",
          "Could not resolve payment_method_id; supply one explicitly or seed master.payment_method for the tenant.");
      }

      if (input.bankAccountId) {
        const bankAccount = await sql<{ id: string }>`
          SELECT ba.id
            FROM master.bank_account_link bal
            JOIN master.bank_account ba
              ON ba.id = bal.bank_account_id
             AND ba.tenant_id = bal.tenant_id
           WHERE bal.tenant_id       = ${input.tenantId}::uuid
             AND bal.owner_type      = 'company_code'
             AND bal.owner_id        = ${companyCodeIdInsert}::uuid
             AND bal.bank_account_id = ${input.bankAccountId}::uuid
             AND ba.status           = 'active'
           LIMIT 1
        `.execute(trx);
        if (!bankAccount.rows[0]) {
          return fail(422, "BANK_ACCOUNT_NOT_FOUND",
            "bank_account_id is not active for the resolved company_code_id.");
        }
      }

      // ── Resolve supplier_name (denormalised NOT NULL on payment_entry) ──
      // purchase_invoice doesn't carry supplier_name — read it from the
      // tenant's supplier app index (which collapses display_name / name /
      // supplier_code into one display string).
      const sn = await sql<{ supplier_name: string }>`
        SELECT COALESCE(s.display_name, s.name, s.supplier_code) AS supplier_name
          FROM master.supplier_app_index s
         WHERE s.tenant_id   = ${input.tenantId}::uuid
           AND s.supplier_id = ${supplierId}::uuid
         LIMIT 1
      `.execute(trx);
      const supplierName = sn.rows[0]?.supplier_name ?? "Unknown Supplier";

      // ── Insert payment_entry header ─────────────────────────────────
      const documentDate = input.documentDate ?? new Date().toISOString().slice(0, 10);
      const valueDate = input.valueDate ?? documentDate;
      const baseAmount = input.baseCurrencyCode === currencyCode ? totalAllocated : null;

      const headerInsert = await sql<{ id: string }>`
        INSERT INTO document.payment_entry (
          tenant_id, company_code_id,
          payment_number,
          supplier_id, supplier_name,
          payment_method_id, bank_account_id,
          document_date, posting_date, value_date,
          currency_code, base_currency_code,
          payment_amount, base_amount,
          fiscal_year, period_number,
          payment_type, payment_direction,
          line_count, notes,
          status,
          created_by
        ) VALUES (
          ${input.tenantId}::uuid,
          ${companyCodeIdInsert}::uuid,
          ${input.paymentNumber}::text,
          ${supplierId}::uuid,
          ${supplierName}::text,
          ${paymentMethodId}::uuid,
          ${input.bankAccountId ?? null}::uuid,
          ${documentDate}::date,
          ${documentDate}::date,
          ${valueDate}::date,
          ${currencyCode}::char(3),
          ${input.baseCurrencyCode}::char(3),
          ${totalAllocated}::numeric,
          ${baseAmount}::numeric,
          ${input.fiscalYear}::smallint,
          ${input.periodNumber}::smallint,
          'standard'::text,
          'OUTBOUND'::text,
          ${input.allocations.length}::smallint,
          ${input.notes ?? null}::text,
          'draft'::text,
          ${input.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);

      const paymentId = headerInsert.rows[0]?.id;
      if (!paymentId) {
        throw new Error("payment_entry header insert did not return id.");
      }

      // ── Insert allocations ──────────────────────────────────────────
      let lineNo               = 1;
      let allocationsWritten   = 0;
      for (const a of input.allocations) {
        const allocated  = Number(a.allocatedAmount);
        const discount   = numOrZero(a.discountAmount);
        const wht        = numOrZero(a.withholdingTaxAmount);
        const advRecover = numOrZero(a.advanceRecoveryAmount);
        const retention  = numOrZero(a.retentionAmount);

        await sql`
          INSERT INTO document.payment_entry_allocation (
            tenant_id, payment_entry_id, line_no,
            purchase_invoice_id,
            currency_code,
            allocated_amount,
            discount_amount, withholding_tax_amount,
            advance_recovery_amount, retention_amount,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${paymentId}::uuid,
            ${lineNo}::smallint,
            ${a.invoiceId}::uuid,
            ${currencyCode}::char(3),
            ${allocated}::numeric,
            ${discount}::numeric, ${wht}::numeric,
            ${advRecover}::numeric, ${retention}::numeric,
            ${input.principalId}::uuid
          )
        `.execute(trx);
        lineNo             += 1;
        allocationsWritten += 1;
      }

      await emitOutboxEvent(trx, {
        tenantId:      input.tenantId,
        topic:         "notification",
        eventType:     "p2p.payment.created_from_invoice",
        entityType:    "payment_entry",
        entityId:      paymentId,
        aggregateType: "purchase_invoice",
        aggregateId:   input.allocations[0]?.invoiceId ?? null as never,
        actorId:       input.principalId,
        payload: {
          payment_number:      input.paymentNumber,
          supplier_id:         supplierId,
          currency_code:       currencyCode,
          total_amount:        totalAllocated,
          allocations_written: allocationsWritten,
          invoice_ids:         input.allocations.map((a) => a.invoiceId),
          document_date:       documentDate,
        },
      });

      return {
        ok:                  true as const,
        paymentId,
        paymentNumber:       input.paymentNumber,
        allocationsWritten,
        totalAmount:         totalAllocated,
      };
    })(db);

    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function numOrZero(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fail(
  status:       number,
  error:        string,
  message:      string,
  fieldErrors?: Record<string, string>,
): PaymentFromInvoiceOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
