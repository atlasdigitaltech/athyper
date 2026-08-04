import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const apply = process.argv.includes("--apply");
for (const path of ["server/.env", "../.env", ".env"]) {
  if (!process.env.DATABASE_URL) loadEnv({ path: resolve(process.cwd(), path), quiet: true });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const mappings = [
  { from: "master.comment_type", to: "document.comment_type", extensible: false },
  { from: "master.comment_intent", to: "document.comment_intent", extensible: true },
  { from: "master.reaction_type", to: "document.reaction_type", extensible: true },
] as const;

const client = new Client({ connectionString });
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function main(): Promise<void> {
  await client.connect();
  try {
    const state = await client.query<{
      domain_code: string;
      value_count: number;
    }>(`
      SELECT domain.code domain_code, count(value.id)::int value_count
        FROM control.lookup_domain domain
        LEFT JOIN control.lookup_value value ON value.domain_code = domain.code
       WHERE domain.code = ANY($1::text[])
       GROUP BY domain.code ORDER BY domain.code
    `, [mappings.flatMap(({ from, to }) => [from, to])]);
    console.log(JSON.stringify({ apply, domains: state.rows }, null, 2));
    if (!apply) {
      console.log("Dry run only. Re-run with --apply to consolidate collaboration lookups.");
      return;
    }

    const physicalCatalogs = await client.query<{ relation: string }>(`
      SELECT format('%I.%I', n.nspname, c.relname) relation
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p')
         AND n.nspname = 'document'
         AND c.relname IN ('comment_type', 'comment_intent', 'reaction_type')
    `);
    if (physicalCatalogs.rowCount) {
      throw new Error(
        `Dedicated document catalogs contain a separate migration surface: ${
          physicalCatalogs.rows.map(({ relation }) => relation).join(", ")
        }`,
      );
    }

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");

    for (const mapping of mappings) {
      const collision = await client.query<{ count: number }>(`
        SELECT count(*)::int count
          FROM control.lookup_value old_value
          JOIN control.lookup_value new_value
            ON new_value.domain_code = $2
           AND new_value.code = old_value.code
           AND new_value.tenant_id IS NOT DISTINCT FROM old_value.tenant_id
         WHERE old_value.domain_code = $1
      `, [mapping.from, mapping.to]);
      if ((collision.rows[0]?.count ?? 0) > 0) {
        throw new Error(`Both ${mapping.from} and ${mapping.to} contain overlapping values.`);
      }

      await client.query(`
        INSERT INTO control.lookup_domain (
          code, name, description, source_schema, is_extensible,
          metadata, status, created_by
        )
        SELECT $2, name, description, 'document', $3,
               metadata, status, created_by
          FROM control.lookup_domain
         WHERE code = $1
        ON CONFLICT (code) DO NOTHING
      `, [mapping.from, mapping.to, mapping.extensible]);

      await client.query(`
        UPDATE control.entity_field
           SET enum_domain_code = $2
         WHERE enum_domain_code = $1
      `, [mapping.from, mapping.to]);
      await client.query(`
        UPDATE control.lookup_value
           SET domain_code = $2
         WHERE domain_code = $1
      `, [mapping.from, mapping.to]);
      await client.query(
        "DELETE FROM control.lookup_domain WHERE code = $1",
        [mapping.from],
      );
    }

    const legacyTriggers = await client.query<{
      schema_name: string;
      table_name: string;
      trigger_name: string;
      definition: string;
    }>(`
      SELECT n.nspname schema_name, c.relname table_name, t.tgname trigger_name,
             pg_get_triggerdef(t.oid) definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT t.tgisinternal
         AND encode(t.tgargs, 'escape')
             ~ 'master\\.(comment_type|comment_intent|reaction_type)'
    `);
    for (const trigger of legacyTriggers.rows) {
      let definition = trigger.definition;
      for (const mapping of mappings) {
        definition = definition.replaceAll(mapping.from, mapping.to);
      }
      await client.query(
        `DROP TRIGGER ${quoteIdentifier(trigger.trigger_name)}
           ON ${quoteIdentifier(trigger.schema_name)}.${quoteIdentifier(trigger.table_name)}`,
      );
      await client.query(definition);
    }

    const seedPath = resolve(
      process.cwd().endsWith("server\\db") ? process.cwd() : resolve(process.cwd(), "server/db"),
      "ddl/common/control/12_collaboration_lookup_seed.sql",
    );
    await client.query(await readFile(seedPath, "utf8"));
    await client.query(`
      CREATE OR REPLACE FUNCTION control.lookup_value_is_active(
        p_domain_code text,
        p_value_code text,
        p_tenant_id uuid DEFAULT NULL
      )
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SET search_path = pg_catalog, control
      AS $function$
        SELECT EXISTS (
          SELECT 1
            FROM control.lookup_value value
            JOIN control.lookup_domain domain ON domain.code = value.domain_code
           WHERE value.domain_code = p_domain_code
             AND value.code = p_value_code
             AND value.status = 'active'
             AND domain.status = 'active'
             AND (
               value.tenant_id IS NULL
               OR (
                 domain.is_extensible
                 AND p_tenant_id IS NOT NULL
                 AND value.tenant_id = p_tenant_id
               )
             )
        )
      $function$;
      GRANT EXECUTE ON FUNCTION control.lookup_value_is_active(text, text, uuid)
        TO athyperapp, athyperadmin;
    `);
    await client.query("COMMIT");

    const result = await client.query<{ domain_code: string; rows: number }>(`
      SELECT domain_code, count(*)::int rows
        FROM control.lookup_value
       WHERE domain_code = ANY($1::text[])
       GROUP BY domain_code ORDER BY domain_code
    `, [mappings.map(({ to }) => to)]);
    console.log("Consolidated collaboration lookups:", result.rows);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

await main();
