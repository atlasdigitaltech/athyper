import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

for (const path of ["server/.env", "../.env", ".env"]) {
  if (!process.env.DATABASE_URL) loadEnv({ path: resolve(process.cwd(), path), quiet: true });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const root = resolve(process.cwd(), process.cwd().endsWith("server\\db") ? "../.." : ".");
const client = new Client({ connectionString });
let checks = 0;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${message}`);
  checks += 1;
  console.log(`PASS ${message}`);
}

async function main(): Promise<void> {
  const planes = ["athyper", "neon", "mesh"];
  for (const plane of planes) {
    const manifest = await readFile(
      resolve(root, `server/db/ddl/planes/${plane}/_manifest.txt`),
      "utf8",
    );
    const tables = await readFile(
      resolve(root, `server/db/ddl/planes/${plane}/document/03_tables.sql`),
      "utf8",
    );
    const functions = await readFile(
      resolve(root, `server/db/ddl/planes/${plane}/document/07_functions.sql`),
      "utf8",
    );
    assert(
      manifest.includes("common/control/03_tables.sql")
        && manifest.includes("common/control/12_collaboration_lookup_seed.sql"),
      `${plane} installs the common lookup catalog and collaboration seed`,
    );
    assert(
      !/CREATE TABLE document\.(comment_type|comment_intent|reaction_type)/.test(tables),
      `${plane} has no dedicated document vocabulary tables`,
    );
    assert(
      functions.includes("control.lookup_value_is_active("),
      `${plane} validates collaboration codes through control`,
    );
  }

  const lookupRoute = await readFile(
    resolve(root, "server/packages/services/metadata/routes/lookup.route.ts"),
    "utf8",
  );
  assert(
    !lookupRoute.includes('selectFrom("document.comment_'),
    "metadata lookup API has no document-table special case",
  );

  await client.connect();
  try {
    const dedicated = await client.query<{ count: number }>(`
      SELECT count(*)::int count
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p')
         AND n.nspname = 'document'
         AND c.relname IN ('comment_type', 'comment_intent', 'reaction_type')
    `);
    assert(dedicated.rows[0]?.count === 0, "connected Neon has no dedicated document vocabulary tables");

    const domains = await client.query<{
      code: string;
      source_schema: string;
      is_extensible: boolean;
      rows: number;
    }>(`
      SELECT domain.code, domain.source_schema, domain.is_extensible,
             count(value.id)::int rows
        FROM control.lookup_domain domain
        LEFT JOIN control.lookup_value value ON value.domain_code = domain.code
       WHERE domain.code LIKE 'document.%'
         AND domain.code IN (
           'document.comment_type', 'document.comment_intent', 'document.reaction_type'
         )
       GROUP BY domain.code, domain.source_schema, domain.is_extensible
       ORDER BY domain.code
    `);
    assert(domains.rows.length === 3, "three document-owned lookup domains exist");
    assert(
      domains.rows.every(({ source_schema }) => source_schema === "document"),
      "all collaboration lookup domains declare document semantic ownership",
    );
    assert(
      domains.rows.find(({ code }) => code === "document.comment_type")?.is_extensible === false
        && domains.rows
          .filter(({ code }) => code !== "document.comment_type")
          .every(({ is_extensible }) => is_extensible),
      "comment type is locked while intent and reaction domains are extensible",
    );
    const counts = Object.fromEntries(domains.rows.map(({ code, rows }) => [code, rows]));
    assert(
      counts["document.comment_type"] === 4
        && counts["document.comment_intent"] === 8
        && counts["document.reaction_type"] === 11,
      "canonical collaboration catalogs contain 4, 8, and 11 platform values",
    );
    const old = await client.query<{ count: number }>(`
      SELECT count(*)::int count FROM control.lookup_domain
       WHERE code IN ('master.comment_type', 'master.comment_intent', 'master.reaction_type')
    `);
    assert(old.rows[0]?.count === 0, "legacy master collaboration domains are absent");
    const oldTriggerArgs = await client.query<{ count: number }>(`
      SELECT count(*)::int count
        FROM pg_trigger
       WHERE NOT tgisinternal
         AND encode(tgargs, 'escape')
             ~ 'master\\.(comment_type|comment_intent|reaction_type)'
    `);
    assert(
      oldTriggerArgs.rows[0]?.count === 0,
      "operational lookup triggers use document domain codes",
    );

    const operationalChecks = [
      {
        relations: ["document.comment", "master.comment"],
        column: "context_type",
        domain: "document.comment_type",
      },
      {
        relations: ["document.comment", "master.comment"],
        column: "comment_intent",
        domain: "document.comment_intent",
      },
      {
        relations: ["document.comment_reaction", "master.comment_reaction"],
        column: "reaction_type",
        domain: "document.reaction_type",
      },
    ];
    for (const check of operationalChecks) {
      const relationResult = await client.query<{ relation: string | null }>(
        "SELECT COALESCE(to_regclass($1)::text, to_regclass($2)::text) relation",
        check.relations,
      );
      const relation = relationResult.rows[0]?.relation;
      if (!relation) continue;
      const [schema, table] = relation.split(".");
      const missing = await client.query<{ count: number }>(`
        SELECT count(DISTINCT source.${check.column})::int count
          FROM "${schema}"."${table}" source
         WHERE NOT control.lookup_value_is_active(
           '${check.domain}', source.${check.column}, source.tenant_id
         )
      `);
      assert(
        missing.rows[0]?.count === 0,
        `${relation}.${check.column} contains only active ${check.domain} codes`,
      );
    }
  } finally {
    await client.end();
  }
  console.log(`Collaboration lookup ownership verification passed (${checks} checks).`);
}

await main();
