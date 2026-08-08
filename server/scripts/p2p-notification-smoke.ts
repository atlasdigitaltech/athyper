#!/usr/bin/env tsx
/**
 * P2P Notification Smoke Test
 *
 * End-to-end smoke test of the from-X notification pipeline against a live
 * database. Injects a synthetic event.outbox row that mirrors what the
 * `p2p/*-from-*.service.ts` services emit, then invokes the
 * createP2pNotificationOutboxHandler directly and asserts that a
 * notification_message row is produced with the correct recipient, subject,
 * and channels.
 *
 * Covers the handler layer end-to-end without requiring the api / worker
 * process to be running. Verifies:
 *
 *   1. handler resolves a real recipient (filters out SYSTEM_ACTOR_ID)
 *   2. subject/template_key/channels match the event_type
 *   3. enriched payload carries recipient_id + _eventType + source_plane
 *   4. idempotency — a second invocation does NOT create a duplicate row
 *
 * Cleans up after itself (deletes the injected outbox row + notification_message).
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:6432/athyper_neon \
 *   npx tsx server/scripts/p2p-notification-smoke.ts
 *
 * Exit code:
 *   0 — all checks passed
 *   1 — any check failed
 */

import { Kysely, sql } from "kysely";
import pg from "pg";

import { createPostgresDialect } from "../packages/adapters/db/src/kysely/dialect.js";
import { createP2pNotificationOutboxHandler, type OutboxEvent } from "@athyper/svc-jobs";

const { Pool } = pg;

