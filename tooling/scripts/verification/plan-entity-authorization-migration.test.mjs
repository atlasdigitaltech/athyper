import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
test("migration dry run treats admins as candidates and never emits effective grant changes", () => {
  const dir = mkdtempSync(join(tmpdir(), "entity-auth-plan-"));
  try {
    const inventory = join(dir, "inventory.json"),
      profile = join(dir, "profile.json"),
      output = join(dir, "plan.json");
    writeFileSync(
      inventory,
      JSON.stringify({
        schemaVersion: 1,
        environment: "fixture",
        planes: [
          {
            plane: "neon",
            entities: [
              {
                entityCode: "business_partner",
                fields: [{ key: "id" }],
                operations: { read: { permissionCode: "bp.read" } },
              },
            ],
            grants: [
              {
                role_code: "bp-admin",
                permission_code: "neon.relationship.entity_case.create",
                scope_kind: "operating_organization",
              },
            ],
          },
        ],
      }),
    );
    writeFileSync(
      profile,
      JSON.stringify({
        schemaVersion: 1,
        planeKey: "neon",
        entityCode: "business_partner",
        operations: [
          { key: "read", permissionCode: "bp.read" },
          { key: "enter", permissionCode: "bp.enter" },
        ],
        fieldPolicies: [{ fields: ["id"] }],
      }),
    );
    const before = readFileSync(inventory, "utf8");
    execFileSync(process.execPath, [
      new URL("./plan-entity-authorization-migration.mjs", import.meta.url)
        .pathname,
      inventory,
      profile,
      output,
    ]);
    const result = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(result.effectiveGrantsChanged, false);
    assert.deepEqual(result.grantChanges, []);
    assert.equal(result.candidateRoles[0].role, "bp-admin");
    assert.equal(result.activation.eligible, false);
    assert.equal(result.mappingReview.status, "pending");
    assert.equal(result.rollback.restoreGrants, false);
    assert.deepEqual(result.descriptorPlans[0].missingOperations, [
      { key: "enter", permissionCode: "bp.enter" },
    ]);
    assert.equal(readFileSync(inventory, "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
