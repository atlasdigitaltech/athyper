import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(dbRoot, "../..");

test("Studio owns durable exact-version projection reconciliation attempts", async () => {
  const tables = await readFile(
    resolve(dbRoot, "ddl/planes/studio/trustiam/03_tables.sql"),
    "utf8",
  );
  const triggers = await readFile(
    resolve(dbRoot, "ddl/planes/studio/trustiam/08_triggers.sql"),
    "utf8",
  );
  assert.match(
    tables,
    /CREATE TABLE trustiam\.projection_reconciliation_attempt/,
  );
  for (const coordinate of [
    "desired_version",
    "desired_hash",
    "job_identity_hash",
    "claim_token_hash",
    "fencing_token",
    "lease_expires_at",
    "manual_replay_of",
  ]) {
    assert.match(tables, new RegExp(`\\b${coordinate}\\b`));
  }
  assert.match(
    tables,
    /status IN \('claimed','running','retrying','succeeded','failed','dead_letter','cancelled'\)/,
  );
  assert.match(
    triggers,
    /terminal projection reconciliation evidence is immutable/,
  );
  assert.match(
    triggers,
    /OLD\.status='dead_letter'[\s\S]*NEW\.replay_requested_at IS NOT NULL/,
  );
  assert.match(
    triggers,
    /projection desired state is fenced by an active reconciliation attempt/,
  );
});

test("worker claims Studio desired state and applies only through exact-plane atomic APIs", async () => {
  const repository = await readFile(
    resolve(
      repositoryRoot,
      "server/packages/platform/iam/src/kysely-projection-reconciliation.ts",
    ),
    "utf8",
  );
  const functions = await readFile(
    resolve(dbRoot, "ddl/common/authz/07_functions.sql"),
    "utf8",
  );
  assert.match(
    repository,
    /FROM trustiam\.application_projection p JOIN trustiam\.organization/,
  );
  assert.match(
    repository,
    /desired_version=\$\{work\.desiredVersion\}[\s\S]*desired_hash=\$\{work\.desiredHash\}/,
  );
  assert.match(
    repository,
    /current_setting\('app\.database_plane',true\)=\$\{work\.targetPlane\}/,
  );
  assert.match(
    repository,
    /authz\.fn_stage_application_projection[\s\S]*authz\.fn_activate_application_projection/,
  );
  assert.match(
    functions,
    /fn_stage_application_projection[\s\S]*master\.tenant WHERE id=p_tenant_id AND status='active'/,
  );
  assert.doesNotMatch(
    repository,
    /FROM authz\.application_projection[\s\S]{0,160}status='failed'/,
  );
});

test("uses separate Studio reconciler and plane-local applier privileges", async () => {
  const roles = await readFile(
    resolve(dbRoot, "ddl/common/_database/01_service_roles.sql"),
    "utf8",
  );
  const rls = await readFile(
    resolve(dbRoot, "ddl/planes/studio/trustiam/10_rls.sql"),
    "utf8",
  );
  const grants = await readFile(
    resolve(dbRoot, "ddl/planes/studio/trustiam/11_grants.sql"),
    "utf8",
  );
  assert.match(
    roles,
    /CREATE ROLE athyper_projection_reconciler[\s\S]*NOLOGIN[\s\S]*NOBYPASSRLS/,
  );
  assert.match(
    rls,
    /projection_reconciler_projection_observation[\s\S]*TO athyper_projection_reconciler/,
  );
  assert.match(
    grants,
    /GRANT SELECT,INSERT,UPDATE ON trustiam\.projection_reconciliation_attempt TO athyper_projection_reconciler/,
  );
  assert.doesNotMatch(
    grants,
    /GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA trustiam/,
  );
});

test("retry exhaustion records observation and alerts without changing desired business status", async () => {
  const repository = await readFile(
    resolve(
      repositoryRoot,
      "server/packages/platform/iam/src/kysely-projection-reconciliation.ts",
    ),
    "utf8",
  );
  const worker = await readFile(
    resolve(
      repositoryRoot,
      "server/packages/platform/iam/src/projection-reconciliation.ts",
    ),
    "utf8",
  );
  const host = await readFile(
    resolve(
      repositoryRoot,
      "server/apps/platform-host/src/composition/register-platform.ts",
    ),
    "utf8",
  );
  assert.match(repository, /SET reconciliation_status='failed'/);
  assert.doesNotMatch(
    repository,
    /SET status='(?:failed|suspended|retired)'[\s\S]{0,180}trustiam\.application_projection/i,
  );
  assert.match(
    worker,
    /classification\s*!==\s*"transient"\s*\|\|\s*work\.attemptNo\s*>=\s*this\.maxAttempts/,
  );
  assert.match(
    host,
    /INSERT INTO event\.outbox[\s\S]*trustiam\.projection\.reconciliation\.dead_letter/,
  );
  assert.match(host, /trustiam_projection_reconciliation_total/);
  assert.match(host, /captureOperationalError/);
});

test("health and manual replay use dedicated canonical Studio permissions", async () => {
  const catalog = await readFile(
    resolve(
      dbRoot,
      "seed/contracts/authorization/catalog/studio/catalog.v2.json",
    ),
    "utf8",
  );
  const host = await readFile(
    resolve(
      repositoryRoot,
      "server/apps/platform-host/src/composition/register-platform.ts",
    ),
    "utf8",
  );
  assert.match(catalog, /studio\.iam\.application_projection\.read/);
  assert.match(catalog, /studio\.iam\.application_projection\.replay/);
  assert.match(host, /permission:\s*"studio\.iam\.application_projection\.read"/);
  assert.match(
    host,
    /permission:\s*"studio\.iam\.application_projection\.replay"/,
  );
  assert.match(host, /status='dead_letter' AND replay_requested_at IS NULL/);
});
