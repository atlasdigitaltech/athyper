/**
 * Service Sheet from Commitment — transactional create service.
 *
 * Mirror of receipt-from-commitment.service.ts for the SES (Service Entry
 * Sheet) document, used to certify completed services against an active
 * commitment. Same atomicity, same per-line quantity gate, same upstream
 * commitment status allowlist — only the column set differs:
 *
 *   - service_sheet_line uses `quantity` (single value), no accepted /
 *     rejected split — services either get certified or they do not.
 *   - service_sheet header carries `service_period_from` / `_to` instead
 *     of a receiving site / warehouse. The caller MUST supply both.
 *   - service_description (not item_description) on the line; copied from
 *     commitment_line.item_description by default.
 *
 * The route handler ([line-source.route.ts]) is the single caller and is
 * responsible for resolving service_sheet_number, fiscal_year /
 * period_number, and base_currency_code via the shared helpers in
 * resolve-document-defaults.ts before invoking this service.
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

export interface ServiceSheetFromCommitmentLineInput {
  commitmentLineId:    string;
  quantity:            number;
  serviceDescription?: string;
  milestoneName?:      string;
  completionPct?:      number;
  notes?:              string;
}

export interface ServiceSheetFromCommitmentInput {
  tenantId:           string;
  principalId:        string;
  commitmentId:       string;
  companyCodeId?:     string;
  /** ISO date — defaults to CURRENT_DATE when omitted. */
  documentDate?:      string;
  /** Service period start (ISO date) — required. */
  servicePeriodFrom:  string;
  /** Service period end (ISO date) — required. */
  servicePeriodTo:    string;
  siteId?:            string;
  notes?:             string;
  /** Pre-allocated by the route handler via allocateDocumentNumber. */
  serviceSheetNumber: string;
  /** Pre-resolved by the route handler via resolveFiscalPeriod. */
  fiscalYear:         number;
  periodNumber:       number;
  /** Pre-resolved by the route handler via resolveCompanyAndBaseCurrency. */
  baseCurrencyCode:   string;
  lineEntries:        ServiceSheetFromCommitmentLineInput[];
}

export type ServiceSheetFromCommitmentOutcome =
  | { ok: true;  serviceSheetId: string; serviceSheetNumber: string; linesWritten: number }
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
}

