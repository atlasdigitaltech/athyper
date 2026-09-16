/** Direct local canonical function publication; no migration or guard bypass. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const source = readFileSync(
  "server/db/ddl/planes/neon/document/07_functions.sql",
  "utf8",
);
const start = source.indexOf(
  "CREATE OR REPLACE FUNCTION document.command_entity_case_lifecycle(",
);
if (start < 0) throw Error("Canonical lifecycle function missing");
const definition = source.slice(start, source.indexOf("$$;", start) + 3);
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: `BEGIN;\n${definition}\nCOMMIT;`, stdio: ["pipe", "pipe", "pipe"] },
);
console.log(
  "Published canonical case lifecycle function; run pins remain immutable.",
);
