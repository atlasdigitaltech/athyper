import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
test("durable replay schema is installed in Studio and matches the immutable upgrade snapshot", async () => {
  const path = "planes/studio/trustiam/12_identity_replay_approval.sql";
  const ddl = await readFile(resolve(root, "ddl", path), "utf8");
  const migration = await readFile(
    resolve(root, "migrations/20260906_identity_replay_approval.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes(ddl),
    "canonical DDL and upgrade snapshot must remain aligned",
  );
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
