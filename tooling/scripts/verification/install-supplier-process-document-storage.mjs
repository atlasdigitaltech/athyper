/** Install P4 canonical definitions for the local build. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const auditSource = readFileSync(
  "server/db/ddl/common/audit/12_reference_seed.sql",
  "utf8",
);
const audit = auditSource.slice(
  auditSource.indexOf("-- P4 shared document service audit contracts."),
  auditSource.indexOf("-- End P4 document audit contracts."),
);
const source = readFileSync(
  "server/db/ddl/planes/neon/document/07_functions.sql",
  "utf8",
);
const names = [
  "trg_process_task_subject",
  "process_case_reviewers",
  "command_process_document_job",
  "trg_process_document_domain_gates",
  "process_document_candidates",
  "trg_process_document_source_binding",
];
const functions = names.map((name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION document.${name}(`);
  if (start < 0) throw Error(name);
  return source.slice(start, source.indexOf("$$;", start) + 3);
});
const materializerSource = readFileSync(
  "server/db/ddl/planes/neon/master/07_functions.sql",
  "utf8",
);
const materializerStart = materializerSource.indexOf(
  "CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_role_case(",
);
if (materializerStart < 0) throw Error("Missing role materializer");
functions.push(
  materializerSource.slice(
    materializerStart,
    materializerSource.indexOf("$$;", materializerStart) + 3,
  ),
);
const relationshipsStart = materializerSource.indexOf(
  "CREATE OR REPLACE FUNCTION master.fn_materialize_business_partner_case_relationships()",
);
if (relationshipsStart < 0) throw Error("Missing relationship materializer");
functions.push(
  materializerSource.slice(
    relationshipsStart,
    materializerSource.indexOf("$$;", relationshipsStart) + 3,
  ),
);
const triggers = readFileSync(
  "server/db/ddl/planes/neon/document/08_triggers.sql",
  "utf8",
)
  .split("\n")
  .filter((l) => l.startsWith("CREATE TRIGGER process_document_"))
  .map((l) => l.replace("CREATE TRIGGER", "CREATE OR REPLACE TRIGGER"));
const columns = readFileSync(
  "server/db/ddl/common/governance/03_tables.sql",
  "utf8",
).match(/result jsonb, claim_token uuid,[\s\S]*?created_at timestamptz/)?.[0];
if (!columns) throw Error("Canonical job columns missing");
const additions = [
  "claim_token uuid",
  "lease_expires_at timestamptz",
  "attempt_count integer NOT NULL DEFAULT 0",
  "gate_status text NOT NULL DEFAULT 'pending' CHECK(gate_status IN('pending','succeeded','failed'))",
  "last_error text",
  "updated_at timestamptz",
];
const grants = names
  .filter((n) => !n.startsWith("trg_"))
  .map((n) => {
    const start = source.indexOf(`REVOKE ALL ON FUNCTION document.${n}(`);
    return source.slice(
      start,
      source.indexOf(";", source.indexOf("GRANT EXECUTE", start)) + 1,
    );
  });
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
    input: [
      "BEGIN;",
      ...additions.map(
        (c) =>
          `ALTER TABLE governance.process_document_job ADD COLUMN IF NOT EXISTS ${c};`,
      ),
      audit,
      ...functions,
      ...grants,
      ...triggers,
      "COMMIT;",
    ].join("\n"),
    encoding: "utf8",
  },
);
writeFileSync(
  "governance/policy/reports/supplier-process-document-storage.dev.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      functions: names,
      materializers: [
        "master.command_materialize_business_partner_role_case",
        "master.fn_materialize_business_partner_case_relationships",
      ],
      triggers: triggers.length,
      passed: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("P4 canonical document commands and gates installed.");
