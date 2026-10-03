import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prepareEntityActivity } from "../../provisioning/prepare-entity-activity.js";
import { createCapabilityProfileFileResolver } from "@athyper/server-plane-studio-meta-entity-authoring";

const product = fileURLToPath(
  new URL(
    "../../../../../metadata/entities/country/",
    import.meta.url,
  ),
);
const profiles = fileURLToPath(
  new URL("../../../../../metadata/profiles/activity/", import.meta.url),
);

for (const plane of ["studio", "neon", "mesh"] as const) {
  test(`shared reference activity prepares on ${plane} without inventing versions or activation`, () => {
    const candidate = prepareEntityActivity(product, plane);
    assert.equal(candidate.entityCode, "country");
    assert.equal(candidate.status, "unpublished_activity_candidate");
    assert.equal(candidate.activationReady, false);
    assert.equal(candidate.authoringMember?.capabilityKey, "activity");
    assert.deepEqual(candidate.authoringMember?.profile, {code:"platform.activity.standard",version:2});
    assert.equal(candidate.remainingGates.includes("deployed_activity_provider_qualification"), true);
    assert.deepEqual(candidate.policy.views, ["timeline", "auditLog", "snapshots"]);
    assert.equal(candidate.policy.snapshots.automaticCapture, "none");
    assert.equal(candidate.history.committedVersionsAvailable, false);
    assert.equal(candidate.history.sourceRecordVersionAvailable, false);
    assert.equal(candidate.history.snapshotScope, "tenant");
    assert.equal(
      candidate.requiredParentPermission,
      "common.platform.reference.view",
    );
    assert.deepEqual(candidate.requiredPermissions, [
      "common.audit.event.query",
      "common.records.snapshot.capture",
      "common.records.snapshot.read",
    ]);
    assert.equal(
      candidate.actions.some((action) =>
        /restore|request|evidence/.test(action.key),
      ),
      false,
    );
  });
}

test("generic preparation uses product identity, not a Country implementation branch", () => {
  const directory = mkdtempSync(join(tmpdir(), "entity-activity-"));
  try {
    const definition = JSON.parse(
      readFileSync(join(product, "definition.json"), "utf8"),
    );
    definition.definition.entityCode = "example_reference";
    definition.definition.storageObject = "example_reference";
    writeFileSync(
      join(directory, "definition.json"),
      JSON.stringify(definition),
    );
    writeFileSync(
      join(directory, "activity.json"),
      JSON.stringify({
        schema: "athyper.entity-activity-source/1",
        profile: { code: "platform.activity.standard", version: 1 },
        overrides: {
          snapshots: { manualCapture: false },
          query: { pageSize: 20 },
        },
      }),
    );
    const candidate = prepareEntityActivity(directory, "neon");
    assert.equal(candidate.entityCode, "example_reference");
    assert.equal(candidate.policy.query.pageSize, 20);
    assert.equal(
      candidate.actions.some((action) => action.key === "snapshots_capture"),
      false,
    );
    assert.equal(
      prepareEntityActivity(product, "neon").policy.snapshots.manualCapture,
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Activity source lock detects profile drift before candidate preparation", () => {
  const directory = mkdtempSync(join(tmpdir(), "activity-profile-"));
  try {
    writeFileSync(
      join(directory, "source-lock.json"),
      readFileSync(join(profiles, "source-lock.json")),
    );
    writeFileSync(
      join(directory, "standard.v1.json"),
      `${readFileSync(join(profiles, "standard.v1.json"), "utf8")} `,
    );
    assert.throws(
      () => createCapabilityProfileFileResolver(directory),
      /CAPABILITY_PROFILE_SOURCE_DRIFT/,
    );
    assert.throws(
      () =>
        createCapabilityProfileFileResolver(profiles)(
          "platform.activity.standard",
          999,
        ),
      /CAPABILITY_PROFILE_VERSION_UNKNOWN/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
