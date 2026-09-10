import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const url = process.env["ATHYPER_PARAMETER_TEST_DATABASE_URL"];
const enabled =
  process.env["ATHYPER_PARAMETER_DB_TESTS"] === "true" && Boolean(url);
const pool = new Pool({
  connectionString: url ?? "postgres://disabled",
  max: 4,
});
const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8");
const functions = read("../../../db/ddl/common/control/07_functions.sql");
const fn = (name: string) =>
  functions.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION control\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ),
  )![0];
const actor = randomUUID(),
  tenant = randomUUID(),
  otherTenant = randomUUID();
async function definition() {
  return (
    await pool.query(
      "INSERT INTO control.parameter_definition(code,name,value_type,default_value,tenant_can_override,created_by) VALUES($1,'Setting','number','1',true,$2) RETURNING *",
      [`test.p_${randomUUID().replaceAll("-", "")}`, actor],
    )
  ).rows[0];
}
async function value(id: string, from = "2090-01-01", until = "2091-01-01") {
  return (
    await pool.query(
      "INSERT INTO control.tenant_parameter_value(tenant_id,parameter_definition_id,value,effective_from,effective_until,created_by) VALUES($1,$2,'2',$3,$4,$5) RETURNING *",
      [tenant, id, from, until, actor],
    )
  ).rows[0];
}
describe.skipIf(!enabled)(
  `parameter database versions: baseline`,
  () => {
    beforeAll(async () => {
      await pool.query(
        "CREATE SCHEMA control;CREATE SCHEMA shared;CREATE SCHEMA master;CREATE EXTENSION btree_gist;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';CREATE DOMAIN shared.ref_status_d AS text CHECK(VALUE IN ('active','deprecated'));CREATE TABLE master.tenant(id uuid PRIMARY KEY); CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_tenant_id')::uuid $$;DO $$ BEGIN CREATE ROLE parameter_version_app; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
      );
      await pool.query("INSERT INTO master.tenant VALUES($1),($2)", [
        tenant,
        otherTenant,
      ]);
      const tables = read("../../../db/ddl/common/control/03_tables.sql");
      for (const name of ["parameter_definition", "tenant_parameter_value"]) {
        const sql = tables.match(
          new RegExp(`CREATE TABLE control\\.${name} \\([\\s\\S]*?\\n\\);`),
        )![0];
        await pool.query(sql);
      }
      for (const name of [
        "parameter_json_is_api_compatible",
        "parameter_value_matches_definition",
        "trg_validate_parameter_definition",
        "trg_validate_tenant_parameter_value",
        "trg_guard_feature_parameter_identity",
      ])
        await pool.query(fn(name));
      const constraints = read(
        "../../../db/ddl/common/control/05_constraints.sql",
      );
      for (const s of constraints.matchAll(
        /ALTER TABLE control\.tenant_parameter_value[\s\S]*?;/g,
      ))
        await pool.query(s[0]);
      const triggers = read("../../../db/ddl/common/control/08_triggers.sql");
      for (const s of triggers.matchAll(
        /CREATE TRIGGER (?:parameter_definition_validate|tenant_parameter_value_validate)[\s\S]*?;/g,
      ))
        await pool.query(s[0]);
      for (const name of ["parameter_definition", "tenant_parameter_value"])
        await pool.query(
          `CREATE TRIGGER ${name}_guard BEFORE UPDATE ON control.${name} FOR EACH ROW EXECUTE FUNCTION control.trg_guard_feature_parameter_identity();`,
        );
      const rls = read("../../../db/ddl/common/control/10_rls.sql");
      await pool.query(
        rls.slice(
          rls.indexOf("ALTER TABLE control.parameter_definition ENABLE"),
          rls.indexOf("ALTER TABLE control.cron_schedule ENABLE"),
        ),
      );
      await pool.query(
        "GRANT USAGE ON SCHEMA control,shared TO parameter_version_app;GRANT SELECT ON control.parameter_definition TO parameter_version_app;GRANT SELECT,INSERT,UPDATE ON control.tenant_parameter_value TO parameter_version_app;",
      );
      await pool.query(fn("trg_advance_parameter_version"));
      for (const s of triggers.matchAll(
        /CREATE TRIGGER (?:parameter_definition_revision|tenant_parameter_value_version)[\s\S]*?;/g,
      ))
        await pool.query(s[0]);
    });
    afterAll(async () => {
      await pool.end();
    });
    it("starts new definitions and overrides at version 1", async () => {
      const d = await definition(),
        v = await value(d.id);
      expect(d.revision).toBe(1);
      expect(v.version).toBe(1);
    });
    it("owns version counters on insert and update", async () => {
      const d = await definition();
      const v = (
        await pool.query(
          "INSERT INTO control.tenant_parameter_value(version,tenant_id,parameter_definition_id,value,created_by) VALUES(99,$1,$2,'2',$3) RETURNING *",
          [tenant, d.id, actor],
        )
      ).rows[0];
      expect(v.version).toBe(1);
      expect(
        (
          await pool.query(
            "UPDATE control.tenant_parameter_value SET version=999,value='3' WHERE id=$1 RETURNING version",
            [v.id],
          )
        ).rows[0].version,
      ).toBe(2);
      expect(
        (
          await pool.query(
            "UPDATE control.parameter_definition SET revision=999 WHERE id=$1 RETURNING revision",
            [d.id],
          )
        ).rows[0].revision,
      ).toBe(2);
    });
    it("allows only one concurrent update for an expected version", async () => {
      const d = await definition(),
        v = await value(d.id);
      const results = await Promise.all(
        [2, 3].map((n) =>
          pool.query(
            "UPDATE control.tenant_parameter_value SET value=$1::jsonb WHERE tenant_id=$2 AND id=$3 AND version=1 RETURNING version",
            [String(n), tenant, v.id],
          ),
        ),
      );
      expect(results.map((r) => r.rowCount).sort()).toEqual([0, 1]);
      expect(results.flatMap((r) => r.rows)).toEqual([{ version: 2 }]);
    });
    it.each([
      "id",
      "tenant_id",
      "parameter_definition_id",
      "created_at",
      "created_by",
    ])("preserves override %s", async (field) => {
      const d = await definition(),
        v = await value(d.id);
      const replacement =
        field === "created_at" ? "2000-01-01T00:00:00Z" : randomUUID();
      await expect(
        pool.query(
          `UPDATE control.tenant_parameter_value SET ${field}=$1 WHERE id=$2`,
          [replacement, v.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await pool.query(
            "SELECT version FROM control.tenant_parameter_value WHERE id=$1",
            [v.id],
          )
        ).rows[0].version,
      ).toBe(1);
    });
    it("preserves definition identity and terminal expiration", async () => {
      const d = await definition(),
        v = await value(d.id);
      await expect(
        pool.query(
          "UPDATE control.parameter_definition SET code='test.renamed' WHERE id=$1",
          [d.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await pool.query(
            "UPDATE control.tenant_parameter_value SET status='deprecated' WHERE id=$1 AND version=1 RETURNING version",
            [v.id],
          )
        ).rows[0].version,
      ).toBe(2);
      await expect(
        pool.query(
          "UPDATE control.tenant_parameter_value SET status='active' WHERE id=$1",
          [v.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (
          await pool.query(
            "SELECT status,version FROM control.tenant_parameter_value WHERE id=$1",
            [v.id],
          )
        ).rows[0],
      ).toEqual({ status: "deprecated", version: 2 });
    });
    it("retains overlap exclusion and permits adjacent periods", async () => {
      const d = await definition();
      await value(d.id);
      await expect(
        value(d.id, "2090-06-01", "2091-06-01"),
      ).rejects.toMatchObject({ code: "23P01" });
      expect((await value(d.id, "2091-01-01", "2092-01-01")).version).toBe(1);
    });
    it("does not advance versions when a transaction rolls back", async () => {
      const d = await definition(),
        v = await value(d.id),
        client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE control.tenant_parameter_value SET value='3' WHERE id=$1",
          [v.id],
        );
        await client.query(
          "UPDATE control.parameter_definition SET default_value='2' WHERE id=$1",
          [d.id],
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      expect(
        (
          await pool.query(
            "SELECT version FROM control.tenant_parameter_value WHERE id=$1",
            [v.id],
          )
        ).rows[0].version,
      ).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT revision FROM control.parameter_definition WHERE id=$1",
            [d.id],
          )
        ).rows[0].revision,
      ).toBe(1);
    });
    it.each([
      ["default_value", "'2'"],
      ["min_value", "'0'"],
      ["max_value", "'10'"],
      ["allowed_values", "'[1,2]'"],
      ["tenant_can_override", "false"],
      ["reload_mode", "'restart'"],
      ["cache_ttl_seconds", "10"],
      ["is_sensitive", "true"],
      ["metadata", '\'{"consumer":"changed"}\''],
      ["status", "'deprecated'"],
    ])(
      "revises definition after %s changes without an override write",
      async (column, expression) => {
        const d = await definition(),
          v = await value(d.id);
        expect(
          (
            await pool.query(
              `UPDATE control.parameter_definition SET ${column}=${expression} WHERE id=$1 RETURNING revision`,
              [d.id],
            )
          ).rows[0].revision,
        ).toBe(2);
        expect(
          (
            await pool.query(
              "SELECT version FROM control.tenant_parameter_value WHERE id=$1",
              [v.id],
            )
          ).rows[0].version,
        ).toBe(1);
      },
    );
    it("keeps tenant writes scoped under the non-owner role", async () => {
      const d = await definition(),
        v = await value(d.id),
        client = await pool.connect();
      try {
        await client.query("BEGIN; SET LOCAL ROLE parameter_version_app;");
        await client.query(
          "SELECT set_config('app.current_tenant_id',$1,true)",
          [otherTenant],
        );
        expect(
          (
            await client.query(
              "UPDATE control.tenant_parameter_value SET value='3' WHERE id=$1 RETURNING version",
              [v.id],
            )
          ).rowCount,
        ).toBe(0);
        await client.query(
          "SELECT set_config('app.current_tenant_id',$1,true)",
          [tenant],
        );
        expect(
          (
            await client.query(
              "UPDATE control.tenant_parameter_value SET value='3' WHERE id=$1 AND version=1 RETURNING version",
              [v.id],
            )
          ).rows[0].version,
        ).toBe(2);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });
  },
);
