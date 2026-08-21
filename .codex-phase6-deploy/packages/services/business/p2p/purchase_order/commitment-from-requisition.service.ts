/**
 * Commitment (PO) from Purchase Requisition — transactional create service
 *
 * Closes the upstream end of the P2P chain (PR → PO). The picker UI lets a
 * buyer select one approved purchase_requisition + a per-line quantity grid +
 * a supplier; this service validates, writes the commitment + lines + cp
 * row, increments the PR's converted counters, and emits the notification
 * outbox event so the original requester is told their PR landed as a PO.
 *
 * Why a dedicated service (not the generic /records/commitment POST):
 *   - Header + cp + lines must be atomic. A partial write would leave a draft
 *     PO with no supplier link (cp row) — downstream pickers + notification
 *     paths both assume cp.supplier_id exists alongside the commitment.
 *   - Per-line `quantity <= remaining_quantity` validation must run inside
 *     the same TX as the converted_quantity UPDATE so two concurrent buyers
 *     can't both consume the same remaining PR qty.
 *   - PR-line converted_quantity must be bumped + PR-header converted_po_count
 *     incremented in the same TX so the PR's status / is_fully_converted
 *     flags stay accurate.
 *
 * Contract:
 *   Input:   { tenantId, principalId, requisitionId, supplierId,
 *              companyCodeId?, documentDate?, effectiveDate?, paymentTermId?,
 *              notes?, commitmentNumber, fiscalYear, periodNumber,
 *              baseCurrencyCode,
 *              lineSelections: [{ requisitionLineId, quantity, unitPrice?,
 *                                 requiredByDate? }] }
 *   Success: { ok: true, commitmentId, commitmentNumber, linesWritten }
 *   Failure: { ok: false, status, error, message, fieldErrors? }
 *
 * Validation:
 *   - At least one line selection required.
 *   - Each quantity > 0.
 *   - All chosen requisitionLineIds must belong to the supplied requisition
 *     AND tenant.
 *   - PR header must be in status 'approved' or 'partially_converted'.
 *   - Each quantity <= remaining_quantity (= quantity - converted_quantity).
 *   - supplier_id must reference an active master.supplier row in the tenant.
 *
 * Numbering / fiscal:
 *   commitment_number, fiscal_year, period_number, base_currency_code are all
 *   pre-resolved by the calling route through resolveCompanyAndBaseCurrency /
 *   resolveFiscalPeriod / allocateDocumentNumber — exactly the same shared
 *   helpers receipt-from-commitment / invoice-from-receipt use.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import { emitOutboxEvent } from "@athyper/svc-shared";
import { applyCommitmentLineDefaults } from "./commitment-line-defaults.service.js";
import { inheritProcurementLineAccounting } from "../procurement-line-accounting-inheritance.service.js";
import { refreshDistributionCostBasis } from "../../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface CommitmentFromRequisitionLineInput {
  requisitionLineId: string;
  quantity:          number;
  /** Optional override; falls back to PR line's estimated_unit_price. */
  unitPrice?:        number;
  /** Optional override of the PR line's required_by_date. */
  requiredByDate?:   string;
  notes?:            string;
}

export interface CommitmentFromRequisitionInput {
  tenantId:          string;
  principalId:       string;
  requisitionId:     string;
  supplierId:        string;
  companyCodeId?:    string;
  documentDate?:     string;
  effectiveDate?:    string;
  paymentTermId?:    string;
  notes?:            string;
  /** Pre-allocated by the caller (records route allocates via control.next_entity_number). */
  commitmentNumber:  string;
  /** Pre-resolved by the caller. */
  fiscalYear:        number;
  periodNumber:      number;
  /** Pre-resolved by the caller; defaults to company.functional_currency. */
  baseCurrencyCode:  string;
  lineSelections:    CommitmentFromRequisitionLineInput[];
}

export type CommitmentFromRequisitionOutcome =
  | { ok: true;  commitmentId: string; commitmentNumber: string; linesWritten: number }
  | {
      ok:           false;
      status:       number;
      error:        string;
      message:      string;
      fieldErrors?: Record<string, string>;
    };

