import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const apply = process.argv.includes("--apply");
for (const path of ["server/.env", "../.env", ".env"]) {
  if (!process.env.DATABASE_URL) {
    loadEnv({ path: resolve(process.cwd(), path), quiet: true });
  }
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString });

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function relation(schema: string, name: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "select to_regclass($1) is not null present",
    [`${schema}.${name}`],
  );
  return result.rows[0]?.present === true;
}

async function procedure(identity: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "select to_regprocedure($1) is not null present",
    [identity],
  );
  return result.rows[0]?.present === true;
}

async function renameConstraint(from: string, to: string): Promise<void> {
  const result = await client.query<{ present: boolean }>(`
    select exists (
      select 1
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname = 'business_intent'
         and con.conname = $1
    ) present
  `, [from]);
  if (result.rows[0]?.present) {
    await client.query(
      `ALTER TABLE master.business_intent
       RENAME CONSTRAINT ${quoteIdentifier(from)} TO ${quoteIdentifier(to)}`,
    );
  }
}

async function renameIndex(from: string, to: string): Promise<void> {
  if (await relation("master", from)) {
    await client.query(
      `ALTER INDEX master.${quoteIdentifier(from)}
       RENAME TO ${quoteIdentifier(to)}`,
    );
  }
}

async function renameTrigger(from: string, to: string): Promise<void> {
  const result = await client.query<{ present: boolean }>(`
    select exists (
      select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'master'
         and c.relname = 'business_intent'
         and t.tgname = $1
         and not t.tgisinternal
    ) present
  `, [from]);
  if (result.rows[0]?.present) {
    await client.query(
      `ALTER TRIGGER ${quoteIdentifier(from)}
       ON master.business_intent RENAME TO ${quoteIdentifier(to)}`,
    );
  }
}

async function rewriteStoredFunctions(): Promise<number> {
  const functions = await client.query<{ definition: string }>(`
    select pg_get_functiondef(p.oid) definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('control', 'master')
       and p.prosrc like '%intent.business_intent%'
     order by p.oid::regprocedure::text
  `);
  for (const row of functions.rows) {
    await client.query(
      row.definition.replaceAll(
        "intent.business_intent",
        "master.business_intent",
      ),
    );
  }
  return functions.rowCount ?? 0;
}

