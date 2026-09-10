import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type QueryResult } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validateParameterValue } from "./parameter-control.js";
import type {
  JsonValue,
  ParameterDefinition,
} from "@athyper/server-contract-control-admin";
const url = process.env["ATHYPER_PARAMETER_TEST_DATABASE_URL"];
const enabled =
  process.env["ATHYPER_PARAMETER_DB_TESTS"] === "true" && Boolean(url);
const pool = new Pool({
  connectionString: url ?? "postgres://disabled",
  max: 2,
});
const read = (file: string) =>
  readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
const functions = read("../../../db/ddl/common/control/07_functions.sql");
const fn = (name: string) =>
  functions.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION control\\.${name}\\([\\s\\S]*?\\$\\$;`,
    ),
  )![0];
const candidate =
  fn("parameter_json_is_api_compatible") +
  fn("parameter_value_matches_definition");
const legacy = read("src/fixtures/parameter-validation-legacy.sql");
const preflight = read(
  "../../../db/scripts/tests/integration/parameter-validation-preflight.sql",
);
const actor = "10000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000002";
const base: ParameterDefinition = {
  revision: 1,
  id: "p",
  code: "test.setting",
  valueType: "json",
  defaultValue: null,
  tenantCanOverride: true,
  reloadMode: "next_request",
  cacheTtlSeconds: 300,
  status: "active",
};
const vectors: Array<[string, unknown, Partial<ParameterDefinition>]> = [
  ["boolean true", true, { valueType: "boolean" }],
  ["boolean string", "true", { valueType: "boolean" }],
  ["string empty", "", { valueType: "string" }],
  ["string null", null, { valueType: "string" }],
  ["integer max", 9007199254740991, { valueType: "integer" }],
  ["integer min", -9007199254740991, { valueType: "integer" }],
  ["integer overflow", 9007199254740992, { valueType: "integer" }],
  ["integer underflow", -9007199254740992, { valueType: "integer" }],
  ["integer fraction", 1.5, { valueType: "integer" }],
  ["integer zero", 0, { valueType: "integer" }],
  ["number fraction", 0.5, { valueType: "number" }],
  ["number string", "0.5", { valueType: "number" }],
  ["enum string", "on", { valueType: "enum", allowedValues: ["on"] }],
  ["enum boolean", false, { valueType: "enum", allowedValues: [false] }],
  ["enum number", 0, { valueType: "enum", allowedValues: [0] }],
  ["enum mismatch", "0", { valueType: "enum", allowedValues: [0] }],
  ["enum absent", "on", { valueType: "enum" }],
  ["enum empty", "on", { valueType: "enum", allowedValues: [] }],
  ["enum object", { a: 1 }, { valueType: "enum", allowedValues: [{ a: 1 }] }],
  ["enum null", null, { valueType: "enum", allowedValues: [null] }],
  ...[
    "P",
    "PT",
    "P1DT",
    "P1M",
    "P1Y",
    "PT1H2",
    "P-1D",
    "1h",
    "PT0S",
    "P2DT3H4M5.5S",
    "P0D",
    "PT1.5S",
    "PT1H",
    "PT1M",
    "P1DT0S",
  ].map(
    (v) =>
      [`duration ${v}`, v, { valueType: "duration" }] as [
        string,
        string,
        Partial<ParameterDefinition>,
      ],
  ),
  ["duration number", 20, { valueType: "duration" }],
  ["json null", null, {}],
  ["json object order", { b: 2, a: 1 }, { allowedValues: [{ a: 1, b: 2 }] }],
  ["json subset", { a: 1 }, { allowedValues: [{ a: 1, b: 2 }] }],
  ["json array order", [1, 2], { allowedValues: [[2, 1]] }],
  ["json array duplicates", [1, 1], { allowedValues: [[1]] }],
  ["json scalar types", 1, { allowedValues: ["1"] }],
  ["lower inclusive", 1, { valueType: "number", minValue: 1, maxValue: 2 }],
  ["upper inclusive", 2, { valueType: "number", minValue: 1, maxValue: 2 }],
  ["below", 0, { valueType: "number", minValue: 1 }],
  ["above", 3, { valueType: "number", maxValue: 2 }],
  ["inverted", 1, { valueType: "number", minValue: 2, maxValue: 1 }],
  ["bounds on string", "x", { valueType: "string", minValue: 0 }],
];
async function matches(
  value: unknown,
  fields: Partial<ParameterDefinition> = {},
) {
  const d = { ...base, ...fields };
  return (
    await pool.query(
      "SELECT control.parameter_value_matches_definition($1::jsonb,$2,$3::jsonb,$4::jsonb,$5::jsonb) AS valid",
      [
        JSON.stringify(value),
        d.valueType,
        d.minValue === undefined ? null : JSON.stringify(d.minValue),
        d.maxValue === undefined ? null : JSON.stringify(d.maxValue),
        d.allowedValues === undefined ? null : JSON.stringify(d.allowedValues),
      ],
    )
  ).rows[0].valid;
}
async function insert(
  code: string,
  value: string,
  type = "json",
  allowed: string | null = null,
) {
  return (
    await pool.query(
      "INSERT INTO control.parameter_definition(code,name,value_type,default_value,allowed_values,tenant_can_override,created_by) VALUES($1,'Test',$2,$3::jsonb,$4::jsonb,true,$5) RETURNING id",
      [code, type, value, allowed, actor],
    )
  ).rows[0].id;
}
describe.skipIf(!enabled)(
  "parameter SQL/API alignment (disposable PostgreSQL)",
  () => {
    beforeAll(async () => {
      await pool.query(
        "CREATE SCHEMA control; CREATE SCHEMA shared; CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE DOMAIN shared.ref_status_d AS text CHECK(VALUE IN ('active','deprecated'));",
      );
      const tables = read("../../../db/ddl/common/control/03_tables.sql");
      for (const name of ["parameter_definition", "tenant_parameter_value"])
        await pool.query(
          tables.match(
            new RegExp(`CREATE TABLE control\\.${name} \\([\\s\\S]*?\\n\\);`),
          )![0],
        );
      await pool.query(
        fn("trg_validate_parameter_definition") +
          fn("trg_validate_tenant_parameter_value"),
      );
      await pool.query(
        "CREATE TRIGGER validate_definition BEFORE INSERT OR UPDATE ON control.parameter_definition FOR EACH ROW EXECUTE FUNCTION control.trg_validate_parameter_definition(); CREATE TRIGGER validate_override BEFORE INSERT OR UPDATE ON control.tenant_parameter_value FOR EACH ROW EXECUTE FUNCTION control.trg_validate_tenant_parameter_value();",
      );
    });
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE control.tenant_parameter_value,control.parameter_definition",
      );
      await pool.query(candidate);
    });
    afterAll(async () => {
      await pool.end();
    });
    it.each(vectors)("matches API: %s", async (_label, value, fields) => {
      let expected = true;
      try {
        validateParameterValue({ ...base, ...fields }, value as JsonValue);
      } catch {
        expected = false;
      }
      expect(await matches(value, fields)).toBe(expected);
    });
    it("accepts integral JSON numeric representations and checks all JSON numeric leaves", async () => {
      for (const literal of ["1.0", "1e2", "-0.00"])
        expect(
          (
            await pool.query(
              `SELECT control.parameter_value_matches_definition($1::jsonb,'integer',NULL,NULL,NULL) AS valid`,
              [literal],
            )
          ).rows[0].valid,
        ).toBe(true);
      for (const literal of ["1e400", '{"huge":1e400}', "[1e400]"])
        expect(
          (
            await pool.query(
              `SELECT control.parameter_value_matches_definition($1::jsonb,'json',NULL,NULL,NULL) AS valid`,
              [literal],
            )
          ).rows[0].valid,
        ).toBe(false);
      let value: unknown = 0;
      for (let i = 0; i < 64; i++) value = [value];
      expect(await matches(value)).toBe(true);
      expect(await matches([value])).toBe(false);
    });
    it.each(["null", '"low"', "{}", "[]", "1e400"])(
      "rejects malformed/overflow bound %s without SQL casting errors",
      async (bound) => {
        expect(
          (
            await pool.query(
              "SELECT control.parameter_value_matches_definition('1','number',$1::jsonb,NULL,NULL) AS valid",
              [bound],
            )
          ).rows[0].valid,
        ).toBe(false);
      },
    );
    it.each(["null", "{}", '"on"', "1"])(
      "rejects malformed allowed-values %s",
      async (allowed) => {
        expect(
          (
            await pool.query(
              "SELECT control.parameter_value_matches_definition('1','number',NULL,NULL,$1::jsonb) AS valid",
              [allowed],
            )
          ).rows[0].valid,
        ).toBe(false);
      },
    );
    it("rejects SQL NULL and unknown types and invalid allowed-list members", async () => {
      expect(
        (
          await pool.query(
            "SELECT control.parameter_value_matches_definition(NULL,'json',NULL,NULL,NULL) AS valid",
          )
        ).rows[0].valid,
      ).toBe(false);
      expect(
        (
          await pool.query(
            "SELECT control.parameter_value_matches_definition('1','unknown',NULL,NULL,NULL) AS valid",
          )
        ).rows[0].valid,
      ).toBe(false);
      expect(
        (
          await pool.query(
            "SELECT control.parameter_value_matches_definition('1','json',NULL,NULL,'[1,1e400]') AS valid",
          )
        ).rows[0].valid,
      ).toBe(false);
    });
    it("uses real definition and override triggers", async () => {
      const id = await insert("test.enum", "false", "enum", '[false,0,"on"]');
      await pool.query(
        "INSERT INTO control.tenant_parameter_value(tenant_id,parameter_definition_id,value,created_by) VALUES($1,$2,'0',$3)",
        [tenant, id, actor],
      );
      await expect(
        pool.query(
          "INSERT INTO control.tenant_parameter_value(tenant_id,parameter_definition_id,value,created_by) VALUES($1,$2,'true',$3)",
          [tenant, id, actor],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        insert("test.duration", "12", "duration"),
      ).rejects.toMatchObject({ code: "23514" });
    });
    it("preflights using session-local functions without replacing the live validator", async () => {
      await pool.query(legacy);
      await insert("test.duration", "12", "duration");
      const client = await pool.connect();
      try {
        const results = (await client.query(
          preflight,
        )) as unknown as QueryResult[];
        const report = results.find((r) => r.command === "SELECT")!;
        expect(report.rows).toMatchObject([
          { kind: "definition", code: "test.duration" },
        ]);
        expect(
          (
            await client.query(
              "SELECT control.parameter_value_matches_definition('12','duration',NULL,NULL,NULL) AS valid",
            )
          ).rows[0].valid,
        ).toBe(true);
      } finally {
        client.release();
      }
    });
  },
);