interface RequisitionHeaderRow {
  id:                 string;
  tenant_id:          string;
  company_code_id:    string;
  requisition_number: string;
  status:             string;
  currency_code:      string;
  requested_by:       string | null;
}

interface RequisitionLineRow {
  id:                       string;
  purchase_requisition_id:  string;
  line_no:                  number;
  item_id:                  string | null;
  item_description:         string;
  uom_code:                 string;
  unit_price:               number;
  currency_code:            string;
  procurement_type:         string | null;
  line_type:               string | null;
  commodity_category_id:   string | null;
  business_intent_id:      string | null;
  classification_decision: string | null;
  asset_class_id:          string | null;
  tax_group_id:            string | null;
  withholding_tax_group_id: string | null;
  remaining_quantity:       number;
  required_by_date:         string | null;
}

interface SupplierRow {
  id:     string;
  status: string;
}

export async function createCommitmentFromRequisition(
  db:    AnyDb,
  input: CommitmentFromRequisitionInput,
): Promise<CommitmentFromRequisitionOutcome> {
  const validation = await preflightCommitmentFromRequisition(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createCommitmentFromRequisitionInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "COMMITMENT_INSERT_REJECTED", message)
      : fail(500, "COMMITMENT_FROM_REQUISITION_FAILED", message);
  }
}

