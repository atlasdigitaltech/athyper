/**
 * invoice-from-receipt — integration test against a live PostgreSQL DB.
 *
 * Covers the end-to-end create path that POST /api/p2p/invoices/from-receipt
 * delegates to: PI header + PIL rows written atomically inside a single TX
 * with FOR UPDATE on receipt_lines and the
 * `accepted - SUM(already_invoiced)` remaining-to-invoice gate.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run invoice-from-receipt.integration
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInvoiceFromReceipt } from "../p2p/purchase_invoice/invoice-from-receipt.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:            string;
  principalId:         string;
  legalEntityId:       string;
  companyCodeId:       string;
  siteId:              string;
  warehouseId:         string;
  businessPartnerId:   string;
  supplierId:          string;
  commodityCategoryId: string;
  itemId:              string;
  commitmentId:        string;
  commitmentProcurementId: string;
  cl1Id:               string;
  /** posted receipt linked to commitment + cl1. */
  postedReceiptId:     string;
  postedReceiptLineId: string;
  /** draft receipt — fails the RECEIPT_NOT_POSTED gate. */
  draftReceiptId:      string;
  draftReceiptLineId:  string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

maybeDescribe("createInvoiceFromReceipt — integration (live DB)", () => {
  let s: Scenario;

  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool =
      (pgModule.default as { Pool?: unknown } | undefined)?.Pool ??
      (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg package required for integration tests");

    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString:       LIVE_DATABASE_URL,
      max:                    3,
      idleTimeoutMillis:      5_000,
      connectionTimeoutMillis: 10_000,
    });

    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    await sql`select 1`.execute(db);
    s = await seedScenario();
  });

  afterAll(async () => {
    if (s) await cleanupScenario(s);
    await db?.destroy();
  });

  it("happy path: PI + PIL written atomically; receipt_line back-reference set", async () => {
    const outcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.postedReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-001",
      supplierInvoiceDate:   "2026-06-20",
      documentDate:          "2026-06-20",
      invoiceNumber:         `PI-INT-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.postedReceiptLineId, quantity: 2 }],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.linesWritten).toBe(1);

    const hdr = await sql<{ id: string; status: string; commitment_id: string; supplier_id: string; supplier_invoice_number: string }>`
      SELECT id, status, commitment_id, supplier_id, supplier_invoice_number
        FROM document.purchase_invoice
       WHERE id = ${outcome.invoiceId}::uuid AND tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
    expect(hdr.rows[0]?.status).toBe("draft");
    expect(hdr.rows[0]?.commitment_id).toBe(s.commitmentId);
    expect(hdr.rows[0]?.supplier_id).toBe(s.supplierId);
    expect(hdr.rows[0]?.supplier_invoice_number).toBe("SUP-INT-001");

    const lines = await sql<{ line_no: number; receipt_line_id: string; commitment_line_id: string; quantity: string; unit_price: string }>`
      SELECT line_no, receipt_line_id, commitment_line_id, quantity::text, unit_price::text
        FROM document.purchase_invoice_line
       WHERE purchase_invoice_id = ${outcome.invoiceId}::uuid AND tenant_id = ${s.tenantId}::uuid
       ORDER BY line_no
    `.execute(mustDb());
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0]?.receipt_line_id).toBe(s.postedReceiptLineId);
    expect(lines.rows[0]?.commitment_line_id).toBe(s.cl1Id);
    expect(Number(lines.rows[0]?.quantity)).toBe(2);
  });

  it("second invoice against the same receipt_line subtracts the first invoice's quantity", async () => {
    // First invoice consumed 2 of 5. Second invoice for 4 should be rejected
    // (only 3 remaining). One for 3 should succeed.
    const overOutcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.postedReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-002",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-OVR-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.postedReceiptLineId, quantity: 4 }],
    });
    expect(overOutcome.ok).toBe(false);
    if (overOutcome.ok) return;
    expect(overOutcome.status).toBe(422);
    expect(overOutcome.error).toBe("QUANTITY_OVER_REMAINING");
    expect(overOutcome.fieldErrors?.[s.postedReceiptLineId]).toMatch(/remaining \(3\)/);

    const okOutcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.postedReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-002B",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-OK2-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.postedReceiptLineId, quantity: 3 }],
    });
    expect(okOutcome.ok).toBe(true);
    if (!okOutcome.ok) return;
    expect(okOutcome.linesWritten).toBe(1);

    // Third attempt — receipt_line is fully invoiced now.
    const finalOver = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.postedReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-003",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-OVR2-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.postedReceiptLineId, quantity: 1 }],
    });
    expect(finalOver.ok).toBe(false);
    if (finalOver.ok) return;
    expect(finalOver.error).toBe("QUANTITY_OVER_REMAINING");
    expect(finalOver.fieldErrors?.[s.postedReceiptLineId]).toMatch(/remaining \(0\)/);
  });

  it("draft receipt → 422 RECEIPT_NOT_POSTED", async () => {
    const outcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.draftReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-DRAFT",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-DR-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.draftReceiptLineId, quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("RECEIPT_NOT_POSTED");
  });

  it("random receiptId → 404 RECEIPT_NOT_FOUND", async () => {
    const outcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             randomUUID(),
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-NF",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-NF-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: s.postedReceiptLineId, quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe("RECEIPT_NOT_FOUND");
  });

  it("receipt_line not under chosen receipt → 422 RECEIPT_LINES_NOT_FOUND", async () => {
    const outcome = await createInvoiceFromReceipt(mustDb(), {
      tenantId:              s.tenantId,
      principalId:           s.principalId,
      receiptId:             s.postedReceiptId,
      companyCodeId:         s.companyCodeId,
      supplierInvoiceNumber: "SUP-INT-XL",
      supplierInvoiceDate:   "2026-06-20",
      invoiceNumber:         `PI-INT-XL-${Date.now()}`,
      fiscalYear:            2026,
      periodNumber:          6,
      baseCurrencyCode:      "USD",
      lineSelections:        [{ receiptLineId: randomUUID(), quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("RECEIPT_LINES_NOT_FOUND");
  });
});

// ── Seed / cleanup ─────────────────────────────────────────────────────────

async function seedScenario(): Promise<Scenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const s: Scenario = {
    tenantId:                randomUUID(),
    principalId:             randomUUID(),
    legalEntityId:           randomUUID(),
    companyCodeId:           randomUUID(),
    siteId:                  randomUUID(),
    warehouseId:             randomUUID(),
    businessPartnerId:       randomUUID(),
    supplierId:              randomUUID(),
    commodityCategoryId:     randomUUID(),
    itemId:                  randomUUID(),
    commitmentId:            randomUUID(),
    commitmentProcurementId: randomUUID(),
    cl1Id:                   randomUUID(),
    postedReceiptId:         randomUUID(),
    postedReceiptLineId:     randomUUID(),
    draftReceiptId:          randomUUID(),
    draftReceiptLineId:      randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by) VALUES (${s.tenantId}::uuid, ${"invrcp" + suffix}, ${"InvRcp Int " + suffix}, ${"InvRcp Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by) VALUES (${s.principalId}::uuid, ${s.tenantId}::uuid, ${"invrcp_actor_" + suffix}, 'InvRcp Test Actor', 'user', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by) VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'InvRcp LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by) VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'InvRcp CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.site (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by) VALUES (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'InvRcp Site', ${s.companyCodeId}::uuid, 'plant', 'US', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.warehouse (id, tenant_id, code, name, site_id, status, created_by) VALUES (${s.warehouseId}::uuid, ${s.tenantId}::uuid, ${"WH" + suffix}, 'InvRcp WH', ${s.siteId}::uuid, 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'InvRcp BP', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid, ${"SUP" + suffix}, 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.commodity_category (id, tenant_id, code, name, root_category_id, created_by) VALUES (${s.commodityCategoryId}::uuid, ${s.tenantId}::uuid, ${"CAT" + suffix}, 'InvRcp Cat', ${s.commodityCategoryId}::uuid, ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.item (id, tenant_id, code, name, company_code_id, commodity_category_id, valuation_method, uom_code, status, created_by) VALUES (${s.itemId}::uuid, ${s.tenantId}::uuid, ${"ITM" + suffix}, 'InvRcp Item', ${s.companyCodeId}::uuid, ${s.commodityCategoryId}::uuid, 'weighted_avg', 'EA', 'active', ${s.principalId}::uuid)`.execute(mustDb());

  // Commitment 'active'
  await sql`
    INSERT INTO document.commitment (
      id, tenant_id, company_code_id, commitment_number, commitment_type,
      document_date, effective_date, currency_code, base_currency_code, total_amount,
      fiscal_year, period_number, site_id, status, created_by
    ) VALUES (
      ${s.commitmentId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PO-INVRCP-" + suffix}, 'purchase_order',
      '2026-06-01', '2026-06-01', 'USD', 'USD', 250,
      2026, 6, ${s.siteId}::uuid, 'active', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`INSERT INTO document.commitment_procurement (id, tenant_id, commitment_id, supplier_id, created_by) VALUES (${s.commitmentProcurementId}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid, ${s.supplierId}::uuid, ${s.principalId}::uuid)`.execute(mustDb());

  await sql`
    INSERT INTO document.commitment_line (
      id, tenant_id, commitment_id, line_no,
      item_id, item_code, item_description, uom_code,
      quantity, unit_price, currency_code, created_by
    ) VALUES (
      ${s.cl1Id}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid, 1,
      ${s.itemId}::uuid, ${"ITM" + suffix}, 'Line 1', 'EA',
      10, 50, 'USD', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Posted receipt: accepted_quantity = 5 (so we can run 2 + 3 invoice splits)
  await sql`
    INSERT INTO document.receipt (
      id, tenant_id, company_code_id, commitment_id, supplier_id,
      receipt_number, document_date, posting_date,
      receiving_site_id, receiving_warehouse_id,
      currency_code, base_currency_code, fiscal_year, period_number,
      status, created_by
    ) VALUES (
      ${s.postedReceiptId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${s.commitmentId}::uuid, ${s.supplierId}::uuid,
      ${"RCP-INVRCP-" + suffix}, '2026-06-10', '2026-06-10',
      ${s.siteId}::uuid, ${s.warehouseId}::uuid,
      'USD', 'USD', 2026, 6,
      'posted', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    INSERT INTO document.receipt_line (
      id, tenant_id, receipt_id, line_no, commitment_line_id,
      item_id, item_description, uom_code,
      received_quantity, accepted_quantity, rejected_quantity,
      unit_price, currency_code, warehouse_id, created_by
    ) VALUES (
      ${s.postedReceiptLineId}::uuid, ${s.tenantId}::uuid, ${s.postedReceiptId}::uuid, 1,
      ${s.cl1Id}::uuid,
      ${s.itemId}::uuid, 'Line 1', 'EA',
      5, 5, 0,
      50, 'USD', ${s.warehouseId}::uuid, ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Draft receipt — for the RECEIPT_NOT_POSTED negative case.
  await sql`
    INSERT INTO document.receipt (
      id, tenant_id, company_code_id, commitment_id, supplier_id,
      receipt_number, document_date, posting_date,
      receiving_site_id, receiving_warehouse_id,
      currency_code, base_currency_code, fiscal_year, period_number,
      status, created_by
    ) VALUES (
      ${s.draftReceiptId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${s.commitmentId}::uuid, ${s.supplierId}::uuid,
      ${"RCP-DRAFT-" + suffix}, '2026-06-10', '2026-06-10',
      ${s.siteId}::uuid, ${s.warehouseId}::uuid,
      'USD', 'USD', 2026, 6,
      'draft', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    INSERT INTO document.receipt_line (
      id, tenant_id, receipt_id, line_no, commitment_line_id,
      item_id, item_description, uom_code,
      received_quantity, accepted_quantity, rejected_quantity,
      unit_price, currency_code, warehouse_id, created_by
    ) VALUES (
      ${s.draftReceiptLineId}::uuid, ${s.tenantId}::uuid, ${s.draftReceiptId}::uuid, 1,
      ${s.cl1Id}::uuid,
      ${s.itemId}::uuid, 'Line 1 draft', 'EA',
      3, 3, 0,
      50, 'USD', ${s.warehouseId}::uuid, ${s.principalId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  try {
    await sql`DELETE FROM document.purchase_invoice_line WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_invoice      WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.receipt_line          WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.receipt               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment_line       WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment_procurement WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.item                    WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.commodity_category      WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.warehouse               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.site                    WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.supplier                WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.business_partner        WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.company_code            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.legal_entity            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.principal               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.tenant                  WHERE id        = ${s.tenantId}::uuid`.execute(mustDb());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("invoice-from-receipt integration cleanup error:", err);
  }
}
