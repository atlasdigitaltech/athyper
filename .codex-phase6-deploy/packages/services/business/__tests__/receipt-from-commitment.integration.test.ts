/**
 * receipt-from-commitment — integration test against a live PostgreSQL DB.
 *
 * Covers the end-to-end create path that the POST /api/p2p/receipts/from-
 * commitment route delegates to: header + lines written atomically inside
 * a single transaction with the FOR UPDATE quantity-remaining gate.
 *
 * The HTTP route itself is a thin wrapper (auth + tenant resolve + helper
 * calls + this service call); end-to-end coverage of the substantive
 * write logic lives here. Auth/JWT-layer coverage is a separate concern
 * tested under apps/neon.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run receipt-from-commitment.integration
 *
 * Tenant graph is created with random UUIDs and torn down in `finally`.
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReceiptFromCommitment } from "../p2p/receipt/receipt-from-commitment.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:        string;
  principalId:     string;
  legalEntityId:   string;
  companyCodeId:   string;
  fiscalPeriodId:  string;
  businessPartnerId: string;
  supplierId:      string;
  siteId:          string;
  warehouseId:     string;
  itemId:          string;
  commitmentId:    string;
  commitmentProcurementId: string;
  commodityCategoryId: string;
  /** Two lines on the same commitment for partial / over-receipt tests. */
  cl1Id:           string;
  cl2Id:           string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

