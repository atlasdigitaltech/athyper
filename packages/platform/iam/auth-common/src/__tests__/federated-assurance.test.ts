import { describe, expect, it } from "vitest";
import {
  evaluateFederatedMfaPolicy,
  normalizeFederatedAssurance,
} from "../federated-assurance";

const NOW = 1_750_000_000;

describe("federated authentication assurance", () => {
  it("normalizes OIDC acr/amr and accepts explicit tenant-trusted MFA", () => {
    const assurance = normalizeFederatedAssurance({
      identity_provider: "acme-entra",
      identity_provider_protocol: "oidc",
      external_acr: "aal2",
      external_amr: ["pwd", "mfa"],
      auth_time: NOW - 30,
    });

    expect(assurance).toMatchObject({
      source: "federated",
      protocol: "oidc",
      identityProvider: "acme-entra",
      externalAssuranceLevel: "aal2",
      externalMfaSatisfied: true,
    });
    expect(evaluateFederatedMfaPolicy(assurance, "conditional", {
      plane: "neon",
      nowSeconds: NOW,
    })).toMatchObject({
      externalEvidenceAccepted: true,
      athyperMfaRequired: false,
    });
  });

  it("maps phishing-resistant SAML AuthnContext to AAL3", () => {
    const assurance = normalizeFederatedAssurance({
      identity_provider: "acme-saml",
      identity_protocol: "saml",
      saml_authn_context: "urn:oasis:names:tc:SAML:2.0:ac:classes:SmartcardPKI",
      auth_time: NOW,
    });

    expect(assurance).toMatchObject({
      protocol: "saml",
      assuranceLevel: "aal3",
      externalAssuranceLevel: "aal3",
      externalPhishingResistant: true,
    });
  });

  it("does not trust an unrecognized or stale external MFA signal", () => {
    const assurance = normalizeFederatedAssurance({
      identity_provider: "acme-oidc",
      acr: "urn:example:unknown",
      amr: ["pwd"],
      auth_time: NOW - 3_600,
    });
    const decision = evaluateFederatedMfaPolicy(assurance, "conditional", {
      plane: "mesh",
      nowSeconds: NOW,
    });

    expect(assurance.externalMfaSatisfied).toBe(false);
    expect(decision.athyperMfaRequired).toBe(true);
    expect(decision.reason).toBe("fresh-step-up-required");
  });

  it("keeps external MFA from satisfying Admin when the tenant policy is never", () => {
    const assurance = normalizeFederatedAssurance({
      identity_provider: "acme-entra",
      acr: "aal2",
      amr: ["pwd", "mfa"],
      auth_time: NOW,
    });
    const decision = evaluateFederatedMfaPolicy(assurance, "never", {
      plane: "admin",
      nowSeconds: NOW,
    });

    expect(assurance.externalAssuranceLevel).toBe("aal2");
    expect(assurance.keycloakAssuranceLevel).toBe("aal1");
    expect(decision.athyperMfaRequired).toBe(true);
    expect(decision.meetsRequiredAssurance).toBe(false);
  });

  it("allows a trusted AAL2 enterprise assertion to satisfy the Admin AAL2 boundary", () => {
    const assurance = normalizeFederatedAssurance({
      identity_provider: "acme-entra",
      external_acr: "aal2",
      external_amr: ["pwd", "mfa"],
      auth_time: NOW,
    });
    const decision = evaluateFederatedMfaPolicy(assurance, "trusted-assurance", {
      plane: "admin",
      nowSeconds: NOW,
    });

    expect(decision).toMatchObject({
      externalEvidenceAccepted: true,
      athyperMfaRequired: false,
      meetsRequiredAssurance: true,
    });
  });
});
