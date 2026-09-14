import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
test("durable replay schema is installed in Studio and matches the upgrade chain", async () => {
  const path = "planes/studio/trustiam/12_identity_replay_approval.sql";
  const ddl = await readFile(resolve(root, "ddl", path), "utf8");
  const migration = await readFile(
    resolve(root, "scripts/operations/upgrades/legacy-baseline-20260914/20260906_identity_replay_approval.sql"),
    "utf8",
  );
  const upgrade = await readFile(resolve(root, "scripts/operations/upgrades/legacy-baseline-20260914/20260910_identity_replay_context_hardening.sql"), "utf8");
  // Historical snapshots remain immutable. Only explicitly replaced functions
  // may diverge; the remainder of the original schema must still match exactly.
  const replacements = [...upgrade.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\([\s\S]*?END\s*\$\$;/g)];
  let upgraded = migration;
  for (const match of replacements) {
    const name = match[1]!.replaceAll(".", "\\.");
    upgraded = upgraded.replace(new RegExp(`CREATE FUNCTION ${name}\\([\\s\\S]*?END\\s*\\$\\$;`), () => match[0].replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION"));
  }
  assert.ok(upgraded.includes(ddl), "canonical DDL must match the historical snapshot plus explicit upgrades");
  for (const plane of ["studio", "neon", "mesh"]) {
    const manifest = await readFile(
      resolve(root, `ddl/planes/${plane}/_manifest.txt`),
      "utf8",
    );
    assert.equal(
      manifest.split("\n").filter((line) => line === path).length,
      plane === "studio" ? 1 : 0,
    );
  }
  assert.match(migration, /requires Studio/);
});
