import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyNotificationProviderReadiness } from "./verify-notification-provider-readiness.mjs";

function secret(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, value, { mode: 0o600 });
  return path;
}

test("accepts file-backed SMTP and VAPID credentials without returning values", () => {
  const directory = mkdtempSync(join(tmpdir(), "athyper-provider-readiness-"));
  try {
    const environment = {
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_FROM: "notifications@example.test",
      SMTP_USER_FILE: secret(directory, "smtp-user", "provider-user"),
      SMTP_PASS_FILE: secret(directory, "smtp-password", "provider-password"),
      VAPID_SUBJECT: "mailto:notifications@example.test",
      VAPID_PUBLIC_KEY: "A".repeat(87),
      VAPID_PRIVATE_KEY_FILE: secret(directory, "vapid-private-key", "B".repeat(43)),
    };
    const result = verifyNotificationProviderReadiness(environment, { target: "staging", push: "web" });
    assert.equal(result.ready, true);
    assert.equal(JSON.stringify(result).includes("provider-password"), false);
    assert.equal(JSON.stringify(result).includes("B".repeat(43)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects direct production secrets and incomplete provider configuration", () => {
  const result = verifyNotificationProviderReadiness({
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_FROM: "notifications@example.test",
    SMTP_USER: "user",
    SMTP_PASS: "password",
  }, { target: "production", push: "web" });
  assert.equal(result.ready, false);
  assert.match(result.checks[0].problem, /SMTP_USER_FILE/u);
  assert.match(result.checks[1].problem, /VAPID_SUBJECT/u);
});

test("accepts SES v2 workload configuration without SMTP credentials", () => {
  const result = verifyNotificationProviderReadiness({
    EMAIL_PROVIDER: "ses",
    SES_REGION: "ap-southeast-1",
    SES_CONFIGURATION_SET: "athyper-transactional-stg",
    SES_FROM: "notifications@notify.stg.athyper.com",
    SES_EVENT_QUEUE_URL: "https://sqs.ap-southeast-1.amazonaws.com/111111111111/athyper-stg-events",
  }, { target: "staging", push: "none" });

  assert.equal(result.ready, true);
  assert.equal(result.emailProvider, "ses");
  assert.deepEqual(result.checks[0], {
    name: "email.ses-v2",
    status: "pass",
    sources: {
      authentication: "workload-identity",
      region: "environment",
      configurationSet: "environment",
      from: "environment",
      eventQueue: "environment",
      eventRegion: "environment",
    },
  });
});

test("fails closed for incomplete SES v2 configuration", () => {
  const result = verifyNotificationProviderReadiness({
    EMAIL_PROVIDER: "ses",
    SES_REGION: "ap-southeast-1",
  }, { target: "production", push: "none" });
  assert.equal(result.ready, false);
  assert.match(result.checks[0].problem, /SES_CONFIGURATION_SET/u);
});
