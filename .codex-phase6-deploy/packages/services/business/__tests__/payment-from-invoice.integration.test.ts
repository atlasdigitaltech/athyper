/**
 * payment-from-invoice — integration test against a live PostgreSQL DB.
 *
 * Covers the end-to-end create path that POST /api/p2p/payments/from-invoice
 * delegates to: payment_entry header + payment_entry_allocation rows
 * written atomically inside a single TX with FOR UPDATE on the chosen
 * invoices and the cross-row supplier/currency invariants.
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPaymentFromInvoice } from "../ap/payment_entry/payment-from-invoice.service.js";

const LIVE_DATABASE_URL =
  process.env["WORKFLOW_RUNTIME_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:        string;
  principalId:     string;
  legalEntityId:   string;
  companyCodeId:   string;
  businessPartnerId1: string;
  supplierId1:     string;
  businessPartnerId2: string;
  supplierId2:     string;
  paymentMethodId: string;
  /** PI approved, supplier1, USD, payable_amount=1000. */
  invoice1Id:      string;
  /** Second PI approved, supplier1, USD, payable_amount=500 (for multi-PI happy path). */
  invoice2Id:      string;
  /** Draft PI for the NOT_PAYABLE negative case. */
  draftInvoiceId:  string;
  /** PI for supplier2 (different supplier — same-supplier invariant test). */
  invoiceSupplier2Id: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

