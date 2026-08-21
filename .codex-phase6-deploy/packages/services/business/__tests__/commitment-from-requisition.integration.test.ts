/**
 * commitment-from-requisition — integration test against a live PostgreSQL DB.
 *
 * Covers the end-to-end create path that POST /api/p2p/commitments/from-
 * requisition delegates to: commitment header + commitment_procurement +
 * commitment_line rows written atomically inside a single TX with FOR
 * UPDATE on purchase_requisition_line + converted_quantity bookkeeping.
 *
 * Cases:
 *   - happy path: full conversion of one PR line into one PO line
 *   - per-line over-quantity → 422 QUANTITY_OVER_REMAINING
 *   - PR in 'draft' status → 422 REQUISITION_NOT_CONVERTIBLE
 *   - missing supplier → 404 SUPPLIER_NOT_FOUND
 *   - PR-line bookkeeping: converted_quantity + status update on the PR line,
 *     converted_po_count + is_fully_converted on the PR header
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm vitest run commitment-from-requisition.integration
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCommitmentFromRequisition } from "../p2p/purchase_order/commitment-from-requisition.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:            string;
  requesterId:         string;
  buyerId:             string;
  legalEntityId:       string;
  companyCodeId:       string;
  siteId:              string;
  businessPartnerId:   string;
  inactiveBpId:        string;
  supplierId:          string;
  inactiveSupplierId:  string;
  commodityCategoryId: string;
  itemId:              string;
  requisitionId:       string;
  draftRequisitionId:  string;
  prl1Id:              string;
  prl2Id:              string;
  draftPrlId:          string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

maybeDescribe("createCommitmentFromRequisition — integration (live DB)", () => {
  let s: Scenario;

  beforeAll(async () => {
    const pgModule = await import("pg");
    const Pool =
      (pgModule.default as { Pool?: unknown } | undefined)?.Pool ??
      (pgModule as { Pool?: unknown }).Pool;
    if (!Pool) throw new Error("pg package required for integration tests");

    const pool = new (Pool as new (config: Record<string, unknown>) => unknown)({
      connectionString:        LIVE_DATABASE_URL,
      max:                     3,
      idleTimeoutMillis:       5_000,
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

  it("happy path: writes commitment + cp + lines; bumps PR converted_quantity + status", async () => {
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    s.requisitionId,
      supplierId:       s.supplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      documentDate:     "2026-06-15",
      lineSelections:   [{ requisitionLineId: s.prl1Id, quantity: 5, unitPrice: 100 }],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.linesWritten).toBe(1);
    expect(outcome.commitmentId).toBeTruthy();

    // Header
    const hdr = await sql<{ id: string; status: string; commitment_type: string; total_amount: string; requested_by: string }>`
      SELECT id::text AS id, status, commitment_type, total_amount::text, requested_by::text
        FROM document.commitment
       WHERE id = ${outcome.commitmentId}::uuid AND tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
    expect(hdr.rows[0]?.status).toBe("draft");
    expect(hdr.rows[0]?.commitment_type).toBe("PURCHASE_ORDER");
    expect(Number(hdr.rows[0]?.total_amount)).toBe(500); // 5 * 100
    expect(hdr.rows[0]?.requested_by).toBe(s.requesterId); // inherited from PR

    // commitment_procurement
    const cp = await sql<{ id: string; supplier_id: string; buyer_id: string; requisition_id: string }>`
      SELECT id::text AS id, supplier_id::text, buyer_id::text, requisition_id::text
        FROM document.commitment_procurement
       WHERE commitment_id = ${outcome.commitmentId}::uuid AND tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
    expect(cp.rows[0]?.supplier_id).toBe(s.supplierId);
    expect(cp.rows[0]?.buyer_id).toBe(s.buyerId);
    expect(cp.rows[0]?.requisition_id).toBe(s.requisitionId);

    // commitment_line
    const lines = await sql<{ line_no: number; quantity: string; unit_price: string; requisition_line_id: string }>`
      SELECT line_no, quantity::text, unit_price::text, requisition_line_id::text
        FROM document.commitment_line
       WHERE commitment_id = ${outcome.commitmentId}::uuid AND tenant_id = ${s.tenantId}::uuid
       ORDER BY line_no
    `.execute(mustDb());
    expect(lines.rows).toHaveLength(1);
    expect(Number(lines.rows[0]?.quantity)).toBe(5);
    expect(Number(lines.rows[0]?.unit_price)).toBe(100);
    expect(lines.rows[0]?.requisition_line_id).toBe(s.prl1Id);

    // PR-line bookkeeping
    const prl = await sql<{ converted_quantity: string; status: string }>`
      SELECT converted_quantity::text, status
        FROM document.purchase_requisition_line
       WHERE id = ${s.prl1Id}::uuid
    `.execute(mustDb());
    expect(Number(prl.rows[0]?.converted_quantity)).toBe(5);
    expect(prl.rows[0]?.status).toBe("converted"); // 5/5

    // PR header bookkeeping — only prl1 is converted; prl2 still open → partially_converted
    const pr = await sql<{ converted_po_count: number; is_fully_converted: boolean; status: string }>`
      SELECT converted_po_count, is_fully_converted, status
        FROM document.purchase_requisition
       WHERE id = ${s.requisitionId}::uuid
    `.execute(mustDb());
    expect(pr.rows[0]?.converted_po_count).toBe(1);
    expect(pr.rows[0]?.is_fully_converted).toBe(false);
    expect(pr.rows[0]?.status).toBe("partially_converted");
  });

  it("over-quantity: quantity > remaining → 422 QUANTITY_OVER_REMAINING", async () => {
    // prl1 was fully consumed by the happy-path test (5 of 5). prl2 still has
    // 3 remaining. PR is still in 'partially_converted' so the convertibility
    // gate passes; the per-line remaining gate must fire.
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    s.requisitionId,
      supplierId:       s.supplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-OVR-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      lineSelections:   [{ requisitionLineId: s.prl2Id, quantity: 99 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("QUANTITY_OVER_REMAINING");
    expect(outcome.fieldErrors?.[s.prl2Id]).toMatch(/exceeds remaining/i);
  });

  it("second conversion of remaining PR line flips PR to is_fully_converted=true", async () => {
    // prl2 was seeded with quantity 3 — convert fully.
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    s.requisitionId,
      supplierId:       s.supplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-FULL-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      documentDate:     "2026-06-16",
      lineSelections:   [{ requisitionLineId: s.prl2Id, quantity: 3 }],
    });

    expect(outcome.ok).toBe(true);

    const pr = await sql<{ converted_po_count: number; is_fully_converted: boolean; status: string }>`
      SELECT converted_po_count, is_fully_converted, status
        FROM document.purchase_requisition
       WHERE id = ${s.requisitionId}::uuid
    `.execute(mustDb());
    expect(pr.rows[0]?.converted_po_count).toBe(2);
    expect(pr.rows[0]?.is_fully_converted).toBe(true);
    expect(pr.rows[0]?.status).toBe("fully_converted");
  });

  it("draft requisition → 422 REQUISITION_NOT_CONVERTIBLE", async () => {
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    s.draftRequisitionId,
      supplierId:       s.supplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-DR-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      lineSelections:   [{ requisitionLineId: s.draftPrlId, quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("REQUISITION_NOT_CONVERTIBLE");
  });

  it("random requisitionId → 404 REQUISITION_NOT_FOUND", async () => {
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    randomUUID(),
      supplierId:       s.supplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-NF-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      lineSelections:   [{ requisitionLineId: s.prl2Id, quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe("REQUISITION_NOT_FOUND");
  });

  it("inactive supplier → 422 SUPPLIER_NOT_ACTIVE", async () => {
    const outcome = await createCommitmentFromRequisition(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.buyerId,
      requisitionId:    s.requisitionId,
      supplierId:       s.inactiveSupplierId,
      companyCodeId:    s.companyCodeId,
      commitmentNumber: `PO-INT-INA-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      lineSelections:   [{ requisitionLineId: s.prl2Id, quantity: 1 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("SUPPLIER_NOT_ACTIVE");
  });
});

// ── Seed / cleanup ───────────────────────────────────────────────────────────

async function seedScenario(): Promise<Scenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const s: Scenario = {
    tenantId:            randomUUID(),
    requesterId:         randomUUID(),
    buyerId:             randomUUID(),
    legalEntityId:       randomUUID(),
    companyCodeId:       randomUUID(),
    siteId:              randomUUID(),
    businessPartnerId:   randomUUID(),
    inactiveBpId:        randomUUID(),
    supplierId:          randomUUID(),
    inactiveSupplierId:  randomUUID(),
    commodityCategoryId: randomUUID(),
    itemId:              randomUUID(),
    requisitionId:       randomUUID(),
    draftRequisitionId:  randomUUID(),
    prl1Id:              randomUUID(),
    prl2Id:              randomUUID(),
    draftPrlId:          randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by) VALUES (${s.tenantId}::uuid, ${"cfr" + suffix}, ${"CFR Int " + suffix}, ${"CFR Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());

  for (const [id, label] of [
    [s.requesterId, "requester"],
    [s.buyerId,     "buyer"],
  ] as const) {
    await sql`INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by) VALUES (${id}::uuid, ${s.tenantId}::uuid, ${`${label}_${suffix}`}, ${label}, 'user', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());
  }

  await sql`INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by) VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'CFR LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by) VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'CFR CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.site (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by) VALUES (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'CFR Site', ${s.companyCodeId}::uuid, 'plant', 'US', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'CFR BP', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.inactiveBpId}::uuid, ${s.tenantId}::uuid, ${"BPI" + suffix}, 'CFR BP Inactive', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid, ${"SUP" + suffix}, 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.inactiveSupplierId}::uuid, ${s.tenantId}::uuid, ${s.inactiveBpId}::uuid, ${"SUPI" + suffix}, 'inactive', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.commodity_category (id, tenant_id, code, name, root_category_id, created_by) VALUES (${s.commodityCategoryId}::uuid, ${s.tenantId}::uuid, ${"CAT" + suffix}, 'CFR Cat', ${s.commodityCategoryId}::uuid, ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.item (id, tenant_id, code, name, company_code_id, commodity_category_id, valuation_method, uom_code, status, created_by) VALUES (${s.itemId}::uuid, ${s.tenantId}::uuid, ${"ITM" + suffix}, 'CFR Item', ${s.companyCodeId}::uuid, ${s.commodityCategoryId}::uuid, 'weighted_avg', 'EA', 'active', ${s.requesterId}::uuid)`.execute(mustDb());

  // Approved requisition with 2 lines (qty 5, qty 3).
  await sql`
    INSERT INTO document.purchase_requisition (
      id, tenant_id, company_code_id, requisition_number,
      document_date, currency_code, base_currency_code, fiscal_year,
      status, requested_by, created_by
    ) VALUES (
      ${s.requisitionId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PR-CFR-" + suffix},
      '2026-06-01', 'USD', 'USD', 2026,
      'approved', ${s.requesterId}::uuid, ${s.requesterId}::uuid
    )
  `.execute(mustDb());

  for (const [id, lineNo, qty] of [
    [s.prl1Id, 1, 5],
    [s.prl2Id, 2, 3],
  ] as const) {
    await sql`
      INSERT INTO document.purchase_requisition_line (
        id, tenant_id, purchase_requisition_id, line_no,
        item_id, item_description, uom_code,
        quantity, estimated_unit_price, currency_code,
        created_by
      ) VALUES (
        ${id}::uuid, ${s.tenantId}::uuid, ${s.requisitionId}::uuid, ${lineNo}::smallint,
        ${s.itemId}::uuid, ${"PR line " + lineNo}, 'EA',
        ${qty}::numeric, 100::numeric, 'USD',
        ${s.requesterId}::uuid
      )
    `.execute(mustDb());
  }

  // Draft requisition + line — exercises REQUISITION_NOT_CONVERTIBLE.
  await sql`
    INSERT INTO document.purchase_requisition (
      id, tenant_id, company_code_id, requisition_number,
      document_date, currency_code, base_currency_code, fiscal_year,
      status, requested_by, created_by
    ) VALUES (
      ${s.draftRequisitionId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PR-CFR-DR-" + suffix},
      '2026-06-01', 'USD', 'USD', 2026,
      'draft', ${s.requesterId}::uuid, ${s.requesterId}::uuid
    )
  `.execute(mustDb());
  await sql`
    INSERT INTO document.purchase_requisition_line (
      id, tenant_id, purchase_requisition_id, line_no,
      item_id, item_description, uom_code,
      quantity, estimated_unit_price, currency_code,
      created_by
    ) VALUES (
      ${s.draftPrlId}::uuid, ${s.tenantId}::uuid, ${s.draftRequisitionId}::uuid, 1::smallint,
      ${s.itemId}::uuid, 'Draft line', 'EA',
      1::numeric, 100::numeric, 'USD',
      ${s.requesterId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  try {
    await sql`DELETE FROM event.outbox                          WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment_line              WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment_procurement       WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment                   WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_requisition_line    WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_requisition         WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.item                           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.commodity_category             WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.supplier                       WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.business_partner               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.site                           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.company_code                   WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.legal_entity                   WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.principal                      WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.tenant                         WHERE id        = ${s.tenantId}::uuid`.execute(mustDb());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("commitment-from-requisition integration cleanup error:", err);
  }
}