maybeDescribe("createReceiptFromCommitment — integration (live DB)", () => {
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

  it("happy path: writes receipt header + line atomically with correct fields", async () => {
    const outcome = await createReceiptFromCommitment(mustDb(), {
      tenantId:             s.tenantId,
      principalId:          s.principalId,
      commitmentId:         s.commitmentId,
      companyCodeId:        s.companyCodeId,
      receivingSiteId:      s.siteId,
      receivingWarehouseId: s.warehouseId,
      receiptNumber:        `RCP-INT-${Date.now()}`,
      fiscalYear:           2026,
      periodNumber:         6,
      baseCurrencyCode:     "USD",
      documentDate:         "2026-06-15",
      lineAcceptances: [
        { commitmentLineId: s.cl1Id, acceptedQty: 3, rejectedQty: 0 },
      ],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.linesWritten).toBe(1);
    expect(outcome.receiptId).toBeTruthy();

    // Header
    const hdr = await sql<{ id: string; status: string; commitment_id: string; supplier_id: string; receipt_number: string; total_amount: string }>`
      SELECT id, status, commitment_id, supplier_id, receipt_number, total_amount::text
        FROM document.receipt
       WHERE id = ${outcome.receiptId}::uuid AND tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
    expect(hdr.rows[0]).toBeDefined();
    expect(hdr.rows[0]?.status).toBe("draft");
    expect(hdr.rows[0]?.commitment_id).toBe(s.commitmentId);
    expect(hdr.rows[0]?.supplier_id).toBe(s.supplierId);
    expect(hdr.rows[0]?.receipt_number).toMatch(/^RCP-INT-/);

    // Line
    const lines = await sql<{ line_no: number; commitment_line_id: string; received_quantity: string; accepted_quantity: string; rejected_quantity: string; unit_price: string }>`
      SELECT line_no, commitment_line_id, received_quantity::text, accepted_quantity::text,
             rejected_quantity::text, unit_price::text
        FROM document.receipt_line
       WHERE receipt_id = ${outcome.receiptId}::uuid AND tenant_id = ${s.tenantId}::uuid
       ORDER BY line_no
    `.execute(mustDb());
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0]?.commitment_line_id).toBe(s.cl1Id);
    expect(Number(lines.rows[0]?.accepted_quantity)).toBe(3);
    expect(Number(lines.rows[0]?.rejected_quantity)).toBe(0);
    expect(Number(lines.rows[0]?.received_quantity)).toBe(3);
    expect(Number(lines.rows[0]?.unit_price)).toBe(50);   // from seed
  });

  it("over-receipt: (accepted + rejected) > remaining_quantity → 422 QUANTITY_OVER_REMAINING", async () => {
    // cl2 was seeded with quantity=5; demand more than that
    const outcome = await createReceiptFromCommitment(mustDb(), {
      tenantId:             s.tenantId,
      principalId:          s.principalId,
      commitmentId:         s.commitmentId,
      companyCodeId:        s.companyCodeId,
      receivingSiteId:      s.siteId,
      receivingWarehouseId: s.warehouseId,
      receiptNumber:        `RCP-INT-OVR-${Date.now()}`,
      fiscalYear:           2026,
      periodNumber:         6,
      baseCurrencyCode:     "USD",
      documentDate:         "2026-06-15",
      lineAcceptances: [
        { commitmentLineId: s.cl2Id, acceptedQty: 99 },
      ],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("QUANTITY_OVER_REMAINING");
    expect(outcome.fieldErrors?.[s.cl2Id]).toMatch(/exceeds remaining/i);
  });

  it("commitment not found: random commitmentId → 404 COMMITMENT_NOT_FOUND", async () => {
    const outcome = await createReceiptFromCommitment(mustDb(), {
      tenantId:             s.tenantId,
      principalId:          s.principalId,
      commitmentId:         randomUUID(),
      companyCodeId:        s.companyCodeId,
      receivingSiteId:      s.siteId,
      receivingWarehouseId: s.warehouseId,
      receiptNumber:        `RCP-INT-NF-${Date.now()}`,
      fiscalYear:           2026,
      periodNumber:         6,
      baseCurrencyCode:     "USD",
      lineAcceptances: [{ commitmentLineId: s.cl1Id, acceptedQty: 1 }],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe("COMMITMENT_NOT_FOUND");
  });

  it("commitment_line not under chosen commitment → 422 COMMITMENT_LINES_NOT_FOUND", async () => {
    const outcome = await createReceiptFromCommitment(mustDb(), {
      tenantId:             s.tenantId,
      principalId:          s.principalId,
      commitmentId:         s.commitmentId,
      companyCodeId:        s.companyCodeId,
      receivingSiteId:      s.siteId,
      receivingWarehouseId: s.warehouseId,
      receiptNumber:        `RCP-INT-XL-${Date.now()}`,
      fiscalYear:           2026,
      periodNumber:         6,
      baseCurrencyCode:     "USD",
      lineAcceptances: [{ commitmentLineId: randomUUID(), acceptedQty: 1 }],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("COMMITMENT_LINES_NOT_FOUND");
  });
});

// ── Seed / cleanup ──────────────────────────────────────────────────────────

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

async function seedScenario(): Promise<Scenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const s: Scenario = {
    tenantId:                randomUUID(),
    principalId:             randomUUID(),
    legalEntityId:           randomUUID(),
    companyCodeId:           randomUUID(),
    fiscalPeriodId:          randomUUID(),
    businessPartnerId:       randomUUID(),
    supplierId:              randomUUID(),
    siteId:                  randomUUID(),
    warehouseId:             randomUUID(),
    itemId:                  randomUUID(),
    commitmentId:            randomUUID(),
    commitmentProcurementId: randomUUID(),
    commodityCategoryId:     randomUUID(),
    cl1Id:                   randomUUID(),
    cl2Id:                   randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`
    INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by)
    VALUES (${s.tenantId}::uuid, ${"rcpt" + suffix}, ${"Receipt Int " + suffix}, ${"Receipt Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by)
    VALUES (${s.principalId}::uuid, ${s.tenantId}::uuid, ${"rcpt_actor_" + suffix}, 'Rcpt Test Actor', 'user', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by)
    VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'Rcpt LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by)
    VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'Rcpt CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.fiscal_period (id, tenant_id, company_code_id, fiscal_year, period_number, code, name, start_date, end_date, status, created_by)
    VALUES (${s.fiscalPeriodId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid, 2026, 6, ${"FY26P6_" + suffix}, 'June 2026', '2026-06-01', '2026-06-30', 'open', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by)
    VALUES (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'Rcpt BP', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by)
    VALUES (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid, ${"SUP" + suffix}, 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.site (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by)
    VALUES (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'Rcpt Site', ${s.companyCodeId}::uuid, 'plant', 'US', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.warehouse (id, tenant_id, code, name, site_id, status, created_by)
    VALUES (${s.warehouseId}::uuid, ${s.tenantId}::uuid, ${"WH" + suffix}, 'Rcpt WH', ${s.siteId}::uuid, 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  // Commodity category is a self-referencing tree — root rows reference themselves.
  await sql`
    INSERT INTO master.commodity_category (id, tenant_id, code, name, root_category_id, created_by)
    VALUES (${s.commodityCategoryId}::uuid, ${s.tenantId}::uuid, ${"CAT" + suffix}, 'Rcpt Category', ${s.commodityCategoryId}::uuid, ${s.principalId}::uuid)
  `.execute(mustDb());

  // Item requires either product_id or commodity_category_id (im_classification_chk)
  // and a valid valuation_method. Use 'weighted_avg' (avoids the standard_cost
  // CHECK requiring a standard_cost value).
  await sql`
    INSERT INTO master.item (
      id, tenant_id, code, name, company_code_id,
      commodity_category_id, valuation_method, uom_code, status, created_by
    ) VALUES (
      ${s.itemId}::uuid, ${s.tenantId}::uuid, ${"ITM" + suffix}, 'Rcpt Item', ${s.companyCodeId}::uuid,
      ${s.commodityCategoryId}::uuid, 'weighted_avg', 'EA', 'active', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Commitment in 'active' status — eligible for receipts.
  await sql`
    INSERT INTO document.commitment (
      id, tenant_id, company_code_id, commitment_number, commitment_type,
      document_date, effective_date,
      currency_code, base_currency_code, total_amount,
      fiscal_year, period_number,
      site_id, status,
      created_by
    ) VALUES (
      ${s.commitmentId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PO-INT-" + suffix}, 'purchase_order',
      '2026-06-01', '2026-06-01',
      'USD', 'USD', 750,
      2026, 6,
      ${s.siteId}::uuid, 'active',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    INSERT INTO document.commitment_procurement (
      id, tenant_id, commitment_id, supplier_id, created_by
    ) VALUES (
      ${s.commitmentProcurementId}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid,
      ${s.supplierId}::uuid, ${s.principalId}::uuid
    )
  `.execute(mustDb());

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

  await sql`
    INSERT INTO document.commitment_line (
      id, tenant_id, commitment_id, line_no,
      item_id, item_code, item_description, uom_code,
      quantity, unit_price, currency_code, created_by
    ) VALUES (
      ${s.cl2Id}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid, 2,
      ${s.itemId}::uuid, ${"ITM" + suffix}, 'Line 2', 'EA',
      5, 50, 'USD', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  // Order: leaves → roots (PG handles cascade where defined, but be explicit
  // for FKs we don't want to depend on cascade for).
  try {
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
    await sql`DELETE FROM master.fiscal_period           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.company_code            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.legal_entity            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.principal               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.tenant                  WHERE id        = ${s.tenantId}::uuid`.execute(mustDb());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("receipt-from-commitment integration cleanup error:", err);
  }
}
