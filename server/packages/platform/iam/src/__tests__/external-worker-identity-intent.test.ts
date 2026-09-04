import { describe, expect, it } from "vitest";
import {
  validateExternalWorkerIdentityIntent,
  type ExternalWorkerIdentityIntentEvent,
} from "../external-worker-identity-intent.js";

const tenant = "11111111-1111-4111-8111-111111111111";
const person = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const engagement = "44444444-4444-4444-8444-444444444444";
const command = "55555555-5555-4555-8555-555555555555";
function event(
  overrides: Record<string, unknown> = {},
): ExternalWorkerIdentityIntentEvent {
  return {
    eventId: "external-worker-event-0001",
    eventType: "workforce.external_worker.identity_projection.requested",
    sourceTenantId: tenant,
    payload: {
      schema: "athyper.trustiam.identity-projection-intent/1",
      sourcePlane: "neon",
      sourceTenantId: tenant,
      authorityTenantId: tenant,
      targetTenantId: tenant,
      personId: person,
      identifier: "worker@example.test",
      displayName: "Worker",
      realmKey: "neon",
      organizationId: organization,
      relationship: "external_worker",
      sourceRef: `worker_engagement:${engagement}`,
      desiredVersion: 2,
      desiredStatus: "active",
      applications: [
        {
          plane: "neon",
          targetTenantId: tenant,
          roles: [
            {
              roleCode: "workforce.external_worker",
              scopeKind: "legal_entity",
              scopeTargetId: organization,
            },
          ],
        },
      ],
      desiredHash: "a".repeat(64),
      commandExecutionId: command,
      ...overrides,
    },
  };
}
describe("external-worker identity intent contract", () => {
  it("accepts the exact versioned engagement envelope", () =>
    expect(validateExternalWorkerIdentityIntent(event())).toMatchObject({
      relationship: "external_worker",
      desiredVersion: 2,
    }));
  it("accepts database-generated UUIDv7 command evidence", () =>
    expect(
      validateExternalWorkerIdentityIntent(
        event({ commandExecutionId: "01999111-2222-7333-8444-555555555555" }),
      ),
    ).toMatchObject({
      commandExecutionId: "01999111-2222-7333-8444-555555555555",
    }));
  it("rejects cross-tenant and unallowlisted content", () => {
    expect(() =>
      validateExternalWorkerIdentityIntent(event({ targetTenantId: person })),
    ).toThrow("TENANT_MISMATCH");
    expect(() =>
      validateExternalWorkerIdentityIntent(
        event({ metadata: { grant: "admin" } }),
      ),
    ).toThrow("CONTRACT_INVALID");
    expect(() =>
      validateExternalWorkerIdentityIntent(
        event({
          applications: [
            {
              plane: "neon",
              targetTenantId: tenant,
              roles: [
                {
                  roleCode: "workforce.external_worker",
                  scopeKind: "legal_entity",
                  scopeTargetId: organization,
                  extra: true,
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow("SCOPE_INVALID");
  });
  it("accepts only the pinned internal-employment variant", () => {
    const internal = {
      ...event(),
      eventType: "workforce.employee.identity_projection.requested" as const,
      payload: {
        ...(event().payload as Record<string, unknown>),
        relationship: "employer",
        sourceRef: `employment:${engagement}`,
        applications: [
          {
            plane: "neon",
            targetTenantId: tenant,
            roles: [
              {
                roleCode: "workforce.employee",
                scopeKind: "legal_entity",
                scopeTargetId: organization,
              },
            ],
          },
        ],
      },
    };
    expect(validateExternalWorkerIdentityIntent(internal)).toMatchObject({
      relationship: "employer",
      sourceRef: `employment:${engagement}`,
    });
    expect(() =>
      validateExternalWorkerIdentityIntent({
        ...internal,
        payload: {
          ...(internal.payload as Record<string, unknown>),
          relationship: "external_worker",
        },
      }),
    ).toThrow("CONTRACT_INVALID");
  });
});
