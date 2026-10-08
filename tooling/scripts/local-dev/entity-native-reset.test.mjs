import { test } from "node:test";
import assert from "node:assert/strict";
import { scopedNativeResetSql } from "./entity-native-reset.mjs";
const table = {
  schema: "metadata",
  table: "entity_change_set",
  keys: [["draft"]],
};
const plan = {
  scope: {
    database: "athyper_studio",
    entityIds: ["00000000-0000-4000-8000-000000000001"],
    purpose: "approved local disposal",
  },
  blockers: [],
  tables: [table],
};
const keys = [{ ...table, columns: ["id"] }];
const trigger = { ...table, name: "guard", enabled: "A" };
test("reset bounds every mutation and restores guards without disabling foreign keys", () => {
  const sql = scopedNativeResetSql(plan, keys, [trigger], "athyper_studio");
  assert.match(sql, /LOCAL_RESET_ROWS_CHANGED/);
  assert.match(sql, /ACCESS EXCLUSIVE MODE/);
  assert.match(sql, /WHERE jsonb_build_array/);
  assert.match(sql, /foreign_key_violation/);
  assert.match(sql, /LOCAL_RESET_UNRESOLVED_FK_DEPENDENCY/);
  assert.ok(
    sql.indexOf("SET CONSTRAINTS ALL IMMEDIATE") <
      sql.indexOf("ENABLE ALWAYS TRIGGER"),
  );
  assert.doesNotMatch(
    sql,
    /CASCADE|TRUNCATE|DROP |session_replication_role|DISABLE TRIGGER ALL/,
  );
});
test("reset rejects blockers, foreign databases, missing keys and disabled predecessor guards", () => {
  assert.throws(() =>
    scopedNativeResetSql(
      { ...plan, blockers: [{}] },
      keys,
      [],
      "athyper_studio",
    ),
  );
  assert.throws(() => scopedNativeResetSql(plan, keys, [], "athyper_neon"));
  assert.throws(() => scopedNativeResetSql(plan, [], [], "athyper_studio"));
  assert.throws(() =>
    scopedNativeResetSql(
      plan,
      keys,
      [{ ...trigger, enabled: "D" }],
      "athyper_studio",
    ),
  );
  for (const tableName of ["entity", "entity_class_profile"])
    assert.throws(() =>
      scopedNativeResetSql(
        { ...plan, tables: [{ ...table, table: tableName }] },
        keys,
        [],
        "athyper_studio",
      ),
    );
});
