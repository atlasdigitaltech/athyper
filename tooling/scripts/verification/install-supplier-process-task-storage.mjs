/** Install P3 canonical functions/indexes/triggers in local DEV; no migration or fixture edits. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const prefix = "server/db/ddl/planes/neon/document/";
const source = readFileSync(prefix + "07_functions.sql", "utf8");
const functions = [
  "command_entity_case_lifecycle",
  "trg_supplier_task_execution_binding",
  "trg_supplier_task_work_item_binding",
  "trg_supplier_task_completion_quorum",
].map((name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`);
  if (start < 0) throw Error(name);
  return source.slice(start, source.indexOf("$$;", start) + 3);
});
const indexes = readFileSync(prefix + "06_indexes.sql", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("CREATE UNIQUE INDEX supplier_task_"))
  .map((l) =>
    l.replace("CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS"),
  );
const triggers = readFileSync(prefix + "08_triggers.sql", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("CREATE TRIGGER supplier_task_"))
  .map((l) => l.replace("CREATE TRIGGER", "CREATE OR REPLACE TRIGGER"));
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  {
    input: ["BEGIN;", ...functions, ...indexes, ...triggers, "COMMIT;"].join(
      "\n",
    ),
    encoding: "utf8",
  },
);
writeFileSync(
  "governance/policy/reports/supplier-process-task-storage.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      functions: functions.length,
      indexes: indexes.length,
      triggers: triggers.length,
      source: "canonical DDL",
      passed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("P3 canonical database guards installed.");
