/** Direct local DEV build from canonical P5 definitions; no migration package. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const extract = (path, schema, names) => {
  const source = readFileSync(path, "utf8");
  return names.map((name) => {
    const start = source.indexOf(
      `CREATE OR REPLACE FUNCTION ${schema}.${name}(`,
    );
    if (start < 0) throw Error(name);
    return source.slice(start, source.indexOf("$$;", start) + 3);
  });
};
const definitions = [
  ...extract("server/db/ddl/common/governance/07_functions.sql", "governance", [
    "trg_process_task_document_gate",
    "trg_validate_process_attempt",
  ]),
  ...extract(
    "server/db/ddl/planes/neon/document/07_functions.sql",
    "document",
    [
      "command_entity_case_lifecycle",
      "trg_supplier_task_execution_binding",
      "trg_supplier_task_completion_quorum",
      "trg_supplier_task_work_item_binding",
      "command_process_document_job",
      "process_document_candidates",
    ],
  ),
];
const ddl = `ALTER TABLE governance.cycle_task ADD COLUMN IF NOT EXISTS process_attempt_id uuid;
DO $$ DECLARE item record; BEGIN FOR item IN SELECT a.* FROM governance.process_attempt a LOOP PERFORM set_config('app.current_principal_id',item.created_by::text,true); UPDATE governance.cycle_task t SET process_attempt_id=item.id WHERE t.tenant_id=item.tenant_id AND t.cycle_run_id=item.cycle_run_id AND t.process_attempt_id IS NULL; END LOOP; END $$;
ALTER TABLE governance.cycle_task DROP CONSTRAINT cycle_task_run_template_uq;
ALTER TABLE governance.cycle_task ADD CONSTRAINT cycle_task_run_template_uq UNIQUE NULLS NOT DISTINCT(tenant_id,cycle_run_id,task_template_id,process_attempt_id);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='governance.cycle_task'::regclass AND conname='cycle_task_process_attempt_fk') THEN ALTER TABLE governance.cycle_task ADD CONSTRAINT cycle_task_process_attempt_fk FOREIGN KEY(tenant_id,process_attempt_id) REFERENCES governance.process_attempt(tenant_id,id) DEFERRABLE INITIALLY DEFERRED; END IF; END $$;`;
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
    input: ["BEGIN;", ddl, ...definitions, "COMMIT;"].join("\n"),
    encoding: "utf8",
  },
);
writeFileSync(
  "governance/policy/reports/supplier-process-correction-storage.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      source: "canonical DDL",
      functions: definitions.length,
      passed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("P5 canonical correction definitions installed.");
