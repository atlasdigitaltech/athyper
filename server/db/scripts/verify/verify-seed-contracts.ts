#!/usr/bin/env tsx
/**
 * Strict live-database verifier for seed and effective P2P lifecycle contracts.
 * Runs the canonical SQL assertions with app.assert_seed_contracts=on, then
 * joins effective tenant hook metadata to the typed runtime handler manifest.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  LIFECYCLE_HOOK_HANDLER_MANIFEST,
  TRANSACTION_FLOW_HANDLER_MANIFEST,
} from "../../../packages/services/business/p2p/runtime-handler-manifest.js";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(2);
}

interface EffectiveHookRow {
  scope_tenant_id: string | null;
  lifecycle_code: string;
  from_state: string;
  to_state: string;
  action: string;
  handler_type: string | null;
  event_code: string | null;
  flow_code: string | null;
  template_id: string | null;
}

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 1, onnotice: () => undefined });
  try {
    const assertionPath = resolve(process.cwd(), "seed/platform/003_control/100_control_seed_contract_assertions.sql");
    const assertionSql = readFileSync(assertionPath, "utf8");

    await sql`select set_config('app.assert_seed_contracts', 'on', false)`;
    await sql.unsafe(assertionSql, [], { prepare: false });

    const hookRunnerSource = readFileSync(resolve(
      process.cwd(), "../packages/services/business/lifecycle/hook-runner.service.ts",
    ), "utf8");
    const dispatcherSource = readFileSync(resolve(
      process.cwd(), "../packages/services/business/p2p/transaction-flow-dispatcher.service.ts",
    ), "utf8");

    for (const [action, implementation] of Object.entries(LIFECYCLE_HOOK_HANDLER_MANIFEST)) {
      if (!hookRunnerSource.includes(`case "${action}"`)) {
        fail(`runtime hook manifest action '${action}' has no concrete switch branch`);
      }
      if (!hookRunnerSource.includes(implementation.handler)) {
        fail(`runtime hook manifest action '${action}' does not reference handler '${implementation.handler}'`);
      }
    }
    for (const [eventCode, implementation] of Object.entries(TRANSACTION_FLOW_HANDLER_MANIFEST)) {
      if (!dispatcherSource.includes(`case "${eventCode}"`)) {
        fail(`transaction event '${eventCode}' has no concrete dispatcher branch`);
      }
      for (const handler of implementation.handlers) {
        if (!dispatcherSource.includes(handler)) {
          fail(`transaction event '${eventCode}' does not reference handler '${handler}'`);
        }
      }
    }

    const rows = await sql<EffectiveHookRow[]>`
      WITH p2p_codes(code) AS (
        VALUES ('purchase_requisition'), ('purchase_order_confirmation'),
               ('delivery_note'), ('receipt'), ('service_sheet'),
               ('purchase_invoice'), ('payment_entry'), ('commitment')
      ), transitions AS (
        SELECT lt.id, lc.code AS lifecycle_code,
               fs.code AS from_state, ts.code AS to_state
          FROM control.lifecycle_transition lt
          JOIN control.lifecycle lc ON lc.id = lt.lifecycle_id
          JOIN control.lifecycle_state fs ON fs.id = lt.from_state_id
          JOIN control.lifecycle_state ts ON ts.id = lt.to_state_id
          JOIN p2p_codes pc ON pc.code = lc.code
         WHERE lc.tenant_id IS NULL AND lc.is_active
           AND lt.tenant_id IS NULL AND lt.is_active
      ), scopes AS (
        SELECT NULL::uuid AS tenant_id
        UNION SELECT id FROM master.tenant WHERE status = 'active'
        UNION SELECT tenant_id FROM control.lifecycle_transition_hook WHERE tenant_id IS NOT NULL
        UNION SELECT tenant_id FROM control.lifecycle_hook_override WHERE is_active
      ), effective_hooks AS (
        SELECT s.tenant_id AS scope_tenant_id, t.lifecycle_code, t.from_state, t.to_state,
               h.action, h.config
          FROM scopes s CROSS JOIN transitions t
          CROSS JOIN LATERAL control.resolve_effective_lifecycle_hooks(s.tenant_id, t.id) h
      )
      SELECT eh.scope_tenant_id::text, eh.lifecycle_code, eh.from_state, eh.to_state,
             eh.action, registry.handler_type,
             eh.config ->> 'event_code' AS event_code,
             eh.config ->> 'flow_code' AS flow_code,
             template.id::text AS template_id
        FROM effective_hooks eh
        LEFT JOIN LATERAL (
          SELECT r.handler_type
            FROM control.hook_action_registry r
           WHERE r.action_key = eh.action AND r.is_active
             AND (r.tenant_id IS NULL OR r.tenant_id = eh.scope_tenant_id)
           ORDER BY CASE WHEN r.tenant_id = eh.scope_tenant_id THEN 0 ELSE 1 END
           LIMIT 1
        ) registry ON true
        LEFT JOIN LATERAL (
          SELECT tft.id
            FROM control.transaction_flow_template tft
           WHERE eh.action = 'transaction_flow.dispatch'
             AND tft.event_code = eh.config ->> 'event_code'
             AND tft.flow_code = eh.config ->> 'flow_code'
             AND tft.is_active
             AND (tft.tenant_id IS NULL OR tft.tenant_id = eh.scope_tenant_id)
           ORDER BY CASE WHEN tft.tenant_id = eh.scope_tenant_id THEN 0 ELSE 1 END
           LIMIT 1
        ) template ON true
       ORDER BY eh.scope_tenant_id NULLS FIRST, eh.lifecycle_code, eh.from_state, eh.to_state, eh.action
    `;

    for (const row of rows) {
      const hook = LIFECYCLE_HOOK_HANDLER_MANIFEST[
        row.action as keyof typeof LIFECYCLE_HOOK_HANDLER_MANIFEST
      ];
      if (!hook) fail(`effective hook action '${row.action}' has no typed runtime handler`);
      if (row.handler_type !== hook.handlerType) {
        fail(`registry handler_type mismatch for '${row.action}': DB=${row.handler_type ?? "missing"}, runtime=${hook.handlerType}`);
      }
      if (row.action === "transaction_flow.dispatch") {
        if (!row.event_code || !row.flow_code || !row.template_id) {
          fail(`dispatch hook ${row.lifecycle_code} ${row.from_state}->${row.to_state} has no effective template`);
        }
        if (!(row.event_code in TRANSACTION_FLOW_HANDLER_MANIFEST)) {
          fail(`dispatch pair (${row.event_code}, ${row.flow_code}) has no typed concrete dispatcher`);
        }
      }
    }

    console.log(`PASS - strict seed assertions and ${rows.length} effective P2P hooks verified.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("verify-seed-contracts failed:", error);
  process.exit(1);
});
