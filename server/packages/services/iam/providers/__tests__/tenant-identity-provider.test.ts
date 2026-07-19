import { describe, expect, it } from "vitest";
import {
  isTenantIdentityProviderEligibleForPlane,
  validateTenantIdentityProvider,
} from "../tenant-identity-provider.js";
import { buildKeycloakProviderProvisioningDescriptor } from "../keycloak-provider.contract.js";

const base = {
  alias: "acme-provider",
  displayName: "Acme organization sign-in",
  configurationRef: "tenant/acme/oidc/prod",
  allowedPlanes: ["neon"] as ("neon" | "mesh" | "admin")[],
};

describe("tenant identity-provider policy", () => {
  it("accepts generic OIDC and maps it to Keycloak's OIDC broker", () => {
    const result = validateTenantIdentityProvider({ ...base, protocol: "oidc", providerType: "generic" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildKeycloakProviderProvisioningDescriptor(result.value)).toMatchObject({
      providerId: "oidc",
      protocol: "oidc",
      enabled: false,
      safety: { trustEmail: false, storeToken: false, externalClaimsAuthorize: false },
      secretReferences: ["issuer", "client-id", "client-secret"],
    });
  });

  it("accepts generic SAML and requires metadata references", () => {
    const result = validateTenantIdentityProvider({
      ...base,
      protocol: "saml",
      providerType: "generic",
      configurationRef: "tenant/acme/saml/okta-prod",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildKeycloakProviderProvisioningDescriptor(result.value)).toMatchObject({
      providerId: "saml",
      secretReferences: ["saml-metadata", "saml-signing-certificate"],
    });
  });

  it("supports Entra through OIDC or SAML but rejects Google Workspace SAML", () => {
    expect(validateTenantIdentityProvider({ ...base, protocol: "oidc", providerType: "entra-id" }).ok).toBe(true);
    expect(validateTenantIdentityProvider({ ...base, protocol: "saml", providerType: "entra-id" }).ok).toBe(true);
    expect(validateTenantIdentityProvider({ ...base, protocol: "saml", providerType: "google-workspace" }).ok).toBe(false);
  });

  it("restricts LinkedIn to Mesh and keeps Athyper MFA mandatory", () => {
    const allowed = validateTenantIdentityProvider({
      ...base,
      protocol: "oidc",
      providerType: "linkedin",
      allowedPlanes: ["mesh"],
      mfaTrustPolicy: "never",
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.value.requiresAthyperMfa).toBe(true);

    expect(validateTenantIdentityProvider({
      ...base,
      protocol: "oidc",
      providerType: "linkedin",
      allowedPlanes: ["admin"],
      mfaTrustPolicy: "never",
    }).ok).toBe(false);
  });

  it("keeps Windows/Kerberos behind its explicit enterprise feature gate", () => {
    const input = {
      ...base,
      protocol: "kerberos" as const,
      providerType: "windows-kerberos" as const,
      allowedPlanes: ["neon"] as ("neon" | "mesh" | "admin")[],
      featureGate: "windows-kerberos" as const,
    };
    expect(validateTenantIdentityProvider(input).ok).toBe(false);
    const enabled = validateTenantIdentityProvider(input, { windowsKerberosEnabled: true });
    expect(enabled.ok).toBe(true);
    if (enabled.ok) expect(buildKeycloakProviderProvisioningDescriptor(enabled.value).providerId).toBe("kerberos");
    expect(isTenantIdentityProviderEligibleForPlane("windows-kerberos", "neon", "windows-kerberos", false)).toBe(false);
    expect(isTenantIdentityProviderEligibleForPlane("windows-kerberos", "neon", "windows-kerberos", true)).toBe(true);
  });
});