async function main(): Promise<void> {
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");

    const sourcePresent = await relation("intent", "business_intent");
    const targetPresent = await relation("master", "business_intent");
    if (sourcePresent && targetPresent) {
      throw new Error(
        "Both intent.business_intent and master.business_intent exist; refusing an ambiguous merge.",
      );
    }
    if (sourcePresent) {
      await client.query(
        "ALTER TABLE intent.business_intent SET SCHEMA master",
      );
    } else if (!targetPresent) {
      throw new Error(
        "Neither intent.business_intent nor master.business_intent exists.",
      );
    }

    if (await procedure("intent.trg_validate_business_intent_parent()")) {
      if (await procedure("master.trg_bi_parent_guard()")) {
        throw new Error("Both old and corrected parent guard functions exist.");
      }
      await client.query(`
        ALTER FUNCTION intent.trg_validate_business_intent_parent()
        SET SCHEMA master
      `);
      await client.query(`
        ALTER FUNCTION master.trg_validate_business_intent_parent()
        RENAME TO trg_bi_parent_guard
      `);
    }

    await renameConstraint("business_intent_pkey", "bi_pkey");
    await renameConstraint("business_intent_tenant_code_uq", "bi_code_uq");
    await renameConstraint("business_intent_tenant_id_uq", "bi_tenant_id_uq");
    await renameConstraint("business_intent_code_nonempty_chk", "bi_code_chk");
    await renameConstraint("business_intent_depth_chk", "bi_depth_chk");
    await renameConstraint("business_intent_domain_chk", "bi_domain_chk");
    await renameConstraint("business_intent_name_nonempty_chk", "bi_name_chk");
    await renameConstraint("business_intent_no_self_ref_chk", "bi_no_self_ref");
    await renameConstraint("business_intent_visibility_chk", "bi_visibility_chk");
    await renameConstraint("business_intent_parent_fk", "bi_parent_fk");
    await renameConstraint("business_intent_tenant_fk", "bi_tenant_fk");
    await client.query(`
      ALTER TABLE master.business_intent
      DROP CONSTRAINT IF EXISTS business_intent_metadata_object_chk
    `);

    await renameIndex("business_intent_parent_idx", "bi_parent_pidx");
    await renameIndex("business_intent_tenant_domain_idx", "bi_tenant_domain_pidx");
    await renameIndex("business_intent_visibility_idx", "bi_visibility_pidx");
    await renameTrigger("business_intent_parent_guard", "trg_bi_parent_guard");
    await renameTrigger("business_intent_status_changed", "trg_bi_status_changed");
    await renameTrigger("business_intent_updated_at", "trg_bi_updated_at");

    const rewrittenFunctions = await rewriteStoredFunctions();

    await client.query(`
      CREATE OR REPLACE FUNCTION master.trg_bi_parent_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path TO 'master', 'pg_temp'
      AS $function$
      DECLARE
        v_parent_tenant uuid;
        v_parent_domain text;
      BEGIN
        IF NEW.parent_id IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT tenant_id, domain
          INTO v_parent_tenant, v_parent_domain
          FROM master.business_intent
         WHERE id = NEW.parent_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Parent business_intent % not found.', NEW.parent_id;
        END IF;
        IF v_parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
          RAISE EXCEPTION
            'Cross-tenant hierarchy not allowed: parent tenant=%, child tenant=%.',
            v_parent_tenant, NEW.tenant_id;
        END IF;
        IF v_parent_domain IS DISTINCT FROM NEW.domain THEN
          RAISE EXCEPTION
            'Domain mismatch: child domain "%" must match parent domain "%".',
            NEW.domain, v_parent_domain;
        END IF;
        RETURN NEW;
      END;
      $function$;

      DROP TRIGGER IF EXISTS trg_bi_parent_guard ON master.business_intent;
      CREATE TRIGGER trg_bi_parent_guard
        BEFORE INSERT OR UPDATE OF parent_id, domain
        ON master.business_intent
        FOR EACH ROW EXECUTE FUNCTION master.trg_bi_parent_guard();
      DROP TRIGGER IF EXISTS trg_bi_status_changed ON master.business_intent;
      CREATE TRIGGER trg_bi_status_changed
        BEFORE UPDATE OF status ON master.business_intent
        FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
      DROP TRIGGER IF EXISTS trg_bi_updated_at ON master.business_intent;
      CREATE TRIGGER trg_bi_updated_at
        BEFORE UPDATE ON master.business_intent
        FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

      ALTER TABLE master.business_intent ENABLE ROW LEVEL SECURITY;
      ALTER TABLE master.business_intent FORCE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS business_intent_admin_write
        ON master.business_intent;
      DROP POLICY IF EXISTS business_intent_tenant_read
        ON master.business_intent;
      DROP POLICY IF EXISTS business_intent_tenant_write
        ON master.business_intent;
      DROP POLICY IF EXISTS tenant_access ON master.business_intent;
      CREATE POLICY tenant_access
        ON master.business_intent FOR ALL
        USING (tenant_id = shared.current_tenant_id_soft())
        WITH CHECK (tenant_id = shared.current_tenant_id());
      DROP POLICY IF EXISTS seed_write ON master.business_intent;
      CREATE POLICY seed_write
        ON master.business_intent FOR ALL TO CURRENT_USER
        USING (true) WITH CHECK (true);

      REVOKE INSERT, UPDATE, DELETE
        ON master.business_intent FROM athyperapp;
      GRANT SELECT ON master.business_intent TO athyperapp;
      GRANT ALL PRIVILEGES ON master.business_intent TO athyperadmin;
    `);

    const adminRole = await client.query<{ present: boolean }>(`
      select exists (
        select 1 from pg_roles where rolname = 'athyperadmin'
      ) present
    `);
    if (adminRole.rows[0]?.present) {
      await client.query(`
        DROP POLICY IF EXISTS admin_access ON master.business_intent;
        CREATE POLICY admin_access
          ON master.business_intent FOR ALL TO athyperadmin
          USING (true) WITH CHECK (true);
        GRANT EXECUTE ON FUNCTION master.trg_bi_parent_guard()
          TO athyperadmin;
      `);
    }

    if (await relation("control", "entity")) {
      await client.query(`
        UPDATE control.entity
           SET table_schema = 'master'
         WHERE table_schema = 'intent'
           AND table_name = 'business_intent'
      `);
    }

    const stale = await client.query<{
      target_count: string;
      wrong_count: string;
      row_count: string;
      stale_function_count: string;
    }>(`
      select
        (select count(*)::text
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'master'
            and c.relkind in ('r', 'p')
            and c.relname = 'business_intent') target_count,
        (select count(*)::text
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('intent', 'mesh')
            and c.relkind in ('r', 'p')
            and c.relname = 'business_intent') wrong_count,
        (select count(*)::text from master.business_intent) row_count,
        (select count(*)::text
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('control', 'master', 'intent')
            and p.prosrc like '%intent.business_intent%') stale_function_count
    `);
    const result = stale.rows[0];
    if (
      result?.target_count !== "1"
      || result.wrong_count !== "0"
      || result.stale_function_count !== "0"
    ) {
      throw new Error(
        `Business-intent correction verification failed: ${JSON.stringify(result)}`,
      );
    }

    const intentSchemaObjects = await client.query<{ object_count: string }>(`
      select (
        (select count(*) from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'intent')
        +
        (select count(*) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'intent')
      )::text object_count
    `);
    if (intentSchemaObjects.rows[0]?.object_count === "0") {
      await client.query("DROP SCHEMA IF EXISTS intent");
    }

    if (apply) {
      await client.query("COMMIT");
      console.log(
        `Restored Neon master.business_intent: ${result.row_count} rows; rewrote ${rewrittenFunctions} stored functions.`,
      );
    } else {
      await client.query("ROLLBACK");
      console.log(
        `Business-intent correction dry run passed: ${result.row_count} rows; rewrote ${rewrittenFunctions} stored functions; rolled back.`,
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();