export async function createServiceSheetFromCommitment(
  db:    AnyDb,
  input: ServiceSheetFromCommitmentInput,
): Promise<ServiceSheetFromCommitmentOutcome> {
  const validation = await preflightServiceSheetFromCommitment(input).catch(() => null);
  if (validation) return validation;
  try {
    return await db.transaction().execute((trx) => createServiceSheetFromCommitmentInTransaction(trx, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return err instanceof Error && /violates|constraint/i.test(err.message)
      ? fail(422, "SERVICE_SHEET_INSERT_REJECTED", message)
      : fail(500, "SERVICE_SHEET_FROM_COMMITMENT_FAILED", message);
  }
}

const SERVICE_SHEET_PREFLIGHT_BOUNDARY = Symbol("service-sheet-preflight-boundary");
const SERVICE_SHEET_PREFLIGHT_DB = { executeQuery: () => { throw SERVICE_SHEET_PREFLIGHT_BOUNDARY; } } as unknown as AnyDb;
async function preflightServiceSheetFromCommitment(input: ServiceSheetFromCommitmentInput): Promise<ServiceSheetFromCommitmentOutcome | null> {
  try { return await createServiceSheetFromCommitmentInTransaction(SERVICE_SHEET_PREFLIGHT_DB, input); }
  catch (err) { if (err === SERVICE_SHEET_PREFLIGHT_BOUNDARY) return null; throw err; }
}

/** Performs the conversion on the caller-owned transaction. */
export async function createServiceSheetFromCommitmentInTransaction(
  db:    AnyDb,
  input: ServiceSheetFromCommitmentInput,
): Promise<ServiceSheetFromCommitmentOutcome> {
  // ── Top-level validation ──────────────────────────────────────────────────
  if (input.lineEntries.length === 0) {
    return fail(400, "NO_LINE_ENTRIES", "At least one line entry is required.");
  }
  if (!input.servicePeriodFrom || !input.servicePeriodTo) {
    return fail(400, "SERVICE_PERIOD_REQUIRED",
      "servicePeriodFrom and servicePeriodTo are both required.");
  }
  if (input.servicePeriodFrom > input.servicePeriodTo) {
    return fail(422, "SERVICE_PERIOD_INVERTED",
      "servicePeriodFrom must be on or before servicePeriodTo.");
  }

  const fieldErrors: Record<string, string> = {};
  const seenLineIds = new Set<string>();
  for (const [idx, line] of input.lineEntries.entries()) {
    const qty  = Number(line.quantity ?? 0);
    const path = `lineEntries[${idx}]`;
    if (!line.commitmentLineId) {
      fieldErrors[`${path}.commitmentLineId`] = "required";
    } else if (seenLineIds.has(line.commitmentLineId)) {
      fieldErrors[`${path}.commitmentLineId`] = "duplicate";
    } else {
      seenLineIds.add(line.commitmentLineId);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      fieldErrors[`${path}.quantity`] = "must be greater than zero";
    }
    if (line.completionPct !== undefined) {
      const pct = Number(line.completionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        fieldErrors[`${path}.completionPct`] = "must be between 0 and 100";
      }
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "VALIDATION_FAILED", "One or more line entries are invalid.", fieldErrors);
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
          `only ${[...transactableStates].sort().join(" / ")} commitments accept service sheets.`);
      }
      if (cmt.commitmentType !== "purchase_order") {
        return fail(422, "COMMITMENT_NOT_PO",
          `Commitment ${cmt.code} is type '${cmt.commitmentType}'; service sheets are only valid for purchase_order commitments.`);
      }

      // Load + lock the chosen commitment_line rows. FOR UPDATE so concurrent
      // service sheets can't both consume the same remaining_quantity.
      const chosenIds = input.lineEntries.map((l) => l.commitmentLineId);
      const lineRows = await sql<CommitmentLineRow>`
        SELECT id, commitment_id, line_no, item_id, item_description,
               uom_code, unit_price, currency_code, procurement_type, line_type,
               (quantity - COALESCE(received_quantity, 0))::float8 AS remaining_quantity
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
      for (const entry of input.lineEntries) {
        const cl = lineByid.get(entry.commitmentLineId);
        if (!cl) continue;
        const qty = Number(entry.quantity);
        if (qty > Number(cl.remaining_quantity)) {
          perLineErrors[entry.commitmentLineId] =
            `quantity (${qty}) exceeds remaining (${cl.remaining_quantity}) on line ${cl.line_no}`;
        }
      }
      if (Object.keys(perLineErrors).length > 0) {
        return fail(422, "QUANTITY_OVER_REMAINING",
          "One or more service sheet lines exceed the commitment line's remaining quantity.",
          perLineErrors);
      }

      // ── Insert service sheet header ─────────────────────────────────
      const documentDate = input.documentDate ?? new Date().toISOString().slice(0, 10);
      const headerInsert = await sql<{ id: string }>`
        INSERT INTO document.service_sheet (
          tenant_id, company_code_id,
          commitment_id, supplier_id,
          code, name,
          service_sheet_number,
          service_date, posting_date,
          service_period_from, service_period_to,
          currency_code, base_currency_code,
          fiscal_year, period_number,
          status,
          requested_by,
          created_by
        ) VALUES (
          ${input.tenantId}::uuid,
          ${input.companyCodeId ?? cmt.companyCodeId}::uuid,
          ${input.commitmentId}::uuid,
          ${cmt.supplierId}::uuid,
          ${input.serviceSheetNumber}::text,
          ${`Service Sheet ${input.serviceSheetNumber}`}::text,
          ${input.serviceSheetNumber}::text,
          ${documentDate}::date,
          ${documentDate}::date,
          ${input.servicePeriodFrom}::date,
          ${input.servicePeriodTo}::date,
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

      const sesId = headerInsert.rows[0]?.id;
      if (!sesId) {
        throw new Error("Service sheet header insert did not return id.");
      }

      // ── Insert service sheet lines ─────────────────────────────────
      let lineNo       = 1;
      let linesWritten = 0;
      for (const entry of input.lineEntries) {
        const cl = lineByid.get(entry.commitmentLineId)!;
        const qty = Number(entry.quantity);
        const inserted = await sql<{ id: string }>`
          INSERT INTO document.service_sheet_line (
            tenant_id, company_code_id, service_sheet_id, line_no,
            commitment_line_id,
            item_id, item_description, uom_code,
            quantity, unit_price, price_unit, currency_code,
            service_period_start, service_period_end,
            site_id,
            completion_pct, milestone_name,
            created_by
          ) VALUES (
            ${input.tenantId}::uuid,
            ${input.companyCodeId ?? cmt.companyCodeId}::uuid,
            ${sesId}::uuid,
            ${lineNo}::smallint,
            ${cl.id}::uuid,
            ${cl.item_id}::uuid,
            ${entry.serviceDescription ?? cl.item_description}::text,
            ${cl.uom_code}::text,
            ${qty}::numeric,
            ${cl.unit_price}::numeric,
            1::numeric,
            ${cl.currency_code}::char(3),
            ${input.servicePeriodFrom}::date,
            ${input.servicePeriodTo}::date,
            ${input.siteId ?? null}::uuid,
            ${entry.completionPct ?? null}::numeric,
            ${entry.milestoneName ?? null}::text,
            ${input.principalId}::uuid
          )
          RETURNING id::text AS id
        `.execute(trx);
        const serviceSheetLineId = inserted.rows[0]?.id;
        if (!serviceSheetLineId) throw new Error("Service sheet line insert did not return id.");
        await inheritProcurementLineAccounting(trx, {
          tenantId: input.tenantId,
          sourceDocType: "commitment_line", sourceDocId: input.commitmentId, sourceLineId: cl.id,
          targetDocType: "service_sheet_line", targetDocId: sesId, targetLineId: serviceSheetLineId,
          principalId: input.principalId,
        });
        lineNo       += 1;
        linesWritten += 1;
      }
      const accountingProjection = await refreshDistributionCostBasis(trx, {
        tenantId: input.tenantId, sourceDocType: "service_sheet_line", sourceDocId: sesId,
        principalId: input.principalId,
      });
      await sql`
        UPDATE document.service_sheet SET total_amount = ${accountingProjection.totals.DISTRIBUTABLE_COST},
          updated_at = now(), updated_by = ${input.principalId}::uuid
        WHERE tenant_id = ${input.tenantId}::uuid AND id = ${sesId}::uuid
      `.execute(trx);

      await emitOutboxEvent(trx, {
        tenantId:      input.tenantId,
        topic:         "notification",
        eventType:     "p2p.service_sheet.created_from_commitment",
        entityType:    "service_sheet",
        entityId:      sesId,
        aggregateType: "commitment",
        aggregateId:   input.commitmentId,
        actorId:       input.principalId,
        payload: {
          service_sheet_number: input.serviceSheetNumber,
          commitment_id:        input.commitmentId,
          lines_written:        linesWritten,
          document_date:        documentDate,
          service_period_from:  input.servicePeriodFrom,
          service_period_to:    input.servicePeriodTo,
        },
      });

      return ok(sesId, input.serviceSheetNumber, linesWritten);
    })(db);

    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(serviceSheetId: string, serviceSheetNumber: string, linesWritten: number): ServiceSheetFromCommitmentOutcome {
  return { ok: true, serviceSheetId, serviceSheetNumber, linesWritten };
}

function fail(
  status:       number,
  error:        string,
  message:      string,
  fieldErrors?: Record<string, string>,
): ServiceSheetFromCommitmentOutcome {
  return { ok: false, status, error, message, ...(fieldErrors ? { fieldErrors } : {}) };
}
