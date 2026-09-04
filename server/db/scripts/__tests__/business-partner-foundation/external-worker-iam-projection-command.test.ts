import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");

test("G5 NEON command owns engagement IAM state and exact outbox intent", async () => {
  const [functions, triggers, grants, migration, manifest] = await Promise.all([
    readFile(
      resolve(root, "ddl/planes/neon/document/07_functions.sql"),
      "utf8",
    ),
    readFile(resolve(root, "ddl/planes/neon/document/08_triggers.sql"), "utf8"),
    readFile(resolve(root, "ddl/planes/neon/document/11_grants.sql"), "utf8"),
    readFile(
      resolve(
        root,
        "migrations/20260903_neon_external_worker_iam_projection_command.sql",
      ),
      "utf8",
    ),
    readFile(resolve(root, "migrations/manifests/neon.txt"), "utf8"),
  ]);
  for (const source of [functions, migration]) {
    assert.match(
      source,
      /CREATE OR REPLACE FUNCTION document\.command_worker_engagement_iam_projection/,
    );
    assert.match(
      source,
      /app\.current_tenant_id[\s\S]+app\.current_principal_id/,
    );
    assert.match(
      source,
      /request_fingerprint[\s\S]+idempotency key was reused/,
    );
    assert.match(
      source,
      /v_engagement_version <> p_expected_version[\s\S]+version is stale/,
    );
    assert.match(
      source,
      /status = 'active'[\s\S]+readiness_evidence @> '\{"eligible":true\}'/,
    );
    assert.match(
      source,
      /status = 'suspended'[\s\S]+v_desired_status := 'suspended'/,
    );
    assert.match(
      source,
      /'completed', 'terminated', 'cancelled', 'closed'[\s\S]+v_desired_status := 'deprovisioned'/,
    );
    assert.match(
      source,
      /INSERT INTO event\.outbox[\s\S]+workforce\.external_worker\.identity_projection\.requested/,
    );
    assert.match(source, /desiredHash[\s\S]+commandExecutionId/);
    assert.doesNotMatch(
      source,
      /DELETE FROM\s+(?:master\.person|master\.external_worker|document\.worker_engagement)/i,
    );
  }
  assert.match(
    triggers,
    /BEFORE UPDATE OF access_status ON document\.worker_engagement[\s\S]+trg_guard_worker_engagement_iam_mutation/,
  );
  assert.match(
    grants,
    /REVOKE ALL ON FUNCTION document\.command_worker_engagement_iam_projection[^\n]+FROM PUBLIC/,
  );
  assert.match(
    manifest,
    /^20260903_neon_external_worker_iam_projection_command\.sql$/m,
  );
});
