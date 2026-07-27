#!/usr/bin/env tsx
/**
 * Static Atlas persistence security contract.
 *
 * This runs without a database and prevents accidental removal of the
 * fail-closed scope, composite keys, idempotency, and immutability controls.
 * Runtime RLS behavior is covered by verify-atlas-conversation-rls.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(dbRoot, path), "utf8");

const masterTables = read("ddl/master/01y_tables_atlas_conversation.sql");
const eventTables = read("ddl/event/01e_tables_atlas_run.sql");
const constraints = read("ddl/master/03_zz_atlas_conversation_constraints.sql");
const functions = read("ddl/master/05_zz_atlas_conversation_functions.sql");
const triggers = read("ddl/master/06_zz_atlas_conversation_triggers.sql");
const rls = read("ddl/master/08_zz_atlas_conversation_rls.sql");
const security = read("ddl/security/800_security_hardening.sql");
const roles = read("ddl/000_bootstrap/000_roles.sql");
const conversationTypes = read(
  "seed/platform/000_lookups/LookupDomain/master/conversation_type.sql",
);
const prisma = read("../packages/adapters/db/src/prisma/schema.prisma");

const checks: Array<[string, boolean]> = [
  ["master.atlas_thread exists", /CREATE TABLE IF NOT EXISTS master\.atlas_thread/.test(masterTables)],
  ["master.atlas_message exists", /CREATE TABLE IF NOT EXISTS master\.atlas_message/.test(masterTables)],
  ["event.atlas_run exists", /CREATE TABLE IF NOT EXISTS event\.atlas_run/.test(eventTables)],
  ["thread plane is constrained", /plane IN \('neon', 'mesh', 'admin'\)/.test(masterTables)],
  ["message terminal lifecycle is constrained", /atlas_message_terminal_chk/.test(masterTables)],
  ["protected and inline content cannot coexist", /atlas_message_content_storage_chk[\s\S]*protected_content_ref IS NULL[\s\S]*content_blocks = '\[\]'::jsonb/.test(masterTables)],
  ["tenant idempotency is unique", /UNIQUE \(tenant_id, client_request_id\)/.test(eventTables)],
  ["only one started run per thread", /atlas_run_one_started_per_thread_uq[\s\S]*WHERE status = 'started'/.test(read("ddl/master/04_zz_atlas_conversation_indexes.sql"))],
  ["message/run scope FK is composite", /FOREIGN KEY \(tenant_id, conversation_id, plane, run_id\)/.test(constraints)],
  ["run/input scope FK is composite", /FOREIGN KEY \(tenant_id, conversation_id, plane, input_message_id\)/.test(constraints)],
  ["circular links are deferred", (constraints.match(/DEFERRABLE INITIALLY DEFERRED/g)?.length ?? 0) >= 4],
  ["access requires principal scope", /app\.current_principal_id/.test(functions)],
  ["access requires explicit Atlas plane", /app\.current_atlas_plane/.test(functions)],
  ["revoked participants are excluded", /cp\.left_at IS NULL/.test(functions)],
  ["access helper disables recursive RLS", /SET row_security = off/.test(functions)],
  ["terminal messages are immutable", /terminal messages are immutable/.test(triggers)],
  ["terminal runs allow only metering reconciliation", /terminal runs are immutable except one-time metering reconciliation/.test(triggers)],
  ["run principal must be the immutable thread owner", /only the immutable thread owner may create a run/.test(triggers)],
  ["a second active Atlas owner is rejected", /an Atlas thread has exactly one active owner/.test(triggers)],
  ["message sequence is database allocated", /last_message_sequence = last_message_sequence \+ 1/.test(triggers)],
  ["sequence allocator requires thread ownership", /trg_allocate_atlas_message_sequence[\s\S]*?fn_atlas_conversation_access\([\s\S]*?true[\s\S]*?\)/.test(triggers)],
  ["thread RLS is forced", /ALTER TABLE master\.atlas_thread FORCE ROW LEVEL SECURITY/.test(rls)],
  ["message RLS is forced", /ALTER TABLE master\.atlas_message FORCE ROW LEVEL SECURITY/.test(rls)],
  ["run RLS is forced", /ALTER TABLE event\.atlas_run FORCE ROW LEVEL SECURITY/.test(rls)],
  ["generic Atlas envelope is participant-aware", /type <> 'atlas_agent'[\s\S]*fn_atlas_conversation_access/.test(rls)],
  ["generic conversation DML grant is Atlas-restricted", (rls.match(/CREATE POLICY atlas_app_(?:insert|update)_scope/g)?.length ?? 0) === 4],
  ["participants are read-only for messages and runs", (rls.match(/CREATE POLICY tenant_(?:insert|update) ON (?:master\.atlas_message|event\.atlas_run)[\s\S]*?fn_atlas_conversation_access\([\s\S]*?true[\s\S]*?\)/g)?.length ?? 0) === 4],
  ["no tenant Atlas hard-delete policy exists", !/CREATE POLICY tenant_delete ON (master\.atlas_thread|master\.atlas_message|event\.atlas_run)/.test(rls)],
  ["application has no Atlas DELETE grant", !/GRANT[^;]*DELETE[^;]*(atlas_thread|atlas_message|atlas_run)/s.test(security)],
  ["separate Atlas maintenance role exists", /CREATE ROLE athyperadmin_atlas_maintenance NOLOGIN NOINHERIT/.test(roles)],
  ["maintenance role is not the application role", /NOT pg_has_role\(current_user, 'athyperapp'/.test(read("../packages/services/ai/conversation/sql-atlas-thread.repository.ts"))],
  ["maintenance has no direct message/run privilege", /REVOKE ALL ON master\.atlas_message[\s\S]*REVOKE ALL ON event\.atlas_run[\s\S]*athyperadmin_atlas_maintenance/.test(security)],
  ["security helper PUBLIC execute is revoked", /REVOKE EXECUTE ON FUNCTION master\.fn_atlas_conversation_access/.test(security)],
  ["atlas_agent lookup is seeded", /\('atlas_agent', 'Atlas Agent'/.test(conversationTypes)],
  ["Prisma atlas_thread model exists", /model atlas_thread \{/.test(prisma)],
  ["Prisma atlas_message model exists", /model atlas_message \{/.test(prisma)],
  ["Prisma atlas_run model exists", /model atlas_run \{/.test(prisma)],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

if (failures.length > 0) {
  console.error(`Atlas persistence contract failed: ${failures.length} check(s).`);
  process.exit(1);
}

console.log(`Atlas persistence contract passed: ${checks.length} checks.`);
