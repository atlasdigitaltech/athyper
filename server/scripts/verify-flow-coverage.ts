#!/usr/bin/env tsx
/**
 * Verify Transaction Flow Coverage — Phase 10
 *
 * Asserts that every `(event_code, flow_code)` row in
 * `control.transaction_flow_template` has a handler wired in the
 * transaction-flow-dispatcher (Phase 5.3 service).
 *
 * Implementation: cross-references the seeded transaction_flow_template rows
 * against the hardcoded handler routing table mirrored from
 * server/packages/services/business/p2p/transaction-flow-dispatcher.service.ts.
 *
 * Deferred handlers (currently routed to `unsupported`) are listed below and
 * are considered acceptable misses for v1. Anything outside that list is a
 * coverage gap.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-flow-coverage.ts
 *
 * Exit code:
 *   0 — every active event_code is either handled or on the deferred list
 *   1 — at least one event_code is unhandled and not deferred
 */

import pg from "pg";

const { Pool } = pg;
const JSON_OUTPUT = process.argv.includes("--json");
const DATABASE_URL = process.env["DATABASE_URL"];

// Mirror of the switch statement in transaction-flow-dispatcher.service.ts
const HANDLED_EVENT_CODES = new Set<string>([
  "ORDER_APPROVAL",   // → commitment-approve
  "FULFILLMENT",      // → receipt-posting | service-sheet-posting
  "INVOICE_MATCHED",  // → invoice-posting
  "INVOICE_RECEIVED", // → invoice-posting
  "SETTLEMENT",       // → payment-posting
]);

// Explicitly deferred (dispatcher returns kind='unsupported' with a reason)
const DEFERRED_EVENT_CODES = new Set<string>([
  "ORDER_CREATION",   // PR approve → budget_reserve — needs state snapshots
  "RELEASE",          // PO cancel/short_close → budget_release — needs state snapshots
  "REVERSAL",         // reversal handlers deferred
]);

interface FlowTemplate {
  event_code: string;
  flow_code:  string;
  is_active:  boolean;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const result = await pool.query<FlowTemplate>(`
      SELECT event_code, flow_code, is_active
        FROM control.transaction_flow_template
       WHERE is_active = true
       ORDER BY event_code, flow_code
    `);

    const eventCodes = new Set(result.rows.map((r) => r.event_code));
    const unhandled  = [...eventCodes].filter(
      (ec) => !HANDLED_EVENT_CODES.has(ec) && !DEFERRED_EVENT_CODES.has(ec),
    );
    const deferred   = [...eventCodes].filter((ec) => DEFERRED_EVENT_CODES.has(ec));
    const handled    = [...eventCodes].filter((ec) => HANDLED_EVENT_CODES.has(ec));

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({
        ok:                  unhandled.length === 0,
        template_rows:       result.rows.length,
        unique_event_codes:  eventCodes.size,
        handled,
        deferred,
        unhandled,
      }, null, 2));
    } else {
      console.log(`Transaction flow coverage`);
      console.log(`  Template rows:      ${result.rows.length}`);
      console.log(`  Unique event_codes: ${eventCodes.size}`);
      console.log(`  Handled:            ${handled.length} (${handled.join(", ") || "—"})`);
      console.log(`  Deferred (v1):      ${deferred.length} (${deferred.join(", ") || "—"})`);
      if (unhandled.length === 0) {
        console.log("✓ pass — every active event_code is handled or explicitly deferred");
      } else {
        console.error(`✗ FAIL — ${unhandled.length} unhandled event_code(s): ${unhandled.join(", ")}`);
        console.error(`\nHint: add the route in server/packages/services/business/p2p/transaction-flow-dispatcher.service.ts`);
      }
    }

    process.exit(unhandled.length === 0 ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
