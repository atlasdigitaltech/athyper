/**
 * Receipt from Commitment — transactional create service (P2P plan Plan E2)
 *
 * Single-TX create of a document.receipt header + N document.receipt_line
 * rows from a chosen commitment + line-acceptance grid. The picker UI
 * (PR E1) provides the user's choice of commitment_line ids + accepted /
 * rejected quantities; this service validates and writes.
 *
 * Why a dedicated service (not the generic /records/receipt POST):
 *   - Header + lines must be atomic. A partial write (header only) would
 *     leave a draft receipt with no lines that downstream logic interprets
 *     as a zero-qty receipt.
 *   - The accepted/rejected qty validation is line-level and requires the
 *     commitment_line's remaining_quantity to gate it — too much logic for
 *     the generic records route's per-row validators.
 *   - Receipt is a promoted document (the user picks an upstream
 *     commitment), not an originated one. The from-commitment shape
 *     captures only what the user actually decides; everything else
 *     (item, uom, unit_price, supplier) is inherited from the commitment.
 *
 * Contract:
 *   Input:   { tenantId, principalId, companyCodeId?, commitmentId,
 *              documentDate?, deliveryNoteId?, notes?,
 *              lineAcceptances: [{ commitmentLineId, acceptedQty,
 *                                  rejectedQty?, notes? }] }
 *   Success: { ok: true, receiptId, receiptNumber }
 *   Failure: { ok: false, status, error, message,
 *              fieldErrors?: Record<string, string> }
 *
 * Validation:
 *   - At least one line acceptance required.
 *   - Each acceptedQty must be > 0; rejectedQty defaults to 0; both non-negative.
 *   - acceptedQty + rejectedQty must be <= commitment_line.remaining_quantity
 *     for that line, taken as of the same transaction.
 *   - All chosen commitment_line ids must belong to the supplied commitment
 *     AND tenant (FK rcpl_commitment_line_fk + tenant isolation guard).
 *   - The commitment must be in a transactable status
 *     (approved | active | partially_fulfilled).
 *
 * Numbering / fiscal:
 *   receipt_number is allocated through control.next_entity_number when the
 *   route handler routes through receipt-from-commitment. Fiscal-period
 *   resolution lives in records.route.ts (shared with the manual receipt
 *   path); the route handler runs that resolver before calling this service.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  emitOutboxEvent,
  getLifecycleStatesWithFlag,
  loadCommitmentHeader,
} from "@athyper/svc-shared";
import { inheritProcurementLineAccounting } from "../procurement-line-accounting-inheritance.service.js";
import { refreshDistributionCostBasis } from "../../pricing_component/component-accounting-loader.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface ReceiptFromCommitmentLineInput {
  commitmentLineId: string;
  acceptedQty:      number;
  rejectedQty?:     number;
  notes?:           string;
}

export interface ReceiptFromCommitmentInput {
  tenantId:         string;
  principalId:      string;
  commitmentId:     string;
  companyCodeId?:   string;
  documentDate?:    string;       // ISO date; defaults to CURRENT_DATE
  deliveryNoteId?:  string;
  receivingSiteId?: string;
  receivingWarehouseId?: string;
  notes?:           string;
  /** Pre-allocated by the caller (records route allocates via control.next_entity_number). */
  receiptNumber:    string;
  /** Pre-resolved by the caller (records route runs the fiscal_period lookup). */
  fiscalYear:       number;
  periodNumber:     number;
  /** Pre-resolved by the caller; defaults to company.functional_currency. */
  baseCurrencyCode: string;
  lineAcceptances:  ReceiptFromCommitmentLineInput[];
}

export type ReceiptFromCommitmentOutcome =
  | { ok: true;  receiptId: string; receiptNumber: string; linesWritten: number }
  | {
      ok:           false;
      status:       number;
      error:        string;
      message:      string;
      fieldErrors?: Record<string, string>;
    };

interface CommitmentLineRow {
  id:                  string;
  commitment_id:       string;
  line_no:             number;
  item_id:             string | null;
  item_description:    string;
  uom_code:            string;
  unit_price:          number;
  currency_code:       string;
  procurement_type:    string | null;
  line_type:          string | null;
  remaining_quantity:  number;
  asset_class_id:      string | null;
  commodity_category_id: string | null;
  business_intent_id: string | null;
  classification_decision: string | null;
  tax_group_id: string | null;
  withholding_tax_group_id: string | null;
}

