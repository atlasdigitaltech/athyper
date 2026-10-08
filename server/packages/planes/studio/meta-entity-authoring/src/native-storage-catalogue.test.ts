import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { readNativeStorageCatalogue } from "./native-storage-catalogue.js";
function fixture() {
  const rows = [
    {
      path: "code",
      storage_type: "character(2)",
      nullable: false,
      base_schema: "pg_catalog",
      base_type: "bpchar",
      type_kind: "b",
      object_kind: "r",
      generated: "",
      column_count: 1,
      constraints: [],
      default_expression: null,
    },
  ];
  const query = vi.fn(async () => ({ rows, rowCount: rows.length }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const selection = { plane: "studio", schema: "shared", object: "reference" };
  return {
    rows,
    query,
    selection,
    run: () => readNativeStorageCatalogue(db as never, "studio", selection),
  };
}
it("uses exact physical type/nullability and a deterministic catalogue hash", async () => {
  const f = fixture(),
    first = await f.run();
  expect(first.columns).toEqual([
    {
      path: "code",
      storageType: "character(2)",
      nullable: false,
      supportedDataTypes: ["string", "text", "enum"],
      cardinalities: ["one"],
    },
  ]);
  expect(await f.run()).toEqual(first);
  f.rows[0]!.nullable = true;
  expect((await f.run()).hash).not.toBe(first.hash);
});
it.each(["view", "foreign", "codec", "incomplete", "duplicate", "empty"])(
  "rejects unqualified physical storage: %s",
  async (kind) => {
    const f = fixture();
    if (kind === "view") f.rows[0]!.object_kind = "v";
    if (kind === "foreign") f.rows[0]!.object_kind = "f";
    if (kind === "codec") f.rows[0]!.base_schema = "custom";
    if (kind === "incomplete") f.rows[0]!.column_count = 2;
    if (kind === "duplicate") f.rows.push({ ...f.rows[0]! });
    if (kind === "empty") f.rows.length = 0;
    await expect(f.run()).rejects.toMatchObject({
      code: "NATIVE_STORAGE_CATALOGUE_UNAVAILABLE",
    });
  },
);
it("does not query a local database for a different storage plane or invalid identifier", async () => {
  const f = fixture();
  f.selection.plane = "mesh";
  await expect(f.run()).rejects.toMatchObject({
    code: "NATIVE_STORAGE_CATALOGUE_UNAVAILABLE",
  });
  f.selection.plane = "studio";
  f.selection.schema = "shared; SELECT 1";
  await expect(f.run()).rejects.toMatchObject({
    code: "NATIVE_STORAGE_CATALOGUE_UNAVAILABLE",
  });
  expect(f.query).not.toHaveBeenCalled();
});
it("pins domain constraints, enum labels and generated expressions in the physical fingerprint", async () => {
  const f = fixture();
  const original = (await f.run()).hash;
  Object.assign(f.rows[0]!, { constraints: ["CHECK (VALUE <> '')"] });
  const domain = (await f.run()).hash;
  expect(domain).not.toBe(original);
  Object.assign(f.rows[0]!, { enum_labels: ["active", "deprecated"] });
  const enumeration = (await f.run()).hash;
  expect(enumeration).not.toBe(domain);
  Object.assign(f.rows[0]!, {
    generated: "s",
    default_expression: "status = 'active'",
  });
  expect((await f.run()).hash).not.toBe(enumeration);
});
