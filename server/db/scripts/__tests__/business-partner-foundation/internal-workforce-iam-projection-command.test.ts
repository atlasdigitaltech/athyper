import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
test("G5 internal workforce emits the pinned employment identity intent", async () => {
  const [canonical, migration, manifest, consumer, delivery] =
    await Promise.all([
      readFile(
        resolve(root, "ddl/planes/neon/document/07_internal_workforce_iam.sql"),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "migrations/20260903_neon_internal_workforce_iam_projection_command.sql",
        ),
        "utf8",
      ),
      readFile(resolve(root, "migrations/manifests/neon.txt"), "utf8"),
      readFile(
        resolve(
          root,
          "../packages/platform/iam/src/external-worker-identity-intent.ts",
        ),
        "utf8",
      ),
      readFile(
        resolve(
          root,
          "../packages/platform/iam/src/external-worker-identity-delivery.ts",
        ),
        "utf8",
      ),
    ]);
  for (const source of [canonical, migration])
    for (const token of [
      "document.command_workforce_iam_projection",
      "workforce.employee.iam.project",
      "workforce.employee.identity_projection.requested",
      "'relationship','employer'",
      "'sourceRef','employment:'",
      "'roleCode','workforce.employee'",
      "v_projection.desired_state='suspended'",
      "event.command_execution",
      "event.outbox",
      "Internal-workforce IAM projection version is stale",
    ])
      assert.ok(source.includes(token), token);
  assert.match(
    migration,
    /desired_state IN\('member','suspended','deprovisioned'\)/,
  );
  assert.match(
    manifest,
    /^20260903_neon_internal_workforce_iam_projection_command\.sql$/m,
  );
  assert.match(consumer, /relationship: "external_worker" \| "employer"/);
  assert.match(consumer, /workforce\.employee\.identity_projection\.requested/);
  assert.match(
    delivery,
    /event_type IN\('workforce\.external_worker\.identity_projection\.requested','workforce\.employee\.identity_projection\.requested'\)/,
  );
});

test("G6 internal workforce bypasses the retained compatibility projection", async () => {
  const [canonical, migration, repository, manifest] = await Promise.all([
    readFile(
      resolve(root, "ddl/planes/neon/document/07_internal_workforce_iam.sql"),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "migrations/20260904_neon_internal_workforce_identity_intent_cutover.sql",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        root,
        "../packages/services/master-data/src/kysely-workforce-repository.ts",
      ),
      "utf8",
    ),
    readFile(resolve(root, "migrations/manifests/neon.txt"), "utf8"),
  ]);
  for (const source of [canonical, migration])
    for (const token of [
      "document.command_internal_workforce_identity_intent",
      "workforce.employee.identity.request",
      "workforce.employee.identity_projection.requested",
      "FROM master.employment",
      "event.command_execution",
      "event.outbox",
    ])
      assert.ok(source.includes(token), token);
  assert.match(repository, /command_internal_workforce_identity_intent/);
  assert.doesNotMatch(repository, /document\.workforce_iam_projection/);
  assert.match(
    manifest,
    /^20260904_neon_internal_workforce_identity_intent_cutover\.sql$/m,
  );
});
