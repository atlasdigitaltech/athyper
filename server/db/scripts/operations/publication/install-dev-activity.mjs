import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

// Additive local DEV rollout only. Does not enroll policies, grant user roles,
// publish an entity, or modify record data.
if (process.argv.slice(2).join() !== "--confirm=DEV-INSTALL-ACTIVITY") throw Error("Use --confirm=DEV-INSTALL-ACTIVITY");
const container = "athyper-dev-db-1";
const info = JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0];
if (!info.State.Running || info.Config.Labels["com.docker.compose.project"] !== "athyper-dev") throw Error("DEV_DATABASE_REQUIRED");
const run = (plane, input) => execFileSync("docker",["exec","-i",container,"sh","-c",`exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_${plane} -v ON_ERROR_STOP=1`],{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const receipts = [];
for (const plane of ["studio","neon","mesh"]) {
  const migrations = [...(plane === "studio" ? ["20260928_entity_activity_authoring.sql"] : []),"20260928_entity_activity_permissions.sql","20260928_record_history.sql"];
  for (const file of migrations) {
    const source = readFileSync(new URL(`../../../migrations/${file}`,import.meta.url),"utf8");
    if (file === "20260928_record_history.sql" && run(plane,"SELECT to_regclass('snapshot.record_version') IS NOT NULL;").trim() === "t") {
      // Never mark an unknown pre-existing schema as migrated.
      const check = run(plane,"SELECT count(*) FROM pg_constraint WHERE conrelid='snapshot.record_version'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%aggregate%' AND pg_get_constraintdef(oid) LIKE '%domain%' AND pg_get_constraintdef(oid) LIKE '%delete%';").trim();
      if (check !== "1") throw Error(`ACTIVITY_EXISTING_HISTORY_SCHEMA_CONFLICT:${plane}`);
      receipts.push({plane,file,status:"already-present",sha256:createHash("sha256").update(source).digest("hex")});
      continue;
    }
    run(plane,`SET app.database_plane='${plane}'; SET lock_timeout='5s';\n${source}`);
    receipts.push({plane,file,status:"installed",sha256:createHash("sha256").update(source).digest("hex")});
  }
}
console.log(JSON.stringify({schema:"athyper.dev-activity-install/1",at:new Date().toISOString(),receipts,entityPublished:false,roleGrantsCreated:false},null,2));
