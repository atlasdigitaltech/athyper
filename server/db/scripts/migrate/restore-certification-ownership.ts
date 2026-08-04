import { resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const apply = process.argv.includes("--apply");
for (const path of ["server/.env", "../.env", ".env"]) {
  if (!process.env.DATABASE_URL) loadEnv({ path: resolve(process.cwd(), path), quiet: true });
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString });

async function exists(schema: string, relation: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "select to_regclass($1) is not null present",
    [`${schema}.${relation}`],
  );
  return result.rows[0]?.present === true;
}

async function main(): Promise<void> {
  await client.connect();
  try {
    const state = {
      sourceCertification: await exists("certification", "certification"),
      sourceType: await exists("certification", "certification_type"),
      targetCertification: await exists("master", "certification"),
      targetType: await exists("master", "certification_type"),
    };
    console.log(JSON.stringify({ apply, state }, null, 2));
    if (!apply) {
      console.log("Dry run only. Re-run with --apply to restore Neon master ownership.");
      return;
    }
    if (state.sourceCertification && state.targetCertification
      || state.sourceType && state.targetType) {
      throw new Error("Both source and target certification relations exist; refusing an ambiguous merge.");
    }
    if ((!state.sourceCertification && !state.targetCertification)
      || (!state.sourceType && !state.targetType)) {
      throw new Error("Certification relations are missing.");
    }

    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");

    if (state.sourceCertification) {
      await client.query("DROP TRIGGER IF EXISTS certification_validate_type_scope ON certification.certification");
      await client.query("ALTER TABLE certification.certification SET SCHEMA master");
    }
    if (state.sourceType) {
      await client.query("ALTER TABLE certification.certification_type SET SCHEMA master");
    }

    await client.query(`
      DROP FUNCTION IF EXISTS certification.trg_validate_certification_type_scope();

      CREATE OR REPLACE FUNCTION master.trg_validate_certification_type_scope()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE v_type_tenant_id uuid;
      BEGIN
        IF NEW.certification_type_id IS NULL THEN RETURN NEW; END IF;
        SELECT tenant_id INTO v_type_tenant_id
          FROM master.certification_type WHERE id = NEW.certification_type_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Unknown certification type: %', NEW.certification_type_id
            USING ERRCODE = '23503';
        END IF;
        IF v_type_tenant_id IS NOT NULL AND v_type_tenant_id <> NEW.tenant_id THEN
          RAISE EXCEPTION 'Certification type % belongs to another tenant',
            NEW.certification_type_id USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$;

      DROP TRIGGER IF EXISTS certification_validate_type_scope ON master.certification;
      CREATE TRIGGER certification_validate_type_scope
        BEFORE INSERT OR UPDATE OF tenant_id, certification_type_id
        ON master.certification
        FOR EACH ROW EXECUTE FUNCTION master.trg_validate_certification_type_scope();

      ALTER TABLE master.certification_type
        DROP CONSTRAINT IF EXISTS certification_type_tenant_fk,
        ADD CONSTRAINT certification_type_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
      ALTER TABLE master.certification
        DROP CONSTRAINT IF EXISTS certification_tenant_fk,
        DROP CONSTRAINT IF EXISTS certification_company_code_fk,
        DROP CONSTRAINT IF EXISTS certification_site_fk,
        ADD CONSTRAINT certification_tenant_fk
          FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE,
        ADD CONSTRAINT certification_company_code_fk
          FOREIGN KEY (tenant_id, company_code_id)
          REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
        ADD CONSTRAINT certification_site_fk
          FOREIGN KEY (tenant_id, site_id)
          REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT;

      ALTER TABLE master.certification_type ENABLE ROW LEVEL SECURITY;
      ALTER TABLE master.certification_type FORCE ROW LEVEL SECURITY;
      ALTER TABLE master.certification ENABLE ROW LEVEL SECURITY;
      ALTER TABLE master.certification FORCE ROW LEVEL SECURITY;

      GRANT SELECT, INSERT, UPDATE, DELETE
        ON master.certification_type, master.certification TO athyperapp;
      GRANT ALL PRIVILEGES
        ON master.certification_type, master.certification TO athyperadmin;
      GRANT EXECUTE ON FUNCTION master.trg_validate_certification_type_scope()
        TO athyperapp, athyperadmin;
    `);

    if (await exists("control", "entity")) {
      await client.query(`
        UPDATE control.entity
           SET table_schema = 'master'
         WHERE table_schema = 'certification'
           AND table_name = 'certification'
      `);
    }

    await client.query("DROP SCHEMA IF EXISTS certification");
    await client.query("COMMIT");

    const counts = await client.query<{
      certifications: string;
      types: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM master.certification) certifications,
        (SELECT count(*)::text FROM master.certification_type) types
    `);
    console.log(`Restored Neon master ownership: ${counts.rows[0]?.certifications} certifications, ${counts.rows[0]?.types} types.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

await main();
