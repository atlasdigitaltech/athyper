import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertLocalTarget,
  parseArguments,
  quoteIdentifier,
  restoreComparison,
  summarizeDependencies,
} from "./entity-native-build.mjs";

test("inspection is default; reset must be explicit and unknown modes/targets reject", () => {
  assert.deepEqual(parseArguments([]), { mode: "inspect" });
  assert.deepEqual(parseArguments(["--", "--mode", "backup-verify"]), {
    mode: "backup-verify",
  });
  for (const args of [
    ["--mode"],
    ["--mode", "qa"],
    ["--database", "other"],
    ["--mode", "inspect", "--mode", "reset"],
  ])
    assert.throws(() => parseArguments(args));
});
test("database identity and container project both fence local administration", () => {
  const target = {
    project: "athyper-dev",
    service: "db",
    database: "athyper_studio",
  };
  assert.doesNotThrow(() => assertLocalTarget(target));
  for (const key of Object.keys(target))
    assert.throws(() => assertLocalTarget({ ...target, [key]: "qa" }));
});
test("dependency totals include every edge and distinguish inbound/internal/outbound", () => {
  const rows = [
    ...Array.from({ length: 25 }, () => ({
      sourceSchema: "snapshot",
      targetSchema: "metadata",
    })),
    ...Array.from({ length: 182 }, () => ({
      sourceSchema: "metadata",
      targetSchema: "metadata",
    })),
    { sourceSchema: "metadata", targetSchema: "master" },
  ];
  assert.deepEqual(summarizeDependencies(rows), {
    touchingMetadata: 208,
    inbound: 207,
    externalInbound: 25,
    internal: 182,
    outbound: 1,
  });
});
test("SQL identifiers from the catalogue are quoted, never treated as SQL", () => {
  assert.equal(quoteIdentifier('x";DROP TABLE x;--'), '"x"";DROP TABLE x;--"');
  assert.throws(() => quoteIdentifier("x\0y"));
});
test("restore evidence rejects schema changes, but does not equate live counts with dump snapshot", () => {
  const base = {
    dependencies: ["fk"],
    constraints: ["check"],
    routines: ["fn"],
    triggers: ["trg"],
    tables: [{ rows: 1 }],
  };
  assert.doesNotThrow(() =>
    restoreComparison(base, { ...base, tables: [{ rows: 2 }] }),
  );
  for (const key of ["dependencies", "constraints", "routines", "triggers"])
    assert.throws(
      () => restoreComparison(base, { ...base, [key]: [] }),
      /RESTORE_SCHEMA_MISMATCH/,
    );
});
test("reset cannot execute Docker or mutate before L1 and manifest implementation", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./entity-native-build.mjs", import.meta.url)),
      "--mode",
      "reset",
    ],
    { encoding: "utf8", env: { ...process.env, PATH: "/nonexistent" } },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /LOCAL_RESET_BLOCKED:L1_AND_RESET_MANIFEST_NOT_ESTABLISHED/,
  );
  assert.equal(result.stdout, "");
});

test("restore compares PostgreSQL-rendered semantics while preserving exact predecessor evidence", () => {
  const base = {
    dependencies: [],
    routines: [],
    triggers: [],
    constraints: [
      {
        name: "check",
        definition: "CHECK (a AND b AND c)",
        exact_definition: "CHECK ((a AND b) AND c)",
        validated: true,
      },
    ],
  };
  const restored = structuredClone(base);
  restored.constraints[0].exact_definition = "CHECK (a AND b AND c)";
  assert.doesNotThrow(() => restoreComparison(base, restored));
  restored.constraints[0].definition = "CHECK (a OR b OR c)";
  assert.throws(
    () => restoreComparison(base, restored),
    /RESTORE_SCHEMA_MISMATCH/,
  );
});
