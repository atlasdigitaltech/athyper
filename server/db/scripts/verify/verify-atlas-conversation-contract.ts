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
const grants = read("ddl/common/ai/11_grants.sql");
const neonManifest = read("ddl/planes/neon/_manifest.txt");
const meshManifest = read("ddl/planes/mesh/_manifest.txt");
const athyperManifest = read("ddl/planes/athyper/_manifest.txt");
const prisma = read("../packages/adapters/db/src/prisma/schema.prisma");

const checks: Array<[string, boolean]> = [
  ["ai.atlas_thread exists", /CREATE TABLE "ai"[.]"atlas_thread"/.test(tables)],
  ["ai.atlas_message exists", /CREATE TABLE "ai"[.]"atlas_message"/.test(tables)],
  ["ai.atlas_run exists", /CREATE TABLE "ai"[.]"atlas_run"/.test(tables)],
  ["message/run scope FK is composite", /FOREIGN KEY \(tenant_id, conversation_id, plane, run_id\)/.test(constraints)],
  ["run/input scope FK is composite", /FOREIGN KEY \(tenant_id, conversation_id, plane, input_message_id\)/.test(constraints)],
  ["circular links are deferred", (constraints.match(/DEFERRABLE INITIALLY DEFERRED/g)?.length ?? 0) >= 4],
  ["tenant knowledge FKs are composite", /FOREIGN KEY \(tenant_id, revision_id\)/.test(constraints) && /FOREIGN KEY \(tenant_id, source_id\)/.test(constraints)],
  ["only one started run per thread", /atlas_run_one_started_per_thread_uq[\s\S]*WHERE status = 'started'/.test(indexes)],
  ["access requires principal and plane scope", /app[.]current_principal_id/.test(functions) && /app[.]current_atlas_plane/.test(functions)],
  ["message sequence is database allocated", /last_message_sequence = last_message_sequence \+ 1/.test(functions)],
  ["terminal messages are immutable", /terminal messages are immutable/.test(functions)],
  ["thread and message RLS are forced", /ALTER TABLE "ai"[.]"atlas_thread" FORCE ROW LEVEL SECURITY/.test(rls) && /ALTER TABLE "ai"[.]"atlas_message" FORCE ROW LEVEL SECURITY/.test(rls)],
  ["application has no Atlas DELETE grant", !/GRANT DELETE ON TABLE "ai"[.]"atlas_(?:thread|message|run)" TO athyperapp/.test(grants)],
  ["all plane manifests include common AI", [neonManifest, meshManifest, athyperManifest].every((manifest) => manifest.includes("common/ai/03_tables.sql"))],
  ["Prisma uses the AI schema", /model atlas_thread \{[\s\S]*?@@schema\("ai"\)/.test(prisma) && /model atlas_run \{[\s\S]*?@@schema\("ai"\)/.test(prisma)],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
if (failures.length) {
  console.error(`Atlas persistence contract failed: ${failures.length} check(s).`);
  process.exit(1);
}
console.log(`Atlas persistence contract passed: ${checks.length} checks.`);
