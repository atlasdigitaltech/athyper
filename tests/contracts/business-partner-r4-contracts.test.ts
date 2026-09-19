import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BUSINESS_PARTNER_SUPPLIER_ACTIVATION_OPERATION } from "../../packages/platform/gateway/bff-relay/src/index";

const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "packages/contracts/platform/fixtures/business-partner-r4-supplier-controls.v1.json",
      root,
    ),
    "utf8",
  ),
);
const client = readFileSync(
  new URL("packages/planes/neon/business-partner/src/client.ts", root),
  "utf8",
);
const surface = readFileSync(
  new URL(
    "packages/planes/neon/business-partner/src/supplier-controls.tsx",
    root,
  ),
  "utf8",
);

test("R4 records the exact scenario boundary without overstating duplicate resolution", () => {
  assert.equal(fixture.$schema, "athyper.business-partner-r4-fixture/1");
  assert.deepEqual(
    fixture.scenarios.map((item: { id: string }) => item.id),
    ["BP-SUP-008", "BP-SUP-009", "BP-SUP-010"],
  );
  assert.equal(fixture.scenarios[0].status, "foundation_required");
  assert.equal(fixture.invariants.scoredDuplicateResolutionAvailable, false);
});

test("R4 UI consumes native qualification, preference, activation and case producers", () => {
  assert.deepEqual(BUSINESS_PARTNER_SUPPLIER_ACTIVATION_OPERATION, {
    id: "neon.business-partners.supplier-activation",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/supplier-activation",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
  for (const path of [
    "/qualifications",
    "/preferences",
    "/supplier-activation",
    "/api/neon/business-partner-cases",
  ])
    assert.match(client, new RegExp(path.replaceAll("/", "\\/")));
  for (const token of [
    "decisionFingerprint",
    "proposeBankChange",
    "proposeLifecycle",
    "expectedVersion",
  ])
    assert.ok(surface.includes(token), `missing ${token}`);
});

test("R4 never promotes a readiness projection into a browser-side authority", () => {
  assert.doesNotMatch(surface, /fetch\([^)]*master\./);
  assert.doesNotMatch(surface, /status\s*:\s*["']active["']/);
  assert.match(surface, /disabled={!readiness\.eligible}/);
});
