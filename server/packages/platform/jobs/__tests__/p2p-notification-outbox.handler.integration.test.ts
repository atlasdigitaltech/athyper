/**
 * p2p-notification-outbox handler — integration tests against a live DB.
 *
 * Covers the four P2P event types the handler converts into
 * event.notification_message rows. Validates:
 *
 *   - p2p.receipt.created_from_commitment        → requested_by + buyer_id
 *   - p2p.service_sheet.created_from_commitment  → requested_by + buyer_id
 *   - p2p.invoice.created_from_receipt           → receipt.created_by + parent PO actors
 *   - p2p.payment.created_from_invoice           → invoice.created_by + actor
 *
 * Also covers:
 *   - idempotency (2nd handle() of same outbox row does not duplicate)
 *   - unknown event_type → silently skipped (no row)
 *   - aggregate_id missing → falls back to actor_id
 *   - SYSTEM_ACTOR_ID filtered from recipients
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm --filter @athyper/svc-jobs vitest run \
 *     p2p-notification-outbox.handler.integration
 *
 * Seeds a synthetic tenant graph and tears it down in afterAll.
 */

import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createP2pNotificationOutboxHandler } from "../handlers/p2p-notification-outbox.handler.js";
import type { OutboxEvent } from "../workers/domain-outbox.worker.js";

