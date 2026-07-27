/**
 * P2P terminal-state mutation guards (Plan 5) — integration tests.
 *
 * Verifies that:
 *   - Direct field UPDATE on a row in a terminal status raises an exception
 *     with SQLSTATE 'P0001' and the entity-specific message shape.
 *   - Status-only transitions (lifecycle hand-off) are NOT blocked — the
 *     IF OLD.status IS DISTINCT FROM NEW.status short-circuit inside each
 *     guard function continues to allow the action dispatcher to advance
 *     state from a terminal value (e.g. reverse, reopen).
 *   - Rows in non-terminal statuses are unaffected (the WHEN clause on each
 *     trigger filters early so the function never fires).
 *
 * Covers commitment, receipt, service_sheet. The PR/POC/DN guards share
 * the same shape and are exercised by the same fixture pattern — adding
 * coverage for them is incremental.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run p2p-immutability-guards
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:        string;
  principalId:     string;
  legalEntityId:   string;
  companyCodeId:   string;
  siteId:          string;
  warehouseId:     string;
  businessPartnerId: string;
  supplierId:      string;
  commodityCategoryId: string;
  itemId:          string;
  /** Commitment used as the FK target for the receipt+SES fixtures. */
  commitmentId:    string;
  commitmentProcurementId: string;
  /** A receipt that we'll advance into a terminal state mid-test. */
  receiptId:       string;
  /** A service_sheet that we'll advance into a terminal state mid-test. */
  serviceSheetId:  string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

