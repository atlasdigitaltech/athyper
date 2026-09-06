import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BUSINESS_PARTNER_CUSTOMER_DESIGNATION_OPERATIONS,
  BUSINESS_PARTNER_CUSTOMER_LIFECYCLE_OPERATION,
} from "../../packages/platform/gateway/bff-relay/src/index";

const root = new URL("../../", import.meta.url);
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "packages/contracts/platform/fixtures/business-partner-r5-customer-complete.v1.json",
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
    "packages/planes/neon/business-partner/src/customer-controls.tsx",
    root,
  ),
  "utf8",
);

test("R5 freezes all eight Customer scenarios without overstating qualification", () => {
  assert.equal(fixture.$schema, "athyper.business-partner-r5-fixture/1");
  assert.deepEqual(
    fixture.scenarios.map((item: { id: string }) => item.id),
    Array.from(
      { length: 8 },
      (_, index) => `BP-CUS-${String(index + 1).padStart(3, "0")}`,
    ),
  );
  assert.equal(fixture.invariants.geographyAndChannelScopeAvailable, true);
  assert.equal(fixture.invariants.changeHistoryWorkspaceAvailable, true);
  assert.equal(fixture.invariants.targetEnvironmentEvidenceRetained, false);
});

test("R5 relays native designation and versioned lifecycle producers", () => {
  assert.deepEqual(
    BUSINESS_PARTNER_CUSTOMER_DESIGNATION_OPERATIONS.map((item) => [
      item.method,
      item.path,
      item.idempotency ?? "none",
    ]),
    [
      [
        "GET",
        "/api/neon/business-partners/:businessPartnerId/customer-designations",
        "none",
      ],
      [
        "POST",
        "/api/neon/business-partners/:businessPartnerId/customer-designations",
        "required",
      ],
      [
        "POST",
        "/api/neon/customer-designations/:designationId/decisions",
        "required",
      ],
    ],
  );
  assert.deepEqual(BUSINESS_PARTNER_CUSTOMER_LIFECYCLE_OPERATION, {
    id: "neon.business-partners.customer-lifecycle",
    method: "POST",
    path: "/api/neon/business-partners/:businessPartnerId/customer-lifecycle",
    requestClass: "json",
    requiresTenant: true,
    idempotency: "required",
    maxBodyBytes: 32 * 1024,
  });
  for (const token of [
    "createCustomerDesignation",
    "decideCustomerDesignation",
    "transitionCustomer",
  ])
    assert.ok(client.includes(token), `missing ${token}`);
});

test("R5 exposes all five valid lifecycle actions without browser authority", () => {
  for (const action of fixture.invariants.lifecycleActions)
    assert.ok(surface.includes(`\"${action}\"`), `missing ${action}`);
  assert.ok(surface.includes("expectedVersion: customer.recordVersion"));
  assert.match(surface, /disabled={!readiness\?\.eligible}/);
  assert.ok(surface.includes("Credit and designation history"));
  assert.ok(surface.includes('name="countryCode"'));
  assert.ok(surface.includes('name="channelCode"'));
  assert.doesNotMatch(surface, /fetch\([^)]*master\./);
});
