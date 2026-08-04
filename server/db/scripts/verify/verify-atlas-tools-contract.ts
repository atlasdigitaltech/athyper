#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(dbRoot, path), "utf8");
const tables = read("ddl/common/ai/03_tables.sql");
const constraints = read("ddl/common/ai/05_constraints.sql");
const indexes = read("ddl/common/ai/06_indexes.sql");
const functions = read("ddl/common/ai/07_functions.sql");
const triggers = read("ddl/common/ai/08_triggers.sql");
const rls = read("ddl/common/ai/10_rls.sql");
const prisma = read("../packages/adapters/db/src/prisma/schema.prisma");

const checks: Array<[string, boolean]> = [
  ["ai.ai_tool_invocation exists", /CREATE TABLE "ai"[.]"ai_tool_invocation"/.test(tables)],
  ["tool call is unique within a tenant run", /UNIQUE \(tenant_id, run_id, tool_call_id\)/.test(constraints)],
  ["run relation is tenant/thread/plane scoped", /FOREIGN KEY \(tenant_id, thread_id, plane, run_id\)[\s\S]*REFERENCES ai[.]atlas_run/.test(constraints)],
  ["thread relation is tenant/plane scoped", /FOREIGN KEY \(tenant_id, thread_id, plane\)[\s\S]*REFERENCES ai[.]atlas_thread/.test(constraints)],
  ["downstream execution is idempotent", /ai_tool_invocation_downstream_idempotency_uq/.test(indexes)],
  ["terminal invocations are immutable", /terminal invocations are immutable/.test(functions)],
  ["insert and mutation guards are installed", /trg_ai_tool_invocation_insert_guard/.test(triggers) && /trg_ai_tool_invocation_mutation_guard/.test(triggers)],
  ["tool invocation RLS is forced", /ALTER TABLE "ai"[.]"ai_tool_invocation" FORCE ROW LEVEL SECURITY/.test(rls)],
  ["application has bounded DML policies", /tenant_insert/.test(rls) && /tenant_read/.test(rls) && /tenant_update/.test(rls)],
  ["Prisma uses the AI schema", /model ai_tool_invocation \{[\s\S]*?@@schema\("ai"\)/.test(prisma)],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
if (failures.length) {
  console.error(`Atlas governed-tool contract failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log(`Atlas governed-tool contract passed: ${checks.length} checks.`);