maybeDescribe("P2P immutability guards — integration (live DB)", () => {
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

  // ── receipt ───────────────────────────────────────────────────────────────

  it("receipt: notes UPDATE on a 'posted' row raises P0001", async () => {
    // Advance to posted first — status transition is allowed.
    await sql`UPDATE document.receipt SET status='posted' WHERE id = ${s.receiptId}::uuid`.execute(mustDb());

    await expect(sql`
      UPDATE document.receipt
         SET notes = 'should be blocked'
       WHERE id = ${s.receiptId}::uuid
    `.execute(mustDb())).rejects.toMatchObject({
      code:    "P0001",
      message: expect.stringMatching(/receipt .* is in terminal status 'posted'/),
    });
  });

  it("receipt: status-only transition from terminal is still allowed (reverse / reopen path)", async () => {
    // Row is in 'posted' from the previous test. Verify we can still move it
    // to 'reversed' — the action dispatcher relies on this.
    await sql`UPDATE document.receipt SET status='reversed' WHERE id = ${s.receiptId}::uuid`.execute(mustDb());
    const row = await sql<{ status: string }>`SELECT status FROM document.receipt WHERE id = ${s.receiptId}::uuid`.execute(mustDb());
    expect(row.rows[0]?.status).toBe("reversed");
  });

  it("receipt: notes UPDATE in 'draft' is unaffected by the guard", async () => {
    // Roll back to draft so the WHEN clause excludes the row from the guard.
    await sql`UPDATE document.receipt SET status='draft' WHERE id = ${s.receiptId}::uuid`.execute(mustDb());
    await sql`UPDATE document.receipt SET notes='now editable' WHERE id = ${s.receiptId}::uuid`.execute(mustDb());
    const row = await sql<{ notes: string | null }>`SELECT notes FROM document.receipt WHERE id = ${s.receiptId}::uuid`.execute(mustDb());
    expect(row.rows[0]?.notes).toBe("now editable");
  });

  // ── service_sheet ────────────────────────────────────────────────────────

  it("service_sheet: notes UPDATE on a 'posted' row raises P0001", async () => {
    await sql`UPDATE document.service_sheet SET status='posted' WHERE id = ${s.serviceSheetId}::uuid`.execute(mustDb());

    await expect(sql`
      UPDATE document.service_sheet
         SET notes = 'should be blocked'
       WHERE id = ${s.serviceSheetId}::uuid
    `.execute(mustDb())).rejects.toMatchObject({
      code:    "P0001",
      message: expect.stringMatching(/service_sheet .* is in terminal status 'posted'/),
    });
  });

  // ── commitment ───────────────────────────────────────────────────────────

  it("commitment: description UPDATE on a 'closed' row raises P0001", async () => {
    await sql`UPDATE document.commitment SET status='closed' WHERE id = ${s.commitmentId}::uuid`.execute(mustDb());

    await expect(sql`
      UPDATE document.commitment
         SET description = 'should be blocked'
       WHERE id = ${s.commitmentId}::uuid
    `.execute(mustDb())).rejects.toMatchObject({
      code:    "P0001",
      message: expect.stringMatching(/commitment .* is in terminal status 'closed'/),
    });
  });

  // ── terminal_status flag is also recognised ─────────────────────────────

  it("commitment: terminal_status=CANCELED also blocks field UPDATEs", async () => {
    // Reset status to active first so we exercise the terminal_status branch
    // without overlap with the status-based check.
    await sql`UPDATE document.commitment SET status='active' WHERE id = ${s.commitmentId}::uuid`.execute(mustDb());
    // Set terminal_status via a status-only UPDATE (the guard allows status
    // changes); then attempt a non-status edit and assert it's blocked.
    await sql`UPDATE document.commitment SET terminal_status='CANCELED' WHERE id = ${s.commitmentId}::uuid`.execute(mustDb());

    await expect(sql`
      UPDATE document.commitment
         SET description = 'still blocked via terminal_status'
       WHERE id = ${s.commitmentId}::uuid
    `.execute(mustDb())).rejects.toMatchObject({
      code:    "P0001",
      message: expect.stringMatching(/terminal status 'CANCELED'/),
    });
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
    receiptId:               randomUUID(),
    serviceSheetId:          randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`
    INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by)
    VALUES (${s.tenantId}::uuid, ${"immut" + suffix}, ${"Immut Int " + suffix}, ${"Immut Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by)
    VALUES (${s.principalId}::uuid, ${s.tenantId}::uuid, ${"immut_actor_" + suffix}, 'Immut Test Actor', 'user', 'active', ${SYSTEM_ACTOR}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by)
    VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'Immut LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by)
    VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'Immut CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.site (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by)
    VALUES (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'Immut Site', ${s.companyCodeId}::uuid, 'plant', 'US', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.warehouse (id, tenant_id, code, name, site_id, status, created_by)
    VALUES (${s.warehouseId}::uuid, ${s.tenantId}::uuid, ${"WH" + suffix}, 'Immut WH', ${s.siteId}::uuid, 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by)
    VALUES (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'Immut BP', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by)
    VALUES (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid, ${"SUP" + suffix}, 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.commodity_category (id, tenant_id, code, name, root_category_id, created_by)
    VALUES (${s.commodityCategoryId}::uuid, ${s.tenantId}::uuid, ${"CAT" + suffix}, 'Immut Cat', ${s.commodityCategoryId}::uuid, ${s.principalId}::uuid)
  `.execute(mustDb());

  await sql`
    INSERT INTO master.item (id, tenant_id, code, name, company_code_id, commodity_category_id, valuation_method, uom_code, status, created_by)
    VALUES (${s.itemId}::uuid, ${s.tenantId}::uuid, ${"ITM" + suffix}, 'Immut Item', ${s.companyCodeId}::uuid, ${s.commodityCategoryId}::uuid, 'weighted_avg', 'EA', 'active', ${s.principalId}::uuid)
  `.execute(mustDb());

  // Commitment in 'active' status — eligible for receipts + service sheets.
  await sql`
    INSERT INTO document.commitment (
      id, tenant_id, company_code_id, commitment_number, commitment_type,
      document_date, effective_date,
      currency_code, base_currency_code, total_amount,
      fiscal_year, period_number,
      site_id, status, description,
      created_by
    ) VALUES (
      ${s.commitmentId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PO-IMM-" + suffix}, 'purchase_order',
      '2026-06-01', '2026-06-01',
      'USD', 'USD', 500,
      2026, 6,
      ${s.siteId}::uuid, 'active', 'editable description',
      ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    INSERT INTO document.commitment_procurement (id, tenant_id, commitment_id, supplier_id, created_by)
    VALUES (${s.commitmentProcurementId}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid, ${s.supplierId}::uuid, ${s.principalId}::uuid)
  `.execute(mustDb());

  // Receipt and service_sheet headers — we'll flip their status mid-test.
  await sql`
    INSERT INTO document.receipt (
      id, tenant_id, company_code_id, commitment_id, supplier_id,
      receipt_number, document_date, posting_date,
      receiving_site_id, receiving_warehouse_id,
      currency_code, base_currency_code, fiscal_year, period_number,
      status, created_by
    ) VALUES (
      ${s.receiptId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${s.commitmentId}::uuid, ${s.supplierId}::uuid,
      ${"RCP-IMM-" + suffix}, '2026-06-15', '2026-06-15',
      ${s.siteId}::uuid, ${s.warehouseId}::uuid,
      'USD', 'USD', 2026, 6,
      'draft', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  await sql`
    INSERT INTO document.service_sheet (
      id, tenant_id, company_code_id, commitment_id, supplier_id,
      service_sheet_number, document_date, posting_date,
      service_period_from, service_period_to,
      site_id,
      currency_code, base_currency_code, fiscal_year, period_number,
      status, created_by
    ) VALUES (
      ${s.serviceSheetId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${s.commitmentId}::uuid, ${s.supplierId}::uuid,
      ${"SES-IMM-" + suffix}, '2026-06-15', '2026-06-15',
      '2026-06-01', '2026-06-30',
      ${s.siteId}::uuid,
      'USD', 'USD', 2026, 6,
      'draft', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  try {
    // Clear terminal flags so cleanup UPDATEs aren't themselves blocked by the guard.
    await sql`UPDATE document.commitment    SET terminal_status=NULL WHERE tenant_id=${s.tenantId}::uuid`.execute(mustDb());
    await sql`UPDATE document.receipt       SET terminal_status=NULL WHERE tenant_id=${s.tenantId}::uuid`.execute(mustDb());
    await sql`UPDATE document.service_sheet SET terminal_status=NULL WHERE tenant_id=${s.tenantId}::uuid`.execute(mustDb());

    await sql`DELETE FROM document.service_sheet         WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.receipt               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
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
    console.warn("p2p-immutability-guards integration cleanup error:", err);
  }
}
