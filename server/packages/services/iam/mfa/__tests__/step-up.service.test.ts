import { describe, expect, it } from "vitest";
import {
  createStepUpBinding,
  createStepUpService,
  hasFreshKeycloakStepUpAssurance,
  type StepUpBinding,
} from "../step-up.service.js";
import type { CacheClient } from "../../session/session.service.js";

function fakeCache(): CacheClient {
  const values = new Map<string, string>();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async del(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
  };
}

function binding(overrides: Partial<StepUpBinding> = {}): StepUpBinding {
  return {
    subject: "user-1",
    tenantId: "tenant-a",
    sessionId: "kc-session-a",
    actionClass: "iam_admin",
    assurance: {
      assuranceLevel: "aal2",
      keycloakAssuranceLevel: "aal2",
      authenticationTime: Math.floor(Date.now() / 1000),
      keycloakMfaSatisfied: true,
      keycloakPhishingResistant: false,
    },
    ...overrides,
  };
}

describe("Keycloak session-bound step-up elevations", () => {
  it("does not replay an elevation across session, tenant, or action class", async () => {
    const service = createStepUpService(fakeCache());
    const original = binding();
    await service.grantElevation(original, 60);

    await expect(service.isElevated(original)).resolves.toBe(true);
    await expect(service.isElevated(binding({ sessionId: "kc-session-b" }))).resolves.toBe(false);
    await expect(service.isElevated(binding({ tenantId: "tenant-b" }))).resolves.toBe(false);
    await expect(service.isElevated(binding({ actionClass: "payment_release" }))).resolves.toBe(false);
  });

  it("requires an issuer-controlled session claim when creating a binding", () => {
    const claims = {
      sub: "user-1",
      amr: ["otp"],
      acr: "aal2",
      auth_time: Math.floor(Date.now() / 1000),
    };
    expect(createStepUpBinding(claims, "user-1", "tenant-a", "iam_admin")).toBeNull();
    expect(createStepUpBinding({ ...claims, sid: "kc-session-a" }, "user-1", "tenant-a", "iam_admin"))
      .toMatchObject({ sessionId: "kc-session-a", actionClass: "iam_admin" });
  });

  it("does not treat external IdP MFA as Athyper step-up", () => {
    const now = Math.floor(Date.now() / 1000);
    const externalClaims = {
      identity_provider: "acme-entra",
      identity_provider_protocol: "oidc",
      external_acr: "aal2",
      external_amr: ["pwd", "mfa"],
      auth_time: now,
      sid: "kc-session-a",
    };

    expect(hasFreshKeycloakStepUpAssurance(externalClaims, now)).toBe(false);
    expect(hasFreshKeycloakStepUpAssurance({
      ...externalClaims,
      amr: ["pwd", "otp"],
      "athyper.mfa_source": "keycloak",
    }, now)).toBe(true);
  });
});
