/** Read-only application-login schema probe; no authoring admission or writes. */
import { readFile } from "node:fs/promises";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import {
  inspectCanonicalNativeSchema,
  nativeSchemaFingerprint,
  nativeSchemaBlockers,
} from "@athyper/server-plane-studio-meta-entity-authoring";
const [urlFile, database, ...extra] = process.argv.slice(2);
if (
  !urlFile ||
  !database ||
  extra.length ||
  (!/^entity_restore_[a-f0-9]{30,32}$/.test(database) &&
    !(
      database === "athyper_studio" &&
      process.env.ATHYPER_ENV === "local" &&
      process.env.ATHYPER_DOMAIN_SUFFIX === "dev.athyper.test"
    ))
)
  throw Error("NATIVE_SCHEMA_RESTORED_DATABASE_REQUIRED");
const url = new URL((await readFile(urlFile, "utf8")).trim());
url.pathname = "/" + database;
const login = decodeURIComponent(url.username);
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: url.href, max: 1 }),
  }),
});
try {
  const evidence = await db
    .transaction()
    .setAccessMode("read only")
    .execute((tx) => inspectCanonicalNativeSchema(tx, login));
  const blockers = nativeSchemaBlockers(evidence);
  console.log(
    JSON.stringify({
      schema: "entity.native-schema-probe/1",
      authority: "application-login catalogue inspection only",
      evidence,
      fingerprint: nativeSchemaFingerprint(evidence),
      blockers,
    }),
  );
  if (blockers.length) process.exitCode = 1;
} finally {
  await db.destroy();
}