export async function createReceiptFromCommitment(
  db:    AnyDb,
  input: ReceiptFromCommitmentInput,
): Promise<ReceiptFromCommitmentOutcome> {
  const validation = await preflightReceiptFromCommitment(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createReceiptFromCommitmentInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "RECEIPT_INSERT_REJECTED", message)
      : fail(500, "RECEIPT_FROM_COMMITMENT_FAILED", message);
  }
}

const RECEIPT_PREFLIGHT_BOUNDARY = Symbol("receipt-preflight-boundary");
const RECEIPT_PREFLIGHT_DB = { executeQuery: () => { throw RECEIPT_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightReceiptFromCommitment(input: ReceiptFromCommitmentInput): Promise<ReceiptFromCommitmentOutcome | null> {
  try { return await createReceiptFromCommitmentInTransaction(RECEIPT_PREFLIGHT_DB, input); }
  catch (err) { if (err === RECEIPT_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createReceiptFromCommitmentInTransaction(
  db:    AnyDb,
  input: ReceiptFromCommitmentInput,
): Promise<ReceiptFromCommitmentOutcome> {
  // ── Top-level validation ──────────────────────────────────────────────────
  if (input.lineAcceptances.length === 0) {
    return fail(400, "NO_LINE_ACCEPTANCES",
      "At least one line acceptance is required.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  for (const [idx, line] of input.lineAcceptances.entries()) {
    const accepted = Number(line.acceptedQty ?? 0);
    const rejected = Number(line.rejectedQty ?? 0);
    const path     = `lineAcceptances[${idx}]`;
    if (!line.commitmentLineId) {
      fieldErrors[`${path}.commitmentLineId`] = "required";
    } else if (seenLineIds.has(line.commitmentLineId)) {
      fieldErrors[`${path}.commitmentLineId`] = "duplicate";
    } else {
      seenLineIds.add(line.commitmentLineId);
    }
    if (!Number.isFinite(accepted) || accepted <= 0) {
      fieldErrors[`${path}.acceptedQty`] = "must be greater than zero";
    }
    if (!Number.isFinite(rejected) || rejected < 0) {
      fieldErrors[`${path}.rejectedQty`] = "must be non-negative";
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "VALIDATION_FAILED", "One or more line acceptances are invalid.", fieldErrors);
  }

  // ── Single transaction: load, validate against live state, insert ────────
    const result = await (async (trx: AnyDb) => {
      // Load commitment header — must belong to tenant and be transactable.
      const cmt = await loadCommitmentHeader(trx, input.tenantId, input.commitmentId);
      if (!cmt) {
        return fail(404, "COMMITMENT_NOT_FOUND",
          `Commitment ${input.commitmentId} not found for tenant.`);
      }
      const transactableStates = await getLifecycleStatesWithFlag(
        trx, "commitment", "is_transactable_source");
      if (!transactableStates.has(cmt.status)) {
        return fail(422, "COMMITMENT_NOT_TRANSACTABLE",
          `Commitment ${cmt.code} is in status '${cmt.status}'; ` +
          `only ${[...transactableStates].sort().join(" / ")} commitments accept receipts.`);
      }
      if (cmt.commitmentType !== "purchase_order") {
        return fail(422, "COMMITMENT_NOT_PO",
          `Commitment ${cmt.code} is type '${cmt.commitmentType}'; receipts are only valid for purchase_order commitments.`);
      }

      // Resolve receiving warehouse — caller may have supplied, else look up
      // the first active warehouse for the receiving site (or for tenant if
      // the commitment has no site).
      const receivingSiteId = input.receivingSiteId ?? null;
      let receivingWarehouseId: string | undefined = input.receivingWarehouseId;
      if (!receivingWarehouseId) {
        const wh = await sql<{ id: string }>`
          SELECT id FROM master.warehouse
           WHERE tenant_id = ${input.tenantId}::uuid
             AND status    = 'active'
             AND (${receivingSiteId ?? null}::uuid IS NULL OR site_id = ${receivingSiteId ?? null}::uuid)
           ORDER BY created_at ASC
           LIMIT 1
        `.execute(trx);
        receivingWarehouseId = wh.rows[0]?.id;
      }
      if (!receivingWarehouseId) {
        return fail(422, "RECEIVING_LOCATION_REQUIRED",
          "Could not resolve a receiving warehouse. Supply receivingWarehouseId or seed an active warehouse for the tenant.");
      }

      // Load + lock the chosen commitment_line rows. FOR UPDATE so concurrent
      // receipts can't both consume the same remaining_quantity.
      const chosenIds = input.lineAcceptances.map((l) => l.commitmentLineId);
      const lineRows = await sql<CommitmentLineRow>`
        SELECT id, commitment_id, line_no, item_id, item_description,
               uom_code, unit_price, currency_code, procurement_type, line_type,
               (quantity - COALESCE(received_quantity, 0))::float8 AS remaining_quantity,
               asset_class_id, commodity_category_id, business_intent_id,
               classification_decision::text AS classification_decision,
               tax_group_id, withholding_tax_group_id
          FROM document.commitment_line
         WHERE tenant_id     = ${input.tenantId}::uuid
           AND commitment_id = ${input.commitmentId}::uuid
           AND id            = ANY(${chosenIds}::uuid[])
           FOR UPDATE
      `.execute(trx);

      if (lineRows.rows.length !== chosenIds.length) {
        const found = new Set(lineRows.rows.map((r) => r.id));
        const missing = chosenIds.filter((id) => !found.has(id));
        return fail(422, "COMMITMENT_LINES_NOT_FOUND",
          `One or more selected commitment_line ids do not belong to this commitment / tenant.`,
          Object.fromEntries(missing.map((id) => [id, "not found on commitment"])));
      }

      // Per-line remaining-quantity gate.
      const lineByid = new Map(lineRows.rows.map((r) => [r.id, r]));
      const perLineErrors: Record<string, string> = {};
      for (const acc of input.lineAcceptances) {
        const cl = lineByid.get(acc.commitmentLineId);
        if (!cl) continue;
        const accepted = Number(acc.acceptedQty);
        const rejected = Number(acc.rejectedQty ?? 0);
        const received = accepted + rejected;
        if (received > Number(cl.remaining_quantity)) {
          perLineErrors[acc.commitmentLineId] =
            `received (${received}) exceeds remaining (${cl.remaining_quantity}) on line ${cl.line_no}`;
        }
      }
      if (Object.keys(perLineErrors).length > 0) {
        return fail(422, "QUANTITY_OVER_REMAINING",
          "One or more receipt lines exceed the commitment line's remaining quantity.",
          perLineErrors);
      }

      // ── Insert receipt header ────────────────────────────────────────
      const documentDate = input.documentDate ?? new Date().toISOString().slice(0, 10);
      const headerInsert = await sql<{ id: string }>`
        INSERT INTO document.receipt (
          tenant_id, company_code_id,
          commitment_id, delivery_note_id, supplier_id,
          code, name,
          received_date, posting_date,
          currency_code, base_currency_code,
          fiscal_year, period_number,
          status,
          requested_by,
          created_by
        ) VALUES (
          ${input.tenantId}::uuid,
          ${input.companyCodeId ?? cmt.companyCodeId}::uuid,
          ${input.commitmentId}::uuid,
          ${input.deliveryNoteId ?? null}::uuid,
          ${cmt.supplierId}::uuid,
          ${input.receiptNumber}::text,
          ${`Receipt ${input.receiptNumber}`}::text,
          ${documentDate}::date,
          ${documentDate}::date,
          ${cmt.currencyCode}::char(3),
          ${input.baseCurrencyCode}::char(3),
          ${input.fiscalYear}::smallint,
          ${input.periodNumber}::smallint,
          'draft'::text,
          ${input.principalId}::uuid,
          ${input.principalId}::uuid
        )
        RETURNING id
      `.execute(trx);

      const receiptId = headerInsert.rows[0]?.id;
      if (!receiptId) {
        // Should not happen — INSERT ... RETURNING failed silently.
        throw new Error("Receipt header insert did not return id.");
      }

      // ── Insert receipt lines ─────────────────────────────────────────
      let lineNo      = 1;
      let linesWritten = 0;
      for (const acc of input.lineAcceptances) {
        const cl = lineByid.get(acc.commitmentLineId)!;
        const accepted = Number(acc.acceptedQty);
        const rejected = Number(acc.rejectedQty ?? 0);
        const received = accepted + rejected;
        if (!cl.item_id) {
          // commitment_line.item_id is documented NOT NULL but defensive
          // check — receipt_line.item_id is also NOT NULL with no default.
          return fail(422, "COMMITMENT_LINE_MISSING_ITEM",
            `Commitment line ${cl.line_no} has no item_id; cannot create receipt line.`);
        }
        const inserted = await sql<{ id: string }>`
          INSERT INTO document.receipt_line (
            tenant_id, company_code_id, receipt_id, line_no,
            commitment_line_id,
            item_id, item_description, uom_code,
            received_quantity, accepted_quantity, rejected_quantity,
            unit_price, price_unit, currency_code,
            site_id,
            warehouse_id,
            asset_class_id,
            tax_group_id, withholding_tax_group_id,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${input.companyCodeId ?? cmt.companyCodeId}::uuid,
            ${receiptId}::uuid,
            ${lineNo}::smallint,
            ${cl.id}::uuid,
            ${cl.item_id}::uuid,
            ${cl.item_description}::text,
            ${cl.uom_code}::text,
            ${received}::numeric,
            ${accepted}::numeric,
            ${rejected}::numeric,
            ${cl.unit_price}::numeric,
            1::numeric,
            ${cl.currency_code}::char(3),
            ${receivingSiteId}::uuid,
            ${receivingWarehouseId}::uuid,
            ${cl.asset_class_id ?? null}::uuid,
            ${cl.tax_group_id ?? null}::uuid,
            ${cl.withholding_tax_group_id ?? null}::uuid,
            ${input.principalId}::uuid
          )
          RETURNING id::text AS id
        `.execute(trx);
        const receiptLineId = inserted.rows[0]?.id;
        if (!receiptLineId) throw new Error("Receipt line insert did not return id.");
        await inheritProcurementLineAccounting(trx, {
          tenantId: input.tenantId,
          sourceDocType: "commitment_line", sourceDocId: input.commitmentId, sourceLineId: cl.id,
          targetDocType: "receipt_line", targetDocId: receiptId, targetLineId: receiptLineId,
          principalId: input.principalId,
        });
        lineNo       += 1;
        linesWritten += 1;
      }

      const accountingProjection = await refreshDistributionCostBasis(trx, {
        tenantId: input.tenantId, sourceDocType: "receipt_line", sourceDocId: receiptId,
        principalId: input.principalId,
      });
      await sql`
        UPDATE document.receipt SET total_amount = ${accountingProjection.totals.DISTRIBUTABLE_COST},
          updated_at = now(), updated_by = ${input.principalId}::uuid
        WHERE tenant_id = ${input.tenantId}::uuid AND id = ${receiptId}::uuid
      `.execute(trx);

      // Notification fan-out — atomic with the create. Downstream
      // notification workers / SSE feeds subscribe to the `notification`
      // topic and pick up `p2p.receipt.created_from_commitment`. Failing
      // the emit rolls back the create (intentional — a silent receipt
      // landing without notifying buyers is worse than the user retrying).
      await emitOutboxEvent(trx, {
        tenantId:      input.tenantId,
        topic:         "notification",
        eventType:     "p2p.receipt.created_from_commitment",
        entityType:    "receipt",
        entityId:      receiptId,
        aggregateType: "commitment",
        aggregateId:   input.commitmentId,
        actorId:       input.principalId,
        payload: {
          receipt_number:   input.receiptNumber,
          commitment_id:    input.commitmentId,
          lines_written:    linesWritten,
          document_date:    documentDate,
        },
      });

      return ok(receiptId, input.receiptNumber, linesWritten);
    })(db);

    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(receiptId: string, receiptNumber: string, linesWritten: number): ReceiptFromCommitmentOutcome {
  return { ok: true, receiptId, receiptNumber, linesWritten };
}

function fail(
  status:       number,
  error:        string,
  message:      string,
  fieldErrors?: Record<string, string>,
): ReceiptFromCommitmentOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
