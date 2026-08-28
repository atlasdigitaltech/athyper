import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { DEMO_PLANE_PERMISSIONS } from "../provision-three-tenant-demo-authorization.js";

const databaseRoot = resolve(import.meta.dirname, "../..");

test("every plane installs the shared workflow permission catalog", async () => {
  const seedPath = "common/authz/14_workflow_permission_reference_seed.sql";
  const seed = await readFile(resolve(databaseRoot, "ddl", seedPath), "utf8");

  for (const permission of ["read", "create", "claim", "complete", "cancel"]) {
    assert.match(seed, new RegExp(`workflow\\.work_item\\.${permission}`));
  }
  for (const plane of ["studio", "neon", "mesh"]) {
    const manifest = await readFile(resolve(databaseRoot, "ddl/planes", plane, "_manifest.txt"), "utf8");
    assert.match(manifest, new RegExp(`^${seedPath}$`, "m"));
  }
});

test("the local Neon shell role can read its principal-scoped workflow inbox", () => {
  assert.deepEqual(DEMO_PLANE_PERMISSIONS.neon, [
    "neon.context.catalog.read",
    "workflow.work_item.read",
  ]);
});
