import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadStagingProviderEnvironment,
  parseProviderEnvironment,
  stagingProviderPath,
  writeStagingProviderEnvironment,
} from "../src/provider-config.mjs";
import { installStagingProviderConfig } from "../../bootstrap/install-stg-provider-config.mjs";

const valid = {
  ATHYPER_ENV: "staging",
  EMAIL_PROVIDER: "ses",
  SES_REGION: "ap-southeast-1",
  SES_CONFIGURATION_SET: "athyper-transactional-stg",
  SES_FROM: "notifications@notify.stg.athyper.com",
  SES_EVENT_QUEUE_URL: "https://sqs.ap-southeast-1.amazonaws.com/111111111111/athyper-stg-events",
  SES_EVENT_REGION: "ap-southeast-1",
};

test("STAGING provider configuration is allowlisted, owner-only, and environment-overridable", () => {
  const root = mkdtempSync(join(tmpdir(), "athyper-provider-"));
  const path = stagingProviderPath(root);
  writeStagingProviderEnvironment(path, valid);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(path, "utf8"), /AWS_(ACCESS|SECRET|SESSION)/u);
  const loaded = loadStagingProviderEnvironment(root, { SES_REPLY_TO: "reply@notify.stg.athyper.com" });
  assert.deepEqual(loaded.problems, []);
  assert.equal(loaded.environment.SES_REPLY_TO, "reply@notify.stg.athyper.com");
  chmodSync(path, 0o644);
  assert.ok(loadStagingProviderEnvironment(root, {}).problems.some((problem) => problem.includes("owner-only")));
});

test("provider parser rejects arbitrary keys and the Terraform adapter requires complete outputs", () => {
  assert.throws(() => parseProviderEnvironment("AWS_SECRET_ACCESS_KEY=forbidden\n"), /unsupported provider key/u);
  const root = mkdtempSync(join(tmpdir(), "athyper-provider-output-"));
  const path = installStagingProviderConfig({ ses: { value: {
    region: valid.SES_REGION,
    configuration_set_name: valid.SES_CONFIGURATION_SET,
    from_address: valid.SES_FROM,
    event_queue_url: valid.SES_EVENT_QUEUE_URL,
  } } }, root);
  assert.equal(path, stagingProviderPath(root));
  assert.deepEqual(loadStagingProviderEnvironment(root, {}).problems, []);
  assert.throws(() => installStagingProviderConfig({ ses: { value: {} } }, root), /missing region/u);
});
