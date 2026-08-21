import {
  tenantIdentityProviderDefinition,
  type NormalizedTenantIdentityProvider,
  type TenantIdpProtocol,
  type TenantIdpProviderType,
} from "./tenant-identity-provider.js";

/**
 * Secret-free contract consumed by the Keycloak provisioning adapter.
 *
 * The runtime service intentionally does not call Keycloak or a secret
 * manager. It hands an adapter the references it is allowed to resolve;
 * actual issuer URLs, client secrets, certificates, metadata and keytabs stay
 * outside the Athyper application database.
 */
export interface KeycloakProviderProvisioningDescriptor {
  realmKey: string;
  alias: string;
  displayName: string;
  providerId: "oidc" | "saml" | "microsoft" | "google" | "linkedin" | "kerberos";
  protocol: TenantIdpProtocol;
  providerType: TenantIdpProviderType;
  configurationRef: string;
  allowedPlanes: readonly string[];
  enabled: boolean;
  safety: {
    trustEmail: false;
    storeToken: false;
    addReadTokenRoleOnCreate: false;
    externalClaimsAuthorize: false;
  };
  secretReferences: readonly ("issuer" | "client-id" | "client-secret" | "saml-metadata" | "saml-signing-certificate" | "kerberos-keytab" | "kerberos-service-principal")[];
}

export function buildKeycloakProviderProvisioningDescriptor(
  provider: NormalizedTenantIdentityProvider,
  realmKey = "athyper",
): KeycloakProviderProvisioningDescriptor {
  return {
    realmKey,
    alias: provider.alias,
    displayName: provider.displayName,
    providerId: keycloakProviderId(provider.providerType, provider.protocol),
    protocol: provider.protocol,
    providerType: provider.providerType,
    configurationRef: provider.configurationRef,
    allowedPlanes: provider.allowedPlanes,
    enabled: false,
    safety: {
      trustEmail: false,
      storeToken: false,
      addReadTokenRoleOnCreate: false,
      externalClaimsAuthorize: false,
    },
    secretReferences: secretReferencesFor(provider),
  };
}

export function keycloakProviderId(
  providerType: TenantIdpProviderType,
  protocol: TenantIdpProtocol,
): KeycloakProviderProvisioningDescriptor["providerId"] {
  if (protocol === "kerberos") return "kerberos";
  if (providerType === "entra-id") return protocol === "oidc" ? "microsoft" : "saml";
  if (providerType === "google-workspace") return "google";
  if (providerType === "linkedin") return "linkedin";
  return protocol;
}

function secretReferencesFor(
  provider: NormalizedTenantIdentityProvider,
): KeycloakProviderProvisioningDescriptor["secretReferences"] {
  if (provider.protocol === "kerberos") {
    return ["kerberos-keytab", "kerberos-service-principal"];
  }
  if (provider.protocol === "saml") {
    return ["saml-metadata", "saml-signing-certificate"];
  }
  return ["issuer", "client-id", "client-secret"];
}

export function providerDisplayLabel(providerType: TenantIdpProviderType): string {
  return tenantIdentityProviderDefinition(providerType).label;
}
