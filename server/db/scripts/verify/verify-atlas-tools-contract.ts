#!/usr/bin/env tsx
/**
 * Static Phase 7C governed-tool persistence and security contract.
 *
 * Runs without a database. Behavioral RLS/lifecycle coverage lives in
 * verify-atlas-tools-rls.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(dbRoot, path), "utf8");

const table = read("ddl/event/01f_tables_ai_tool_invocation.sql");
const constraints = read("ddl/event/03c_constraints_ai_tool_invocation.sql");
const indexes = read("ddl/event/04c_indexes_ai_tool_invocation.sql");
const triggers = read("ddl/event/06c_triggers_ai_tool_invocation.sql");
const rls = read("ddl/event/08c_rls_ai_tool_invocation.sql");
const security = read("ddl/security/800_security_hardening.sql");
const prisma = read("../packages/adapters/db/src/prisma/schema.prisma");

const checks: Array<[string, boolean]> = [
  [
    "event.ai_tool_invocation exists",
    /CREATE TABLE IF NOT EXISTS event\.ai_tool_invocation/.test(table),
  ],
  [
    "tool call is unique within a tenant run",
    /UNIQUE \(tenant_id, run_id, tool_call_id\)/.test(table),
  ],
  [
    "tool names match the canonical provider-safe identifier",
    /tool_code ~ '\^\[A-Za-z0-9_-\]\{1,128\}\$'/.test(table),
  ],
  [
    "run relation is tenant/thread/plane scoped",
    /FOREIGN KEY \(tenant_id, thread_id, plane, run_id\)[\s\S]*REFERENCES event\.atlas_run \(tenant_id, conversation_id, plane, id\)/.test(
      constraints,
    ),
  ],
  [
    "thread relation is tenant/plane scoped",
    /FOREIGN KEY \(tenant_id, thread_id, plane\)[\s\S]*REFERENCES master\.atlas_thread \(tenant_id, conversation_id, plane\)/.test(
      constraints,
    ),
  ],
  [
    "principal relations are tenant scoped",
    (constraints.match(/FOREIGN KEY \(tenant_id, (?:principal_id|confirmation_actor_id|created_by|updated_by)\)/g)?.length ??
      0) === 4,
  ],
  [
    "operation classes are closed",
    /operation_class IN \('unresolved', 'read', 'propose', 'mutate'\)/.test(
      table,
    ),
  ],
  [
    "risk classes are closed",
    /risk_class IN \('unknown', 'low', 'medium', 'high', 'critical'\)/.test(
      table,
    ),
  ],
  [
    "autonomy decisions are closed",
    [
      "not_evaluated",
      "denied",
      "suggest",
      "assist",
      "auto",
    ].every((decision) => table.includes(`'${decision}'`)),
  ],
  [
    "lifecycle states are closed",
    [
      "proposed",
      "confirmed",
      "executing",
      "completed",
      "denied",
      "failed",
      "expired",
      "cancelled",
    ].every((status) => table.includes(`'${status}'`)),
  ],
  [
    "input is represented only by a SHA-256 hash",
    /input_hash IS NULL[\s\S]*input_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(table) &&
      !/raw_(?:input|arguments)|tool_arguments|argument_blocks/i.test(table),
  ],
  [
    "result is represented only by a SHA-256 hash",
    /result_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(table) &&
      !/raw_result|result_payload|output_blocks/i.test(table),
  ],
  [
    "authorization snapshots are mandatory non-empty objects",
    (table.match(/jsonb_typeof\((?:permission|policy|profile)_snapshot\) = 'object'/g)
      ?.length ?? 0) === 3 &&
      (table.match(/(?:permission|policy|profile)_snapshot <> '\{\}'::jsonb/g)
        ?.length ?? 0) === 3,
  ],
  [
    "authorization and evidence JSON are size bounded",
    /ai_tool_invocation_bounded_json_chk[\s\S]*permission_snapshot::text\) <= 32768[\s\S]*execution_guard_snapshot::text\) <= 32768[\s\S]*evidence_refs::text\) <= 65536/.test(
      table,
    ),
  ],
  [
    "execution recheck snapshot and auth epoch are durable",
    /execution_guard_snapshot/.test(table) &&
      /execution_auth_epoch/.test(table) &&
      /execution_policy_revision/.test(table),
  ],
  [
    "execution requires resolved tool version and action code",
    /status NOT IN \('executing', 'completed'\)[\s\S]*tool_version IS NOT NULL[\s\S]*action_code IS NOT NULL/.test(
      table,
    ),
  ],
  [
    "confirmed rows are authorized confirmation-required proposals",
    /ai_tool_invocation_confirmed_state_chk[\s\S]*status <> 'confirmed'[\s\S]*confirmation_required = true[\s\S]*operation_class <> 'unresolved'[\s\S]*autonomy_decision IN \('suggest', 'assist', 'auto'\)[\s\S]*input_hash IS NOT NULL/.test(
      table,
    ),
  ],
  [
    "confirmation token is hash-only",
    /confirmation_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(table) &&
      !/\bconfirmation_token\s+(?:text|jsonb|bytea)/i.test(table),
  ],
  [
    "confirmation hashes cannot be replayed within a tenant",
    /ai_tool_invocation_confirmation_hash_uq[\s\S]*\(tenant_id, confirmation_token_hash\)[\s\S]*WHERE confirmation_token_hash IS NOT NULL/.test(
      indexes,
    ),
  ],
  [
    "mutations require confirmation and non-auto autonomy",
    /operation_class <> 'mutate'[\s\S]*confirmation_required = true[\s\S]*autonomy_decision IN \('suggest', 'assist'\)/.test(
      table,
    ),
  ],
  [
    "executing mutations require a downstream idempotency key",
    /operation_class <> 'mutate'[\s\S]*executing_at IS NULL[\s\S]*downstream_command_idempotency_key IS NOT NULL/.test(
      table,
    ),
  ],
  [
    "downstream idempotency keys are tenant unique",
    /ai_tool_invocation_downstream_idempotency_uq[\s\S]*\(tenant_id, downstream_command_idempotency_key\)/.test(
      indexes,
    ),
  ],
  [
    "evidence is stored as references only",
    /evidence_refs[\s\S]*jsonb_typeof\(evidence_refs\) = 'array'/.test(table),
  ],
  [
    "business transaction correlation is durable",
    /business_transaction_type/.test(table) &&
      /business_transaction_id/.test(table),
  ],
  [
    "every terminal transition records bounded duration",
    /ai_tool_invocation_duration_state_chk[\s\S]*status IN \('completed', 'denied', 'failed', 'expired', 'cancelled'\)[\s\S]*duration_ms IS NOT NULL[\s\S]*duration_ms >= 0/.test(
      table,
    ),
  ],
  [
    "proposal identity is immutable",
    /scope, call identity, input hash, and creation fields are immutable/.test(
      triggers,
    ),
  ],
  [
    "authorization resolution fields change at most once",
    /authorization resolution fields change at most once/.test(triggers) &&
      /v_is_resolution/.test(triggers),
  ],
  [
    "transition graph is explicitly bounded",
    /OLD\.status = 'proposed'[\s\S]*OLD\.status = 'confirmed'[\s\S]*OLD\.status = 'executing'/.test(
      triggers,
    ),
  ],
  [
    "terminal rows are immutable",
    /terminal invocations are immutable/.test(triggers),
  ],
  [
    "run ownership is revalidated on insert",
    /proposal principal must own the Atlas run/.test(triggers) &&
      /tool proposals require an active Atlas run/.test(triggers),
  ],
  [
    "confirmation actor is bound to verified audit actor",
    /confirmation actor must match the transition audit actor/.test(triggers) &&
      /audit actor must match the verified request principal/.test(triggers),
  ],
  [
    "dual control rejects self-confirmation",
    /dual control requires a different confirmation actor/.test(triggers),
  ],
  [
    "RLS is enabled and forced",
    /ALTER TABLE event\.ai_tool_invocation ENABLE ROW LEVEL SECURITY/.test(rls) &&
      /ALTER TABLE event\.ai_tool_invocation FORCE ROW LEVEL SECURITY/.test(
        rls,
      ),
  ],
  [
    "tenant reads and writes require immutable owner access",
    (rls.match(/fn_atlas_conversation_access\([\s\S]*?true[\s\S]*?\)/g)
      ?.length ?? 0) >= 4,
  ],
  [
    "tenant scope includes principal and plane",
    /app\.current_principal_id/.test(rls) &&
      /app\.current_atlas_plane/.test(rls),
  ],
  [
    "no tenant delete policy exists",
    !/CREATE POLICY tenant_delete ON event\.ai_tool_invocation/.test(rls),
  ],
  [
    "application receives insert/update but no delete grant",
    /GRANT INSERT, UPDATE ON[\s\S]*event\.ai_tool_invocation[\s\S]*TO athyperapp/.test(
      security,
    ) &&
      !/GRANT[^;]*DELETE[^;]*event\.ai_tool_invocation/s.test(security),
  ],
  [
    "trigger functions are not publicly executable",
    /REVOKE EXECUTE ON FUNCTION event\.trg_validate_ai_tool_invocation_insert\(\)[\s\S]*FROM PUBLIC/.test(
      security,
    ) &&
      /REVOKE EXECUTE ON FUNCTION event\.trg_guard_ai_tool_invocation_mutation\(\)[\s\S]*FROM PUBLIC/.test(
        security,
      ),
  ],
  [
    "Prisma tool invocation model exists",
    /model ai_tool_invocation \{/.test(prisma),
  ],
  [
    "Prisma run and thread relations are composite scoped",
    /run\s+atlas_run\s+@relation\(fields: \[tenant_id, thread_id, plane, run_id\]/.test(
      prisma,
    ) &&
      /thread\s+atlas_thread\s+@relation\(fields: \[tenant_id, thread_id, plane\]/.test(
        prisma,
      ),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

if (failures.length > 0) {
  console.error(
    `Atlas governed-tool database contract failed: ${failures.length} check(s).`,
  );
  process.exit(1);
}

console.log(
  `Atlas governed-tool database contract passed: ${checks.length} checks.`,
);
