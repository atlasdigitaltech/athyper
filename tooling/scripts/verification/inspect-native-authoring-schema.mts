/** Read-only DEV schema candidate. It never installs its captured hash as
 * approved evidence, grants product writes or enrolls an authoring source. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const { Kysely, PostgresDialect } = createRequire(
  new URL(
    "../../../server/packages/planes/studio/meta-entity-authoring/package.json",
    import.meta.url,
  ),
)("kysely");
import {
  canonicalNativeSchemaQuery,
  nativeSchemaBlockers,
  nativeSchemaFingerprint,
  type NativeSchemaInspection,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/native-schema-qualification.js";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!,
    value = args[i + 1];
  if (
    !["--container", "--database", "--application-role", "--output"].includes(
      key,
    ) ||
    options.has(key) ||
    !value ||
    value.startsWith("--")
  )
    throw Error("NATIVE_SCHEMA_INSPECTION_OPTION_INVALID");
  options.set(key, value);
}
const container = options.get("--container") ?? "athyper-dev-db-1";
const database = options.get("--database") ?? "athyper_studio";
const role = options.get("--application-role") ?? "athyper_runtime";
const output = options.get("--output");
if (!output)
  throw Error("Use --output to retain the read-only inspection candidate");
for (const v of [container, database, role])
  if (!/^[a-zA-Z0-9_-]+$/.test(v))
    throw Error("NATIVE_SCHEMA_INSPECTION_COORDINATE_INVALID");
// Compile the production query. No network connection or credentials are used
// by this dialect; psql executes the exact SQL in an explicit read-only block.
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: {
      connect: async () => {
        throw Error("COMPILATION_ONLY");
      },
      end: async () => {},
    },
  }),
});
const compiled = canonicalNativeSchemaQuery(role).compile(db);
const literal = (value: unknown): string => {
  if (typeof value === "string") return "'" + value.replaceAll("'", "''") + "'";
  if (Array.isArray(value) && value.every((v) => typeof v === "string"))
    return "ARRAY[" + value.map(literal).join(",") + "]::text[]";
  throw Error("NATIVE_SCHEMA_QUERY_PARAMETER_INVALID");
};
const query = `BEGIN READ ONLY; PREPARE native_schema_inspection AS ${compiled.sql}; EXECUTE native_schema_inspection(${compiled.parameters.map(literal).join(",")}); ROLLBACK;`;
const raw = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    database,
  ],
  { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
const evidence: NativeSchemaInspection = JSON.parse(raw.trim());
if (evidence.database !== database || evidence.applicationRole !== role)
  throw Error("NATIVE_SCHEMA_INSPECTION_RESULT_MISMATCH");
const report = {
  schema: "entity.native-schema-inspection/1",
  inspectedAt: new Date().toISOString(),
  schemaHash: nativeSchemaFingerprint(evidence),
  evidence,
  blockers: nativeSchemaBlockers(evidence),
  qualification: "not-established",
  productionEnabled: false,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    schemaHash: report.schemaHash,
    blockerCount: report.blockers.length,
    qualification: report.qualification,
    productionEnabled: false,
  }),
);
await db.destroy();