const LIVE_DATABASE_URL =
  process.env["P2P_NOTIFICATION_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

interface Scenario {
  tenantId:                string;
  requesterId:             string;
  buyerId:                 string;
  receiptCreatorId:        string;
  invoiceCreatorId:        string;
  // Unrelated user — used as actor in some tests to confirm dedupe / fallback.
  externalActorId:         string;
  legalEntityId:           string;
  companyCodeId:           string;
  siteId:                  string;
  warehouseId:             string;
  businessPartnerId:       string;
  supplierId:              string;
  requisitionId:           string;
  commitmentId:            string;
  commitmentProcurementId: string;
  receiptId:               string;
  invoiceId:               string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined;

function mustDb() {
  if (!db) throw new Error("DB not initialised");
  return db;
}

maybeDescribe("p2p-notification-outbox handler — integration (live DB)", () => {
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

  // Clear outbox/message rows that prior tests inserted into the synthetic tenant
  // so each `it()` starts from a clean slate.
  beforeEach(async () => {
    await sql`DELETE FROM event.notification_message WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM event.outbox               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
  });

  // ── Commitment-from-requisition ────────────────────────────────────────────

  it("p2p.commitment.created_from_requisition → resolves requisition.requested_by + actor", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.commitment.created_from_requisition",
      entityType:  "commitment",
      entityId:    s.commitmentId,
      aggregateId: s.requisitionId,
      actorId:     s.externalActorId,
      payload:     { commitment_number: "PO-INT-9001", requisition_id: s.requisitionId },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect(msg!.event_code).toBe("p2p.commitment.created_from_requisition");
    expect(msg!.template_key).toBe("p2p.commitment.created");
    expect(msg!.subject).toBe("Purchase Order PO-INT-9001 created");
    expect(msg!.channels).toEqual(["in_app"]);

    const enriched = msg!.payload as Record<string, unknown>;
    const additional = (enriched["additional_recipients"] as string[] | undefined) ?? [];
    const allRecipients = new Set<string>([enriched["recipient_id"] as string, ...additional]);
    expect(allRecipients.has(s.requesterId)).toBe(true);    // PR requester
    expect(allRecipients.has(s.externalActorId)).toBe(true); // buyer (= actor)
  });

  // ── Receipt-from-commitment ────────────────────────────────────────────────

  it("p2p.receipt.created_from_commitment → resolves requester + buyer from commitment + cp", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.receipt.created_from_commitment",
      entityType:  "receipt",
      entityId:    s.receiptId,
      aggregateId: s.commitmentId,
      actorId:     s.externalActorId,
      payload:     { receipt_number: "RCP-INT-9001" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect(msg!.event_code).toBe("p2p.receipt.created_from_commitment");
    expect(msg!.template_key).toBe("p2p.receipt.created");
    expect(msg!.subject).toBe("Receipt RCP-INT-9001 created");
    expect(msg!.channels).toEqual(["in_app"]);

    const enriched = msg!.payload as Record<string, unknown>;
    const additional = (enriched["additional_recipients"] as string[] | undefined) ?? [];
    const allRecipients = new Set<string>([enriched["recipient_id"] as string, ...additional]);
    // Requester + buyer + actor (all 3 are distinct real users in the seed).
    expect(allRecipients.has(s.requesterId)).toBe(true);
    expect(allRecipients.has(s.buyerId)).toBe(true);
    expect(allRecipients.has(s.externalActorId)).toBe(true);
    expect(allRecipients.has(SYSTEM_ACTOR)).toBe(false);
  });

  // ── Service-sheet-from-commitment ──────────────────────────────────────────

  it("p2p.service_sheet.created_from_commitment → same recipient resolution path as receipt", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.service_sheet.created_from_commitment",
      entityType:  "service_sheet",
      entityId:    randomUUID(),
      aggregateId: s.commitmentId,
      actorId:     s.externalActorId,
      payload:     { service_sheet_number: "SES-INT-9001" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect(msg!.template_key).toBe("p2p.service_sheet.created");
    expect(msg!.subject).toBe("Service Sheet SES-INT-9001 created");
    expect(msg!.channels).toEqual(["in_app"]);

    const enriched = msg!.payload as Record<string, unknown>;
    const additional = (enriched["additional_recipients"] as string[] | undefined) ?? [];
    const allRecipients = new Set<string>([enriched["recipient_id"] as string, ...additional]);
    expect(allRecipients.has(s.requesterId)).toBe(true);
    expect(allRecipients.has(s.buyerId)).toBe(true);
  });

  // ── Invoice-from-receipt ───────────────────────────────────────────────────

  it("p2p.invoice.created_from_receipt → resolves receipt.created_by + parent PO requester/buyer", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.invoice.created_from_receipt",
      entityType:  "purchase_invoice",
      entityId:    s.invoiceId,
      aggregateId: s.receiptId,
      actorId:     s.invoiceCreatorId,
      payload:     { code: "PI-INT-9001" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect(msg!.template_key).toBe("p2p.invoice.created");
    expect(msg!.subject).toBe("Invoice PI-INT-9001 created");
    expect(msg!.channels).toEqual(["in_app"]);

    const enriched = msg!.payload as Record<string, unknown>;
    const additional = (enriched["additional_recipients"] as string[] | undefined) ?? [];
    const allRecipients = new Set<string>([enriched["recipient_id"] as string, ...additional]);
    // receipt.created_by, commitment.requested_by, cp.buyer_id, actor — all real users
    expect(allRecipients.has(s.receiptCreatorId)).toBe(true);
    expect(allRecipients.has(s.requesterId)).toBe(true);
    expect(allRecipients.has(s.buyerId)).toBe(true);
    expect(allRecipients.has(s.invoiceCreatorId)).toBe(true);
  });

  // ── Payment-from-invoice ───────────────────────────────────────────────────

  it("p2p.payment.created_from_invoice → fans out in_app + email", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.payment.created_from_invoice",
      entityType:  "payment_entry",
      entityId:    randomUUID(),
      aggregateId: s.invoiceId,
      actorId:     s.externalActorId,
      payload:     { invoice_ids: [s.invoiceId], payment_number: "PE-INT-9001" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect(msg!.template_key).toBe("p2p.payment.created");
    expect(msg!.subject).toBe("Payment PE-INT-9001 created");
    expect(msg!.channels?.slice().sort()).toEqual(["email", "in_app"]);

    const enriched = msg!.payload as Record<string, unknown>;
    const additional = (enriched["additional_recipients"] as string[] | undefined) ?? [];
    const allRecipients = new Set<string>([enriched["recipient_id"] as string, ...additional]);
    expect(allRecipients.has(s.invoiceCreatorId)).toBe(true);
    expect(allRecipients.has(s.externalActorId)).toBe(true);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("idempotency — second invocation does not create a duplicate notification_message", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.payment.created_from_invoice",
      entityType:  "payment_entry",
      entityId:    randomUUID(),
      aggregateId: s.invoiceId,
      actorId:     s.externalActorId,
      payload:     { invoice_ids: [s.invoiceId], payment_number: "PE-INT-IDEMP" },
    });

    const h = createP2pNotificationOutboxHandler(mustDb());
    await h.handle(event);
    await h.handle(event);
    await h.handle(event);

    const countRows = await sql<{ count: string }>`
      SELECT count(*)::text AS count FROM event.notification_message WHERE event_id = ${event.id}
    `.execute(mustDb());
    expect(parseInt(countRows.rows[0]?.count ?? "0", 10)).toBe(1);
  });

  // ── Unknown event_type ────────────────────────────────────────────────────

  it("unknown event_type → no notification_message created (silent skip)", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.not.a.real.event",
      entityType:  "purchase_invoice",
      entityId:    s.invoiceId,
      aggregateId: s.invoiceId,
      actorId:     s.externalActorId,
      payload:     { invoice_ids: [s.invoiceId] },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const countRows = await sql<{ count: string }>`
      SELECT count(*)::text AS count FROM event.notification_message WHERE event_id = ${event.id}
    `.execute(mustDb());
    expect(parseInt(countRows.rows[0]?.count ?? "0", 10)).toBe(0);
  });

  // ── Missing aggregate_id → fall back to actor_id ──────────────────────────

  it("aggregate_id missing → falls back to actor_id as recipient", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.receipt.created_from_commitment",
      entityType:  "receipt",
      entityId:    randomUUID(),
      aggregateId: null,
      actorId:     s.externalActorId,
      payload:     { receipt_number: "RCP-FALLBACK" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const msg = await fetchMessage(event.id);
    expect(msg).toBeDefined();
    expect((msg!.payload as Record<string, unknown>)["recipient_id"]).toBe(s.externalActorId);
  });

  // ── SYSTEM_ACTOR_ID filtered ──────────────────────────────────────────────

  it("SYSTEM_ACTOR_ID → filtered out → no recipient → no notification_message", async () => {
    const event = await insertOutboxRow({
      tenantId:    s.tenantId,
      eventType:   "p2p.payment.created_from_invoice",
      // intentionally use an invoice we haven't seeded → handler returns
      // [inv.created_by(null), actor(SYSTEM_ACTOR)] → both filtered → no msg.
      entityType:  "payment_entry",
      entityId:    randomUUID(),
      aggregateId: randomUUID(),
      actorId:     SYSTEM_ACTOR,
      payload:     { invoice_ids: [randomUUID()], payment_number: "PE-SYS" },
    });

    await createP2pNotificationOutboxHandler(mustDb()).handle(event);

    const countRows = await sql<{ count: string }>`
      SELECT count(*)::text AS count FROM event.notification_message WHERE event_id = ${event.id}
    `.execute(mustDb());
    expect(parseInt(countRows.rows[0]?.count ?? "0", 10)).toBe(0);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface OutboxInsertArgs {
  tenantId:    string;
  eventType:   string;
  entityType:  string;
  entityId:    string | null;
  aggregateId: string | null;
  actorId:     string | null;
  payload:     Record<string, unknown>;
}

async function insertOutboxRow(args: OutboxInsertArgs): Promise<OutboxEvent> {
  const rows = await sql<{ id: string }>`
    INSERT INTO event.outbox
      (tenant_id, topic, event_type, event_key,
       entity_type, entity_id,
       aggregate_id, aggregate_type,
       actor_id, source, payload, status, created_by)
    VALUES
      (${args.tenantId}::uuid, 'notification', ${args.eventType}, ${`int-${randomUUID()}`},
       ${args.entityType}, ${args.entityId ? sql`${args.entityId}::uuid` : sql`NULL`},
       ${args.aggregateId ? sql`${args.aggregateId}::uuid` : sql`NULL`}, ${args.entityType},
       ${args.actorId ? sql`${args.actorId}::uuid` : sql`NULL`}, 'p2p-test',
       ${JSON.stringify(args.payload)}::jsonb,
       'pending',
       ${args.actorId ?? SYSTEM_ACTOR}::uuid)
    RETURNING id::text AS id
  `.execute(mustDb());

  const id = rows.rows[0]?.id;
  if (!id) throw new Error("outbox insert returned no id");

  return {
    id,
    tenant_id:    args.tenantId,
    topic:        "notification",
    event_type:   args.eventType,
    event_key:    null,
    entity_type:  args.entityType,
    entity_id:    args.entityId,
    aggregate_id: args.aggregateId,
    payload:      args.payload,
    actor_id:     args.actorId,
  };
}

async function fetchMessage(eventId: string) {
  const rows = await sql<{
    id:           string;
    event_code:   string;
    template_key: string;
    subject:      string | null;
    channels:     string[] | null;
    payload:      Record<string, unknown>;
  }>`
    SELECT id::text AS id, event_code, template_key, subject, channels, payload
      FROM event.notification_message
     WHERE event_id = ${eventId}
  `.execute(mustDb());
  return rows.rows[0];
}

// ── Seed / cleanup ───────────────────────────────────────────────────────────

async function seedScenario(): Promise<Scenario> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const s: Scenario = {
    tenantId:                randomUUID(),
    requesterId:             randomUUID(),
    buyerId:                 randomUUID(),
    receiptCreatorId:        randomUUID(),
    invoiceCreatorId:        randomUUID(),
    externalActorId:         randomUUID(),
    legalEntityId:           randomUUID(),
    companyCodeId:           randomUUID(),
    siteId:                  randomUUID(),
    warehouseId:             randomUUID(),
    businessPartnerId:       randomUUID(),
    supplierId:              randomUUID(),
    requisitionId:           randomUUID(),
    commitmentId:            randomUUID(),
    commitmentProcurementId: randomUUID(),
    receiptId:               randomUUID(),
    invoiceId:               randomUUID(),
  };

  await sql`INSERT INTO shared.country (code, name, created_by) VALUES ('US', 'United States', ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());
  await sql`INSERT INTO shared.currency (code, name, minor_units, created_by) VALUES ('USD', 'US Dollar', 2, ${SYSTEM_ACTOR}::uuid) ON CONFLICT (code) DO NOTHING`.execute(mustDb());

  await sql`INSERT INTO master.tenant (id, code, name, display_name, realm_key, tenant_type, status, created_by) VALUES (${s.tenantId}::uuid, ${"p2pntf" + suffix}, ${"P2P NTF Int " + suffix}, ${"P2P NTF Int " + suffix}, 'neon', 'customer', 'active', ${SYSTEM_ACTOR}::uuid)`.execute(mustDb());

  // Five separate principals — exercises every recipient path independently.
  for (const [id, label] of [
    [s.requesterId,      "requester"],
    [s.buyerId,          "buyer"],
    [s.receiptCreatorId, "receipt_creator"],
    [s.invoiceCreatorId, "invoice_creator"],
    [s.externalActorId,  "external_actor"],
  ] as const) {
    await sql`
      INSERT INTO master.principal (id, tenant_id, code, name, principal_type, status, created_by)
      VALUES (${id}::uuid, ${s.tenantId}::uuid, ${`${label}_${suffix}`}, ${label}, 'user', 'active', ${SYSTEM_ACTOR}::uuid)
    `.execute(mustDb());
  }

  await sql`INSERT INTO master.legal_entity (id, tenant_id, code, name, entity_type, country_code, functional_currency, reporting_currency, status, created_by) VALUES (${s.legalEntityId}::uuid, ${s.tenantId}::uuid, ${"LE" + suffix}, 'P2P NTF LE', 'standalone', 'US', 'USD', 'USD', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.company_code (id, tenant_id, code, name, legal_entity_id, functional_currency, country_code, status, created_by) VALUES (${s.companyCodeId}::uuid, ${s.tenantId}::uuid, ${"CC" + suffix}, 'P2P NTF CC', ${s.legalEntityId}::uuid, 'USD', 'US', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.site (id, tenant_id, code, name, company_code_id, site_type, country_code, status, created_by) VALUES (${s.siteId}::uuid, ${s.tenantId}::uuid, ${"SITE" + suffix}, 'P2P NTF Site', ${s.companyCodeId}::uuid, 'plant', 'US', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.warehouse (id, tenant_id, code, name, site_id, status, created_by) VALUES (${s.warehouseId}::uuid, ${s.tenantId}::uuid, ${"WH" + suffix}, 'P2P NTF WH', ${s.siteId}::uuid, 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.business_partner (id, tenant_id, code, name, status, created_by) VALUES (${s.businessPartnerId}::uuid, ${s.tenantId}::uuid, ${"BP" + suffix}, 'P2P NTF BP', 'active', ${s.requesterId}::uuid)`.execute(mustDb());
  await sql`INSERT INTO master.supplier (id, tenant_id, business_partner_id, supplier_code, status, created_by) VALUES (${s.supplierId}::uuid, ${s.tenantId}::uuid, ${s.businessPartnerId}::uuid, ${"SUP" + suffix}, 'active', ${s.requesterId}::uuid)`.execute(mustDb());

  // Purchase requisition with requested_by populated — covers
  // p2p.commitment.created_from_requisition recipient resolution.
  await sql`
    INSERT INTO document.purchase_requisition (
      id, tenant_id, company_code_id, requisition_number,
      document_date, currency_code, base_currency_code,
      fiscal_year, status, requested_by, created_by
    ) VALUES (
      ${s.requisitionId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PR-NTF-" + suffix},
      '2026-05-30', 'USD', 'USD',
      2026, 'approved', ${s.requesterId}::uuid, ${s.requesterId}::uuid
    )
  `.execute(mustDb());

  // Commitment with requested_by populated.
  await sql`
    INSERT INTO document.commitment (
      id, tenant_id, company_code_id, commitment_number, commitment_type,
      document_date, effective_date, currency_code, base_currency_code, total_amount,
      fiscal_year, period_number, site_id, status,
      requested_by, created_by
    ) VALUES (
      ${s.commitmentId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid,
      ${"PO-NTF-" + suffix}, 'purchase_order',
      '2026-06-01', '2026-06-01', 'USD', 'USD', 250,
      2026, 6, ${s.siteId}::uuid, 'active',
      ${s.requesterId}::uuid, ${s.requesterId}::uuid
    )
  `.execute(mustDb());

  // commitment_procurement carries buyer_id.
  await sql`
    INSERT INTO document.commitment_procurement (
      id, tenant_id, commitment_id, supplier_id, buyer_id, created_by
    ) VALUES (
      ${s.commitmentProcurementId}::uuid, ${s.tenantId}::uuid, ${s.commitmentId}::uuid,
      ${s.supplierId}::uuid, ${s.buyerId}::uuid, ${s.requesterId}::uuid
    )
  `.execute(mustDb());

  // Receipt with created_by + commitment_id set so the invoice-from-receipt
  // handler can walk back to the PO and resolve requester + buyer.
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
      ${"RCP-NTF-" + suffix}, '2026-06-02', '2026-06-02',
      ${s.siteId}::uuid, ${s.warehouseId}::uuid,
      'USD', 'USD', 2026, 6,
      'draft', ${s.receiptCreatorId}::uuid
    )
  `.execute(mustDb());

  // Purchase invoice with created_by — invoice_source='non_po' avoids the
  // pi_commitment_req constraint that fires when source='po_based'.
  await sql`
    INSERT INTO document.purchase_invoice (
      id, tenant_id, company_code_id, supplier_id,
      code, invoice_source, invoice_type,
      supplier_invoice_number, supplier_invoice_date,
      document_date, posting_date, received_date,
      currency_code, base_currency_code,
      subtotal_amount, total_amount,
      fiscal_year, period_number,
      status, created_by
    ) VALUES (
      ${s.invoiceId}::uuid, ${s.tenantId}::uuid, ${s.companyCodeId}::uuid, ${s.supplierId}::uuid,
      ${"PI-NTF-" + suffix}, 'non_po', 'standard',
      ${"SUP-INV-" + suffix}, '2026-06-03',
      '2026-06-03', '2026-06-03', '2026-06-03',
      'USD', 'USD',
      100, 100,
      2026, 6,
      'draft', ${s.invoiceCreatorId}::uuid
    )
  `.execute(mustDb());

  return s;
}

async function cleanupScenario(s: Scenario): Promise<void> {
  try {
    await sql`DELETE FROM event.notification_message WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM event.outbox               WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_invoice  WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.receipt           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment_procurement WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.commitment        WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM document.purchase_requisition WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.supplier            WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.business_partner    WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.warehouse           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.site                WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.company_code        WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.legal_entity        WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.principal           WHERE tenant_id = ${s.tenantId}::uuid`.execute(mustDb());
    await sql`DELETE FROM master.tenant              WHERE id        = ${s.tenantId}::uuid`.execute(mustDb());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("p2p-notification-outbox integration cleanup error:", err);
  }
}