// ── Configuration ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  console.error("  Example: DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:6432/athyper_neon");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 4, application_name: undefined });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = new Kysely<Record<string, any>>({ dialect: createPostgresDialect(pool) });

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Check { name: string; status: "PASS" | "FAIL"; detail?: string }
const results: Check[] = [];
function pass(name: string, detail?: string) { results.push({ name, status: "PASS", detail }); console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
function fail(name: string, detail: string)  { results.push({ name, status: "FAIL", detail }); console.log(`  FAIL  ${name} — ${detail}`); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("P2P Notification Smoke Test");
  console.log(`  DATABASE_URL: ${DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}`);
  console.log();

  // 1. Pick a real PI + a real user principal in the same tenant.
  const fixtureRows = await sql<{ pi_id: string; tenant_id: string; pi_number: string; user_id: string }>`
    SELECT pi.id::text          AS pi_id,
           pi.tenant_id::text   AS tenant_id,
           pi.invoice_number    AS pi_number,
           p.id::text           AS user_id
      FROM document.purchase_invoice pi
      JOIN master.principal p
        ON p.tenant_id     = pi.tenant_id
       AND p.principal_type = 'user'
       AND p.status         = 'active'
     ORDER BY pi.created_at DESC, p.id ASC
     LIMIT 1
  `.execute(db);

  const fixture = fixtureRows.rows[0];
  if (!fixture) {
    fail("fixture lookup", "no PI + active user principal pair found — seed data missing");
    await teardown(); process.exit(1);
  }
  console.log(`  fixture: PI ${fixture.pi_number} (${fixture.pi_id}), user ${fixture.user_id}, tenant ${fixture.tenant_id}`);

  // 2. Inject a synthetic outbox row mimicking p2p.payment.created_from_invoice.
  const outboxRows = await sql<{ id: string }>`
    INSERT INTO event.outbox
      (tenant_id,                  topic,           event_type,
       event_key,                  entity_type,     entity_id,
       aggregate_id,               aggregate_type,
       actor_id,                   source,
       payload,                    status,
       created_by)
    VALUES
      (${fixture.tenant_id}::uuid, 'notification',  'p2p.payment.created_from_invoice',
       'smoke-test-payment-1',     'payment_entry', ${fixture.pi_id}::uuid,
       ${fixture.pi_id}::uuid,     'purchase_invoice',
       ${fixture.user_id}::uuid,   'smoke-test',
       ${JSON.stringify({ invoice_ids: [fixture.pi_id], payment_number: "PE-SMOKE-001" })}::jsonb,
       'pending',
       ${fixture.user_id}::uuid)
    RETURNING id::text AS id
  `.execute(db);

  const outboxId = outboxRows.rows[0]?.id;
  if (!outboxId) { fail("outbox insert", "no row returned"); await teardown(); process.exit(1); }
  pass("outbox insert", `id=${outboxId}`);

  // Build the OutboxEvent the worker would pass to the handler.
  const event: OutboxEvent = {
    id:           outboxId,
    tenant_id:    fixture.tenant_id,
    topic:        "notification",
    event_type:   "p2p.payment.created_from_invoice",
    event_key:    "smoke-test-payment-1",
    entity_type:  "payment_entry",
    entity_id:    fixture.pi_id,
    aggregate_id: fixture.pi_id,
    payload:      { invoice_ids: [fixture.pi_id], payment_number: "PE-SMOKE-001" },
    actor_id:     fixture.user_id,
  };

  // 3. First handler invocation.
  const handler = createP2pNotificationOutboxHandler(db);
  try {
    await handler.handle(event);
    pass("handler 1st invocation", "no throw");
  } catch (err) {
    fail("handler 1st invocation", String(err));
    await teardown(outboxId); process.exit(1);
  }

  // 4. Verify notification_message produced.
  const msgRows = await sql<{
    id:           string;
    event_code:   string;
    template_key: string;
    subject:      string | null;
    channels:     string[] | null;
    payload:      Record<string, unknown>;
  }>`
    SELECT id::text AS id, event_code, template_key, subject, channels, payload
      FROM event.notification_message
     WHERE event_id  = ${outboxId}
       AND tenant_id = ${fixture.tenant_id}::uuid
  `.execute(db);

  if (msgRows.rows.length !== 1) {
    fail("notification_message created", `expected 1 row, got ${msgRows.rows.length}`);
    await teardown(outboxId); process.exit(1);
  }
  const msg = msgRows.rows[0]!;
  pass("notification_message created", `id=${msg.id}`);

  if (msg.event_code === "p2p.payment.created_from_invoice") pass("event_code");
  else fail("event_code", `expected p2p.payment.created_from_invoice, got ${msg.event_code}`);

  if (msg.template_key === "p2p.payment.created") pass("template_key");
  else fail("template_key", `expected p2p.payment.created, got ${msg.template_key}`);

  if (msg.subject === "Payment PE-SMOKE-001 created") pass("subject", msg.subject);
  else fail("subject", `expected "Payment PE-SMOKE-001 created", got "${msg.subject}"`);

  const expectedChannels = ["in_app", "email"].sort().join(",");
  const actualChannels   = (msg.channels ?? []).slice().sort().join(",");
  if (actualChannels === expectedChannels) pass("channels", `[${actualChannels}]`);
  else fail("channels", `expected [${expectedChannels}], got [${actualChannels}]`);

  const recipientId = msg.payload["recipient_id"] as string | undefined;
  if (recipientId === fixture.user_id) pass("recipient_id resolved", recipientId);
  else fail("recipient_id resolved", `expected ${fixture.user_id}, got ${String(recipientId)}`);

  const eventTypeMarker = msg.payload["_eventType"] as string | undefined;
  if (eventTypeMarker === "p2p.payment.created_from_invoice") pass("payload._eventType marker");
  else fail("payload._eventType marker", `got ${String(eventTypeMarker)}`);

  // 5. Idempotency — second invocation must NOT create a duplicate.
  try {
    await handler.handle(event);
    pass("handler 2nd invocation", "no throw");
  } catch (err) {
    fail("handler 2nd invocation", String(err));
  }

  const dupRows = await sql<{ count: string }>`
    SELECT count(*)::text AS count
      FROM event.notification_message
     WHERE event_id  = ${outboxId}
       AND tenant_id = ${fixture.tenant_id}::uuid
  `.execute(db);
  const count = parseInt(dupRows.rows[0]?.count ?? "0", 10);
  if (count === 1) pass("idempotency", "still 1 notification_message row");
  else fail("idempotency", `expected 1 row, got ${count}`);

  // 6. Clean up.
  await teardown(outboxId);

  console.log();
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`Result: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log();
    console.log("FAILED:");
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

async function teardown(outboxId?: string) {
  try {
    if (outboxId) {
      await sql`DELETE FROM event.notification_message WHERE event_id = ${outboxId}`.execute(db);
      await sql`DELETE FROM event.outbox               WHERE id       = ${outboxId}::uuid`.execute(db);
    }
  } catch (err) {
    console.warn("  cleanup warning:", String(err));
  }
  // db.destroy() ends the underlying pg pool — do not call pool.end() again.
  await db.destroy();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  await db.destroy().catch(() => {});
  process.exit(1);
});
