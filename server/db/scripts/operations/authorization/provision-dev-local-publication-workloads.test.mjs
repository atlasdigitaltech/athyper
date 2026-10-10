import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseArguments,
  provisioningSql,
  workloadFiles,
} from "./provision-dev-local-publication-workloads.mjs";

test("workload seed is local, bounded, replay-safe and leaves policy and releases untouched", () => {
  const sql = provisioningSql(false);
  assert.match(sql, /current_database\(\)<>'athyper_studio'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /dev\.metadata\.author/);
  assert.match(sql, /dev\.metadata\.publisher/);
  assert.match(sql, /principal_type='service_account'/);
  assert.match(sql, /provisioning_source='internal'/);
  assert.match(sql, /DEV_LOCAL_WORKLOAD_CONFLICT/);
  assert.match(sql, /ROLLBACK;/);
  assert.doesNotMatch(sql, /publication\.policy|publication\.release|requires_mfa|GRANT |DELETE |UPDATE /);
});

test("generated workload has two independent private credentials", () => {
  const value = workloadFiles(
    { author: "11111111-1111-4111-8111-111111111111", publisher: "22222222-2222-4222-8222-222222222222" },
    { author: "a".repeat(43), publisher: "b".repeat(43) },
  );
  assert.equal(value.workload.author.code, "dev.metadata.author");
  assert.equal(value.workload.publisher.code, "dev.metadata.publisher");
  assert.notEqual(value.workload.author.credentialSha256, value.workload.publisher.credentialSha256);
  assert.equal(value.client.author.length, 43);
  assert.throws(() => workloadFiles({ author: "same", publisher: "same" }, { author: "a".repeat(43), publisher: "b".repeat(43) }));
});

test("requires an explicit isolated secret directory", () => {
  assert.throws(() => parseArguments([]));
  assert.throws(() => parseArguments(["--apply=wrong", "--output=/tmp/x"]));
  assert.throws(() => parseArguments(["--apply=DEV-LOCAL-PUBLICATION-WORKLOADS", "--output=/tmp/x"]));
});