const COMMITMENT_PREFLIGHT_BOUNDARY = Symbol("commitment-preflight-boundary");
const COMMITMENT_PREFLIGHT_DB = { executeQuery: () => { throw COMMITMENT_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightCommitmentFromRequisition(input: CommitmentFromRequisitionInput): Promise<CommitmentFromRequisitionOutcome | null> {
  try { return await createCommitmentFromRequisitionInTransaction(COMMITMENT_PREFLIGHT_DB, input); }
  catch (err) { if (err === COMMITMENT_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createCommitmentFromRequisitionInTransaction(
  db:    AnyDb,
  input: CommitmentFromRequisitionInput,
): Promise<CommitmentFromRequisitionOutcome> {
  // ── Top-level validation ──────────────────────────────────────────────────
  if (input.lineSelections.length === 0) {
    return fail(400, "NO_LINE_SELECTIONS",
      "At least one line selection is required.");
  }
  if (!input.supplierId) {
    return fail(400, "SUPPLIER_REQUIRED",
      "supplierId is required to create a commitment from a requisition.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  for (const [idx, line] of input.lineSelections.entries()) {
    const qty   = Number(line.quantity ?? 0);
    const path  = `lineSelections[${idx}]`;
    if (!line.requisitionLineId) {
      fieldErrors[`${path}.requisitionLineId`] = "required";
    } else if (seenLineIds.has(line.requisitionLineId)) {
      fieldErrors[`${path}.requisitionLineId`] = "duplicate";
    } else {
      seenLineIds.add(line.requisitionLineId);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      fieldErrors[`${path}.quantity`] = "must be greater than zero";
    }
    if (line.unitPrice !== undefined && (!Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0)) {
      fieldErrors[`${path}.unitPrice`] = "must be non-negative when supplied";
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "VALIDATION_FAILED", "One or more line selections are invalid.", fieldErrors);
  }

  // ── Single transaction: load, validate against live state, insert + UPDATE
    const result = await (async (trx: AnyDb) => {
      // Supplier must exist + be active in the tenant.
      const supRows = await sql<SupplierRow>`
        SELECT id::text AS id, status
          FROM master.supplier
         WHERE id        = ${input.supplierId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
         LIMIT 1
      `.execute(trx);
      const supplier = supRows.rows[0];
      if (!supplier) {
        return fail(404, "SUPPLIER_NOT_FOUND",
          `Supplier ${input.supplierId} not found for tenant.`);
      }
      if (supplier.status !== "active") {
        return fail(422, "SUPPLIER_NOT_ACTIVE",
          `Supplier ${input.supplierId} is in status '${supplier.status}'; only active suppliers can receive a PO.`);
      }

      // PR header — must belong to tenant + be in convertible status.
      const header = await sql<RequisitionHeaderRow>`
        SELECT id::text AS id, tenant_id::text AS tenant_id, company_code_id::text AS company_code_id,
               requisition_number, status, currency_code,
               requested_by::text AS requested_by
          FROM document.purchase_requisition
         WHERE id        = ${input.requisitionId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
         LIMIT 1
      `.execute(trx);
      const pr = header.rows[0];
      if (!pr) {
        return fail(404, "REQUISITION_NOT_FOUND",
          `Purchase requisition ${input.requisitionId} not found for tenant.`);
      }
      if (!["approved", "partially_converted"].includes(pr.status)) {
        return fail(422, "REQUISITION_NOT_CONVERTIBLE",
          `Requisition ${pr.requisition_number} is in status '${pr.status}'; ` +
          `only approved / partially_converted requisitions can be converted to a PO.`);
      }

      // Load + lock the chosen PR lines. FOR UPDATE so concurrent conversions
      // can't both consume the same remaining_quantity.
      const chosenIds = input.lineSelections.map((l) => l.requisitionLineId);
      const lineRows = await sql<RequisitionLineRow>`
        SELECT id::text AS id, purchase_requisition_id::text AS purchase_requisition_id,
               line_no, item_id::text AS item_id, item_description, uom_code,
               unit_price::float8 AS unit_price,
               currency_code, procurement_type, line_type,
               commodity_category_id::text AS commodity_category_id,
               business_intent_id::text AS business_intent_id,
               classification_decision::text AS classification_decision,
               asset_class_id::text AS asset_class_id,
               tax_group_id::text AS tax_group_id,
               withholding_tax_group_id::text AS withholding_tax_group_id,
               (quantity - COALESCE(committed_quantity, 0))::float8 AS remaining_quantity,
               required_by_date::text AS required_by_date
          FROM document.purchase_requisition_line
         WHERE tenant_id               = ${input.tenantId}::uuid
           AND purchase_requisition_id = ${input.requisitionId}::uuid
           AND id                      = ANY(${chosenIds}::uuid[])
           FOR UPDATE
      `.execute(trx);

      if (lineRows.rows.length !== chosenIds.length) {
        const found   = new Set(lineRows.rows.map((r) => r.id));
        const missing = chosenIds.filter((id) => !found.has(id));
        return fail(422, "REQUISITION_LINES_NOT_FOUND",
          `One or more selected requisition_line ids do not belong to this requisition / tenant.`,
          Object.fromEntries(missing.map((id) => [id, "not found on requisition"])));
      }

      // Per-line remaining-quantity gate.
      const lineByid = new Map(lineRows.rows.map((r) => [r.id, r]));
      const perLineErrors: Record<string, string> = {};
      for (const sel of input.lineSelections) {
        const prl = lineByid.get(sel.requisitionLineId);
        if (!prl) continue;
        const qty = Number(sel.quantity);
        if (qty > Number(prl.remaining_quantity)) {
          perLineErrors[sel.requisitionLineId] =
            `quantity (${qty}) exceeds remaining (${prl.remaining_quantity}) on line ${prl.line_no}`;
        }
        if (!prl.item_id) {
          perLineErrors[sel.requisitionLineId] =
            `requisition line ${prl.line_no} has no item_id; commitment_line.item_id is required`;
        }
      }
      if (Object.keys(perLineErrors).length > 0) {
        return fail(422, "QUANTITY_OVER_REMAINING",
          "One or more commitment lines exceed the requisition line's remaining quantity.",
          perLineErrors);
      }

      // Compute header total = sum of (quantity * effective unit_price).
      let totalAmount = 0;
      for (const sel of input.lineSelections) {
        const prl   = lineByid.get(sel.requisitionLineId)!;
        const price = sel.unitPrice ?? Number(prl.unit_price);
        totalAmount += Number(sel.quantity) * Number(price);
      }

      // ── Insert commitment header ──────────────────────────────────────
      // commitment_type='purchase_order' + order_type='standard'; polymorphic
      // party as (party_type='SUPPLIER', party_id=<supplierId>). fiscal_year
      // and period_number are advisory — derived by trg_commitment_derive_period
      // BEFORE INSERT from document_date, but we still supply them because the
      // caller pre-resolved from an authoritative fiscal_period.
      const documentDate  = input.documentDate  ?? new Date().toISOString().slice(0, 10);
      const effectiveDate = input.effectiveDate ?? documentDate;
      const headerInsert = await sql<{ id: string }>`
        INSERT INTO document.commitment (
          tenant_id, company_code_id,
          code, name, commitment_type, order_type,
          party_type, party_id,
          payment_term_id, responsible_person_id,
          document_date, effective_date,
          currency_code, base_currency_code, exchange_rate, total_amount,
          fiscal_year, period_number,
          status,
          requested_by, created_by
        ) VALUES (
          ${input.tenantId}::uuid,
          ${input.companyCodeId ?? pr.company_code_id}::uuid,
          ${input.commitmentNumber}::text,
          ${`Purchase Order ${input.commitmentNumber}`}::text,
          'purchase_order'::text,
          'standard'::text,
          'SUPPLIER'::text, ${input.supplierId}::uuid,
          ${input.paymentTermId ?? null}::uuid,
          ${input.principalId}::uuid,
          ${documentDate}::date, ${effectiveDate}::date,
          ${pr.currency_code}::char(3),
          ${input.baseCurrencyCode}::char(3),
          1::numeric,
          ${totalAmount}::numeric,
          ${input.fiscalYear}::smallint,
          ${input.periodNumber}::smallint,
          'draft'::text,
          ${pr.requested_by ?? input.principalId}::uuid,
          ${input.principalId}::uuid
        )
        RETURNING id::text AS id
      `.execute(trx);

      const commitmentId = headerInsert.rows[0]?.id;
      if (!commitmentId) {
        throw new Error("Commitment header insert did not return id.");
      }


      // ── Insert commitment lines + bump converted_quantity ──────────────
      let lineNo       = 1;
      let linesWritten = 0;
      for (const sel of input.lineSelections) {
        const prl   = lineByid.get(sel.requisitionLineId)!;
        const qty   = Number(sel.quantity);
        const price = sel.unitPrice ?? Number(prl.unit_price);
        const reqBy = sel.requiredByDate ?? prl.required_by_date ?? null;
        const inserted = await sql<{ id: string }>`
          INSERT INTO document.commitment_line (
            tenant_id, company_code_id, commitment_id, line_no,
            requisition_line_id,
            item_id, item_description,
            procurement_type, line_type,
            commodity_category_id, business_intent_id, classification_decision,
            asset_class_id, tax_group_id, withholding_tax_group_id,
            uom_code,
            quantity, unit_price, price_unit, currency_code,
            required_by_date,
            supplier_id,
            committed_quantity,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${input.companyCodeId ?? pr.company_code_id}::uuid,
            ${commitmentId}::uuid,
            ${lineNo}::smallint,
            ${prl.id}::uuid,
            ${prl.item_id}::uuid,
            ${prl.item_description}::text,
            ${prl.procurement_type ?? "goods"}::text,
            ${prl.line_type ?? "noncatalog"}::text,
            ${prl.commodity_category_id ?? null}::uuid,
            ${prl.business_intent_id ?? null}::uuid,
            ${prl.classification_decision ?? null}::jsonb,
            ${prl.asset_class_id ?? null}::uuid,
            ${prl.tax_group_id ?? null}::uuid,
            ${prl.withholding_tax_group_id ?? null}::uuid,
            ${prl.uom_code}::text,
            ${qty}::numeric,
            ${price}::numeric,
            1::numeric,
            ${prl.currency_code}::char(3),
            ${reqBy}::date,
            ${input.supplierId}::uuid,
            ${qty}::numeric,
            ${input.principalId}::uuid
          )
          RETURNING id::text AS id
        `.execute(trx);
        const commitmentLineId = inserted.rows[0]?.id;
        if (!commitmentLineId) throw new Error("Commitment line insert did not return id.");

        await inheritProcurementLineAccounting(trx, {
          tenantId: input.tenantId,
          sourceDocType: "purchase_requisition_line",
          sourceDocId: input.requisitionId,
          sourceLineId: prl.id,
          targetDocType: "commitment_line",
          targetDocId: commitmentId,
          targetLineId: commitmentLineId,
          principalId: input.principalId,
        });
        await applyCommitmentLineDefaults(trx, {
          tenantId: input.tenantId,
          commitmentId,
          commitmentLineId,
          principalId: input.principalId,
        });

        // Bump PR-line converted_quantity. Re-checks the remaining gate so
        // the constraint catches a race even if FOR UPDATE missed it (defence
        // in depth — the PRL CHECK forbids converted_quantity > quantity).
        await sql`
          UPDATE document.purchase_requisition_line
             SET committed_quantity = committed_quantity + ${qty}::numeric,
                 status             = CASE
                                        WHEN committed_quantity + ${qty}::numeric >= quantity THEN 'converted'
                                        ELSE 'partially_converted'
                                      END,
                 updated_at         = now(),
                 updated_by         = ${input.principalId}::uuid
           WHERE id        = ${prl.id}::uuid
             AND tenant_id = ${input.tenantId}::uuid
        `.execute(trx);

        lineNo       += 1;
        linesWritten += 1;
      }

      const accountingProjection = await refreshDistributionCostBasis(trx, {
        tenantId: input.tenantId,
        sourceDocType: "commitment_line",
        sourceDocId: commitmentId,
        principalId: input.principalId,
      });
      await sql`
        UPDATE document.commitment
           SET total_amount = ${accountingProjection.totals.DISTRIBUTABLE_COST},
               updated_at = now(), updated_by = ${input.principalId}::uuid
         WHERE tenant_id = ${input.tenantId}::uuid AND id = ${commitmentId}::uuid
      `.execute(trx);

      // Flip PR header status to partially/fully_converted based on line state.
      await sql`
        UPDATE document.purchase_requisition
           SET status             = CASE
                                      WHEN NOT EXISTS (
                                        SELECT 1
                                          FROM document.purchase_requisition_line prl3
                                         WHERE prl3.purchase_requisition_id = ${input.requisitionId}::uuid
                                           AND prl3.tenant_id               = ${input.tenantId}::uuid
                                           AND prl3.status IN ('open','partially_converted')
                                      ) THEN 'fully_converted'
                                      ELSE 'partially_converted'
                                    END,
               updated_at         = now(),
               updated_by         = ${input.principalId}::uuid
         WHERE id        = ${input.requisitionId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
      `.execute(trx);

      // ── Notification fan-out ─────────────────────────────────────────
      // Atomic with the create. The p2p-notification-outbox handler
      // converts this into a notification_message keyed on the requester
      // so they're told "your PR-X is now PO-Y".
      await emitOutboxEvent(trx, {
        tenantId:      input.tenantId,
        topic:         "notification",
        eventType:     "p2p.commitment.created_from_requisition",
        entityType:    "commitment",
        entityId:      commitmentId,
        aggregateType: "purchase_requisition",
        aggregateId:   input.requisitionId,
        actorId:       input.principalId,
        payload: {
          commitment_number: input.commitmentNumber,
          requisition_id:    input.requisitionId,
          supplier_id:       input.supplierId,
          lines_written:     linesWritten,
          document_date:     documentDate,
        },
      });

      return ok(commitmentId, input.commitmentNumber, linesWritten);
    })(db);

    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(commitmentId: string, commitmentNumber: string, linesWritten: number): CommitmentFromRequisitionOutcome {
  return { ok: true, commitmentId, commitmentNumber, linesWritten };
}

function fail(
  status:       number,
  error:        string,
  message:      string,
  fieldErrors?: Record<string, string>,
): CommitmentFromRequisitionOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
