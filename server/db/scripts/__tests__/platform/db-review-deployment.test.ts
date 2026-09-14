import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import {
  resolveSeedRoot,
  resolveFilePath,
} from "../../operations/repair/repair-tenant-ledger-hashes.js";

const root = resolve(import.meta.dirname, "../../..");
test("every upgrade is registered for exactly its applicable planes", async () => {
  const inventory = JSON.parse(
    await readFile(join(root, "migrations/inventory.json"), "utf8"),
  ) as {
    entries: Array<{ disposition: string; path?: string; planes: string[] }>;
  };
  const upgrades = inventory.entries.filter(
    (entry) => entry.disposition === "forward-upgrade",
  );
  const migrations = (await readdir(join(root, "migrations"))).filter((x) =>
    x.endsWith(".sql"),
  );
  assert.deepEqual(
    [...migrations].sort(),
    upgrades.map((entry) => entry.path!.replace("migrations/", "")).sort(),
  );
  for (const plane of ["studio", "neon", "mesh"]) {
    const manifest = (
      await readFile(join(root, `migrations/manifests/${plane}.txt`), "utf8")
    )
      .split(/\r?\n/)
      .filter((x) => x && !x.startsWith("#"));
    assert.equal(new Set(manifest).size, manifest.length);
    assert.deepEqual(
      [...manifest].sort(),
      upgrades
        .filter((entry) => entry.planes.includes(plane))
        .map((entry) => entry.path!.replace("migrations/", ""))
        .sort(),
    );
    const legacyManifest = (
      await readFile(
        join(
          root,
          `scripts/operations/upgrades/legacy-baseline-20260914/original-manifests/${plane}.txt`,
        ),
        "utf8",
      )
    ).split(/\r?\n/);
    assert.ok(
      legacyManifest.indexOf("20260908_entity_saved_views.sql") <
        legacyManifest.indexOf("20260908_entity_standard_view_defaults.sql"),
    );
    assert.ok(
      legacyManifest.indexOf("20260908_entity_standard_view_defaults.sql") <
        legacyManifest.indexOf("20260910_saved_view_runtime_grants.sql"),
    );
    assert.ok(
      legacyManifest.indexOf("20260910_ai_call_usage_preflight.sql") <
        legacyManifest.indexOf("20260910_ai_call_usage_constraint.sql"),
    );
    if (plane === "mesh") {
      assert.ok(
        legacyManifest.indexOf(
          "20260910_mesh_capability_constraint_preflight.sql",
        ) < legacyManifest.indexOf("20260910_mesh_command_hardening.sql"),
      );
      assert.ok(
        legacyManifest.indexOf("20260910_mesh_command_hardening.sql") <
          legacyManifest.indexOf("20260910_mesh_discovery_current_status.sql"),
      );
    }
    const foundation = await readFile(
      join(root, `ddl/planes/${plane}/_manifest.txt`),
      "utf8",
    );
    assert.match(foundation, /^common\/master\/19_entity_saved_views.sql$/m);
  }
});
test("ledger source discovery is independent of cwd and rejects missing roots/directories", async () => {
  assert.equal(resolveSeedRoot(), join(root, "seed"));
  const directory = await mkdtemp(join(tmpdir(), "athyper-ledger-test-"));
  try {
    assert.throws(
      () => resolveSeedRoot(join(directory, "absent")),
      /Seed root is missing/,
    );
    await writeFile(join(directory, "pack.sql"), "select 1;");
    assert.equal(
      resolveFilePath(directory, "pack.sql", "unused", "neon"),
      join(directory, "pack.sql"),
    );
    assert.equal(resolveFilePath(directory, null, "missing", "neon"), null);
    assert.equal(resolveFilePath(directory, ".", "missing", "neon"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