maybeDescribe("createPaymentFromInvoice — integration (live DB)", () => {
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

  it("happy path: single-invoice payment with allocations written atomically", async () => {
    const outcome = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.principalId,
      companyCodeId:    s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      allocations:      [{ invoiceId: s.invoice1Id, allocatedAmount: 400 }],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.allocationsWritten).toBe(1);
    expect(outcome.totalAmount).toBe(400);

    const hdr = await sql<{ id: string; status: string; supplier_id: string; payment_amount: string }>`
      SELECT id, status, supplier_id, payment_amount::text
        FROM document.payment_entry
       WHERE id = ${outcome.paymentId}::uuid AND tenant_id = ${s.tenantId}::uuid
    `.execute(mustDb());
    expect(hdr.rows[0]?.status).toBe("draft");
    expect(hdr.rows[0]?.supplier_id).toBe(s.supplierId1);
    expect(Number(hdr.rows[0]?.payment_amount)).toBe(400);

    const lines = await sql<{ line_no: number; purchase_invoice_id: string; allocated_amount: string }>`
      SELECT line_no, purchase_invoice_id, allocated_amount::text
        FROM document.payment_entry_allocation
       WHERE payment_entry_id = ${outcome.paymentId}::uuid
       ORDER BY line_no
    `.execute(mustDb());
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0]?.purchase_invoice_id).toBe(s.invoice1Id);
    expect(Number(lines.rows[0]?.allocated_amount)).toBe(400);
  });

  it("multi-invoice happy path: one payment against two PIs of the same supplier", async () => {
    const outcome = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId,
      principalId:      s.principalId,
      companyCodeId:    s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-MULTI-${Date.now()}`,
      fiscalYear:       2026,
      periodNumber:     6,
      baseCurrencyCode: "USD",
      allocations: [
        { invoiceId: s.invoice1Id, allocatedAmount: 100 },
        { invoiceId: s.invoice2Id, allocatedAmount: 300 },
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.allocationsWritten).toBe(2);
    expect(outcome.totalAmount).toBe(400);
  });

  it("second payment subtracts the first's allocation from remaining", async () => {
    // PI 1 payable_amount=1000. After the two prior tests: 400 + 100 = 500
    // already allocated. So 501 should be rejected; 500 should succeed.
    const over = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId, principalId: s.principalId, companyCodeId: s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-OVR-${Date.now()}`,
      fiscalYear:       2026, periodNumber: 6, baseCurrencyCode: "USD",
      allocations:      [{ invoiceId: s.invoice1Id, allocatedAmount: 501 }],
    });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error).toBe("ALLOCATION_OVER_REMAINING");
    expect(over.fieldErrors?.[s.invoice1Id]).toMatch(/exceeds remaining \(500\)/);

    const okPayment = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId, principalId: s.principalId, companyCodeId: s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-OK-${Date.now()}`,
      fiscalYear:       2026, periodNumber: 6, baseCurrencyCode: "USD",
      allocations:      [{ invoiceId: s.invoice1Id, allocatedAmount: 500 }],
    });
    expect(okPayment.ok).toBe(true);
  });

  it("invoices from different suppliers → 422 MULTIPLE_SUPPLIERS", async () => {
    const outcome = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId, principalId: s.principalId, companyCodeId: s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-MS-${Date.now()}`,
      fiscalYear:       2026, periodNumber: 6, baseCurrencyCode: "USD",
      allocations: [
        { invoiceId: s.invoice2Id,         allocatedAmount: 50 },
        { invoiceId: s.invoiceSupplier2Id, allocatedAmount: 50 },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("MULTIPLE_SUPPLIERS");
  });

  it("draft invoice → 422 INVOICE_NOT_PAYABLE", async () => {
    const outcome = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId, principalId: s.principalId, companyCodeId: s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-NP-${Date.now()}`,
      fiscalYear:       2026, periodNumber: 6, baseCurrencyCode: "USD",
      allocations:      [{ invoiceId: s.draftInvoiceId, allocatedAmount: 50 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.error).toBe("INVOICE_NOT_PAYABLE");
  });

  it("random invoiceId → 404 INVOICES_NOT_FOUND", async () => {
    const outcome = await createPaymentFromInvoice(mustDb(), {
      tenantId:         s.tenantId, principalId: s.principalId, companyCodeId: s.companyCodeId,
      paymentMethodId:  s.paymentMethodId,
      documentDate:     "2026-06-20",
      paymentNumber:    `PMT-INT-NF-${Date.now()}`,
      fiscalYear:       2026, periodNumber: 6, baseCurrencyCode: "USD",
      allocations:      [{ invoiceId: randomUUID(), allocatedAmount: 50 }],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(404);
    expect(outcome.error).toBe("INVOICES_NOT_FOUND");
  });
});

// ── Seed / cleanup ─────────────────────────────────────────────────────────

async function seedScenario(): Promise<Scenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const s: Scenario = {
    tenantId:           randomUUID(),
    principalId:        randomUUID(),
    legalEntityId:      randomUUID(),
    companyCodeId:      randomUUID(),
    businessPartnerId1: randomUUID(),
    supplierId1:        randomUUID(),
    businessPartnerId2: randomUUID(),
    supplierId2:        randomUUID(),
    paymentMethodId:    randomUUID(),
    invoice1Id:         randomUUID(),
    invoice2Id:         randomUUID(),
    draftInvoiceId:     randomUUID(),
    invoiceSupplier2Id: randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by) VALUES (${s.tenantId}::uuid, ${"payfi" + suffix}, ${"PayFi Int " + suffix}, ${"PayFi Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by) VALUES (${s.principalId}::uuid, ${s.tenantId}::uuid, ${"payfi_actor_" + suffix}, 'PayFi Test Actor', 'user', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by) VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'PayFi LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by) VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'PayFi CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.principalId}::uuid)`.execute(mustDb());

  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.businessPartnerId1}::uuid, ${s.tenantId}::uuid, ${"BP1" + suffix}, 'PayFi BP1', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.supplierId1}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId1}::uuid, ${"SUP1" + suffix}, 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.businessPartnerId2}::uuid, ${s.tenantId}::uuid, ${"BP2" + suffix}, 'PayFi BP2', 'active', ${s.principalId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.supplierId2}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId2}::uuid, ${"SUP2" + suffix}, 'active', ${s.principalId}::uuid)`.execute(mustDb());

  // is_active on payment_method is GENERATED; only status='active' implies active.
  // direction default 'BOTH' is the old vocabulary — lookup expects lowercase.
  await sql`INSERT INTO master.payment_method (id, tenant_id, code, name, instrument_mode, direction, status, created_by) VALUES (${s.paymentMethodId}::uuid, ${s.tenantId}::uuid, ${"PM" + suffix}, 'PayFi Method', 'bank_transfer', 'outbound', 'active', ${s.principalId}::uuid)`.execute(mustDb());

  // PI 1 — supplier1, USD, approved, total_amount=1000 (payable_amount = 1000 - 0 wht = 1000)
  await sql`
    INSERT INTO document.purchase_invoice (
      id, tenant_id, company_code_id,
      code, supplier_invoice_number, supplier_invoice_date,
      supplier_id,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      total_amount,
      fiscal_year, period_number,
      invoice_source,
      status, created_by
    ) VALUES (
      ${s.invoice1Id}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PI1-" + suffix}, ${"SUP-INV-1-" + suffix}, '2026-06-15',
      ${s.supplierId1}::uuid,
      '2026-06-15', '2026-06-15', '2026-06-15',
      'USD', 'USD',
      1000,
      2026, 6,
      'non_po',
      'approved', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // PI 2 — supplier1, USD, approved, total_amount=500
  await sql`
    INSERT INTO document.purchase_invoice (
      id, tenant_id, company_code_id,
      code, supplier_invoice_number, supplier_invoice_date,
      supplier_id,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      total_amount,
      fiscal_year, period_number,
      invoice_source,
      status, created_by
    ) VALUES (
      ${s.invoice2Id}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PI2-" + suffix}, ${"SUP-INV-2-" + suffix}, '2026-06-16',
      ${s.supplierId1}::uuid,
      '2026-06-16', '2026-06-16', '2026-06-16',
      'USD', 'USD',
      500,
      2026, 6,
      'non_po',
      'approved', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // Draft PI — for NOT_PAYABLE test
  await sql`
    INSERT INTO document.purchase_invoice (
      id, tenant_id, company_code_id,
      code, supplier_invoice_number, supplier_invoice_date,
      supplier_id,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      total_amount,
      fiscal_year, period_number,
      invoice_source,
      status, created_by
    ) VALUES (
      ${s.draftInvoiceId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PIDR-" + suffix}, ${"SUP-INV-DR-" + suffix}, '2026-06-17',
      ${s.supplierId1}::uuid,
      '2026-06-17', '2026-06-17', '2026-06-17',
      'USD', 'USD',
      200,
      2026, 6,
      'non_po',
      'draft', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  // PI for supplier 2 — different supplier (for MULTIPLE_SUPPLIERS test)
  await sql`
    INSERT INTO document.purchase_invoice (
      id, tenant_id, company_code_id,
      code, supplier_invoice_number, supplier_invoice_date,
      supplier_id,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      total_amount,
      fiscal_year, period_number,
      invoice_source,
      status, created_by
    ) VALUES (
      ${s.invoiceSupplier2Id}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PIS2-" + suffix}, ${"SUP-INV-S2-" + suffix}, '2026-06-18',
      ${s.supplierId2}::uuid,
      '2026-06-18', '2026-06-18', '2026-06-18',
      'USD', 'USD',
      300,
      2026, 6,
      'non_po',
      'approved', ${s.principalId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  try {
    // payment_entry_allocation is immutability-guarded after parent payment posts;
    // tests only create drafts so DELETE should succeed.
    await sql`DELETE FROM document.payment_entry_allocation
                WHERE payment_entry_id IN (
                  SELECT id FROM document.payment_entry WHERE tenant_id = ${s.tenantId}::uuid
                )`.execute(mustDb());
    await sql`DELETE FROM document.payment_entry        WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_invoice     WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.payment_method         WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.supplier               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.business_partner       WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.company_code           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.legal_entity           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.principal              WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.tenant                 WHERE id        = ${s.tenantId}::uuid`.execute(mustDb());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("payment-from-invoice integration cleanup error:", err);
  }
}
