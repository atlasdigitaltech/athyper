import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  nativeColumnPredicate,
  nativeGuardMembers,
  nativeRowGuardsDdl,
} from "./native-row-guards.js";
import { nativeRetiredColumns } from "./native-storage-transition.js";
import { coreFixture, coreFixtureId } from "./normalized-core.fixtures.js";
import { normalizedCoreMembers } from "./normalized-core-contract.js";

it("generates the committed structural guards without grants, protected-state writes or cutover", () => {
  const ddl = nativeRowGuardsDdl();
  expect(ddl).toBe(
    readFileSync(
      new URL(
        "../../../../db/ddl/planes/studio/metadata/33_native_typed_row_guards.generated.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(ddl).not.toMatch(
    /SECURITY DEFINER|GRANT |DROP CONSTRAINT|requires_mfa/,
  );
  expect(ddl).toContain("SECURITY INVOKER");
  for (const member of nativeGuardMembers)
    for (const c of Object.values(member.columns))
      expect(ddl).toContain(`r."${c.column}"`);
});

it("retires only real canonical columns and rejects unavailable resource dictionaries explicitly", () => {
  const tables = readFileSync(
    new URL(
      "../../../../db/ddl/planes/studio/metadata/03_tables.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const [table, columns] of Object.entries(nativeRetiredColumns)) {
    const definition = tables.match(
      new RegExp("CREATE TABLE metadata\\." + table + " \\([\\s\\S]*?\\n\\);"),
    )?.[0];
    expect(definition, table).toBeDefined();
    for (const column of columns)
      expect(definition).toMatch(new RegExp("\\b" + column + "\\s+"));
  }
  const ddl = nativeRowGuardsDdl();
  for (const table of [
    "ui_component_contract",
    "entity_capability_binding",
    "entity_surface_overlay",
  ]) {
    expect(ddl).toContain("NATIVE_REFERENCE_STORAGE_UNAVAILABLE:" + table);
    expect(ddl).not.toContain('FROM metadata."' + table + '"');
  }
});

it("rejects unsupported SQL representations instead of silently dropping their checks", () => {
  expect(() =>
    nativeColumnPredicate({ type: "object", properties: {} }, "v", "jsonb"),
  ).toThrow("NATIVE_GUARD_NODE_UNSUPPORTED");
  expect(() =>
    nativeColumnPredicate(
      { type: "array", items: { type: "string" } },
      "v",
      "jsonb",
    ),
  ).toThrow("NATIVE_GUARD_ARRAY_TYPE");
  expect(() => nativeColumnPredicate({ type: "boolean" }, "v", "text")).toThrow(
    "NATIVE_GUARD_BOOLEAN_TYPE",
  );
});

/** Real PostgreSQL semantics over synthetic typed tables. This isolates the
 * generated component, not canonical constraints, RLS, host or live authority. */
it.skipIf(process.env.ATHYPER_NATIVE_ROW_GUARDS_POSTGRES !== "1")(
  "enforces native requiredness, physical arrays, ownership, references and retired columns in PostgreSQL",
  async () => {
    const name = "athyper-row-guards-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    let created = false;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm",
      );
      created = true;
      for (let i = 0; i < 100; i++) {
        try {
          // The image's temporary initialization server listens only on its
          // socket. Wait for the final TCP server, not that transient process.
          docker(
            "exec",
            name,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
          );
          break;
        } catch {
          if (i === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      const query = (sql: string) =>
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            name,
            "psql",
            "-h",
            "127.0.0.1",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
          ],
          { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
      const literal = (value: unknown) =>
        value === null
          ? "NULL"
          : typeof value === "boolean" || typeof value === "number"
            ? String(value)
            : "'" + String(value).replaceAll("'", "''") + "'";
      const tables = new Map<string, Map<string, string>>();
      const base = () =>
        new Map(
          Object.entries({
            id: "uuid",
            entity_id: "uuid",
            tenant_id: "uuid",
            change_set_id: "uuid",
          }),
        );
      for (const member of nativeGuardMembers) {
        const columns = base();
        for (const c of Object.values(member.columns))
          columns.set(
            c.column,
            c.sqlType.startsWith("metadata.") ? "text" : c.sqlType,
          );
        for (const c of nativeRetiredColumns[
          member.table as keyof typeof nativeRetiredColumns
        ] ?? [])
          columns.set(c, "text");
        tables.set(member.table, columns);
      }
      for (const member of nativeGuardMembers)
        for (const c of Object.values(member.columns))
          if ("reference" in c && c.reference && !tables.has(c.reference))
            tables.set(c.reference, base());
      tables
        .get("entity_field_identity")!
        .set("identity_status", "text")
        .set("introduced_change_set_id", "uuid");
      query(
        `CREATE SCHEMA metadata; CREATE TABLE metadata.entity_change_set(id uuid,entity_id uuid,tenant_id uuid,native_core_layout_version integer);\n` +
          [...tables]
            .map(
              ([table, cols]) =>
                `CREATE TABLE metadata."${table}"(${[...cols].map(([c, t]) => `"${c}" ${t}`).join(",")});`,
            )
            .join("\n") +
          nativeRowGuardsDdl(),
      );
      const root = coreFixtureId(900),
        entity = coreFixtureId(901);
      const check = `SELECT metadata.fn_assert_native_typed_rows('${root}',2);`;
      query(
        `INSERT INTO metadata.entity_change_set VALUES('${root}','${entity}',NULL,2);${check}`,
      );
      const row = { ...coreFixture().field[0]!, labelId: null };
      const cols = Object.entries(normalizedCoreMembers.field.columns);
      query(
        `INSERT INTO metadata.entity_field_identity(id,entity_id,identity_status,introduced_change_set_id) VALUES('${row.fieldIdentityId}','${entity}','reserved','${root}'); INSERT INTO metadata.entity_field(id,entity_id,change_set_id,${cols.map(([, c]) => `"${c.column}"`).join(",")}) VALUES('${row.id}','${entity}','${root}',${cols.map(([key]) => literal(Reflect.get(row, key))).join(",")});${check}`,
      );
      const reject = (
        mutation: string,
        diagnostic = "NATIVE_TYPED_ROW_INVALID",
      ) => {
        try {
          query(`BEGIN;${mutation}${check}ROLLBACK;`);
          throw Error("EXPECTED_DATABASE_REJECTION");
        } catch (error) {
          expect(
            String((error as { stderr?: unknown }).stderr ?? error),
          ).toContain(diagnostic);
        }
      };
      reject("UPDATE metadata.entity_field SET nullable=NULL;");
      reject("UPDATE metadata.entity_field SET type_config='{}';");
      reject(
        `UPDATE metadata.entity_field SET entity_id='${coreFixtureId(902)}';`,
      );
      reject(
        `UPDATE metadata.entity_field_identity SET tenant_id='${coreFixtureId(903)}';`,
      );
      reject(
        `UPDATE metadata.entity_field_identity SET introduced_change_set_id='${coreFixtureId(904)}';`,
      );
      reject("DELETE FROM metadata.entity_field_identity;");
      reject(
        "UPDATE metadata.entity_change_set SET native_core_layout_version=1;",
        "NATIVE_TYPED_VERSION_MISMATCH",
      );
      const vectors = [
        [
          nativeColumnPredicate(
            { type: "boolean" },
            "NULL::boolean",
            "boolean",
          ),
          false,
        ],
        [nativeColumnPredicate({ type: "boolean" }, "false", "boolean"), true],
        [
          nativeColumnPredicate(
            { type: "array", items: { type: "string", minLength: 1 } },
            "ARRAY['']::text[]",
            "text[]",
          ),
          false,
        ],
        [
          nativeColumnPredicate(
            { type: "array", items: { type: "string" } },
            "ARRAY[NULL]::text[]",
            "text[]",
          ),
          false,
        ],
        [
          nativeColumnPredicate(
            { type: "array", items: { type: "string" } },
            "ARRAY[['x']]::text[]",
            "text[]",
          ),
          false,
        ],
        [
          nativeColumnPredicate(
            { type: "array", items: { type: "string" } },
            "'[0:0]={x}'::text[]",
            "text[]",
          ),
          false,
        ],
        [
          nativeColumnPredicate(
            { type: "array", items: { type: "string" } },
            "ARRAY[]::text[]",
            "text[]",
          ),
          true,
        ],
        [
          nativeColumnPredicate(
            {
              anyOf: [
                { type: "null" },
                { type: "integer", minimum: 1, maximum: 3 },
              ],
            },
            "NULL::integer",
            "integer",
          ),
          true,
        ],
        [
          nativeColumnPredicate(
            { type: "integer", minimum: 1, maximum: 3 },
            "0",
            "integer",
          ),
          false,
        ],
      ] as const;
      for (const [predicate, expected] of vectors)
        query(
          `DO $$ BEGIN IF (${predicate}) IS DISTINCT FROM ${expected} THEN RAISE EXCEPTION 'PREDICATE_RESULT_MISMATCH'; END IF; END $$;`,
        );
      query(check);
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
