#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2), baselinePath = args.find(a => a.startsWith("--baseline="))?.slice(11);
if (!baselinePath || args.length !== 2 || !args.includes("--confirm=DEV-ENTITY-SUCCESSOR-GUARDS"))
  throw Error("Use --baseline=<captured JSON> --confirm=DEV-ENTITY-SUCCESSOR-GUARDS");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (baseline.schema !== "athyper.dev-publication-successor-baseline/1" || baseline.targets.length !== 3) throw Error("BASELINE_REQUIRED");
const c = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
if (c.Config.Labels["com.docker.compose.project"] !== "athyper-dev" || !c.State.Running) throw Error("DEV_DATABASE_REQUIRED");
const lit = v => `'${String(v).replaceAll("'", "''")}'`;
const run = (plane, input) => {
  if (!["studio", "neon", "mesh"].includes(plane)) throw Error("TARGET_INVALID");
  return execFileSync("docker", ["exec", "-i", "athyper-dev-db-1", "sh", "-c", `exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
};
const source = readFileSync(new URL("../../../ddl/common/runtime_meta/07_functions.sql", import.meta.url), "utf8");
const activation = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_activate_release("), source.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_rollback_release("));
if (!activation.includes("RELEASE_PREDECESSOR_CHANGED")) throw Error("ACTIVATION_GUARD_REQUIRED");
const commands = ["15_system_entity_commands.sql", "17_system_entity_successor.sql"].map(file => readFileSync(new URL(`../../../ddl/planes/studio/publication/${file}`, import.meta.url), "utf8")).join("\n");
const receipts = [];
for (const target of baseline.targets) {
  const ddl = (target.plane === "studio" ? commands : "") + "\n" + activation;
  const check = `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE publication_key=${lit(target.head.publication_key)}
    AND applied_release_id=${lit(target.head.applied_release_id)}::uuid AND artifact_hash=${lit(target.head.artifact_hash)}
    AND row_version=${Number(target.head.row_version)}) THEN RAISE EXCEPTION 'BASELINE_HEAD_CHANGED'; END IF; END $$;`;
  // Each target commits independently. No deployment/activation or approval is
  // created. Head locking keeps the captured baseline stable during migration.
  run(target.plane, `BEGIN; SET LOCAL lock_timeout='5s';
    DO $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(${lit(target.head.publication_key)},0)); END $$;
    ${check} ${ddl} ${check} COMMIT;`);
  const receipt = { plane: target.plane, ddlSha256: createHash("sha256").update(ddl).digest("hex"),
    appliedReleaseId: target.head.applied_release_id, headVersion: target.head.row_version, headUnchanged: true };
  receipts.push(receipt); console.log(JSON.stringify({ schema: "athyper.dev-successor-function-install/1", installedAt: new Date().toISOString(), ...receipt }));
}
console.log(JSON.stringify({ targets: receipts.length, approvalCreated: false, releaseCreated: false, activated: false }));
