import assert from "node:assert/strict";
import test from "node:test";
import { createValidator } from "../../../deploy/stackctl/src/schema.mjs";

const validator = createValidator(new URL("../../..", import.meta.url).pathname);

function evidence() {
  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "StagingNotificationEvidence",
    metadata: { gate: "email-canary" },
    spec: {
      environment: "stg",
      status: "passed",
      sourceRevision: "a".repeat(40),
      recordedAt: "2026-08-25T08:09:10.000Z",
      channel: "email",
      canaryIdentity: {
        tenantId: "0198e116-cd4f-7d31-89a4-13103b76f3fd",
        principalId: "0198e116-cd4f-7d31-89a4-13103b76f3fe",
        recipientRef: `sha256:${"b".repeat(64)}`,
      },
      providerReference: `sha256:${"c".repeat(64)}`,
      assertions: {
        authenticatedDispatch: true,
        providerAccepted: true,
        providerEventObserved: true,
        delivered: true,
        activityCenterPublished: true,
      },
    },
  };
}

test("accepts complete, redacted staging email-canary evidence", () => {
  assert.doesNotThrow(() => validator(evidence(), "email-canary.json"));
});

test("rejects incomplete, failed, additional, or raw-recipient email evidence", () => {
  const valid = evidence();
  assert.throws(() => validator({ ...valid, spec: { ...valid.spec, providerReference: undefined } }, "missing-provider.json"));
  assert.throws(() => validator({ ...valid, spec: { ...valid.spec, assertions: { ...valid.spec.assertions, delivered: false } } }, "not-delivered.json"));
  assert.throws(() => validator({ ...valid, spec: { ...valid.spec, assertions: { ...valid.spec.assertions, providerPayloadRecorded: true } } }, "extra-assertion.json"));
  assert.throws(() => validator({ ...valid, spec: { ...valid.spec, canaryIdentity: { ...valid.spec.canaryIdentity, recipientRef: "canary@athyper.test" } } }, "raw-recipient.json"));
});
