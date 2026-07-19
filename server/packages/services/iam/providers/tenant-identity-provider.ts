/**
 * Tenant identity-provider policy and normalization.
 *
 * This module deliberately contains no provider credentials or assertions.
 * Keycloak owns broker configuration and the secret manager owns secrets;
 * Athyper stores only the routing/policy reference needed by discovery.
 */

export const TENANT_IDP_PROTOCOLS = ["oidc", "saml", "kerberos"] as const;
export type TenantIdpProtocol = typeof TENANT_IDP_PROTOCOLS[number];

export const TENANT_IDP_PROVIDER_TYPES = [
  "generic",
  "entra-id",
  "google-workspace",
  "linkedin",
  "okta",
  "adfs",
  "ping",
  "sap-identity",
  "windows-kerberos",
] as const;
export type TenantIdpProviderType = typeof TENANT_IDP_PROVIDER_TYPES[number];

export type TenantIdpPlane = "neon" | "mesh" | "admin";
export type TenantIdpLoginMode = "optional" | "preferred" | "exclusive";
export type TenantIdpFirstLoginPolicy = "invite-only" | "jit" | "existing-users-only";
export type TenantIdpMfaTrustPolicy = "never" | "conditional" | "trusted-assurance";
export type TenantIdpFeatureGate = "core" | "windows-kerberos";

export interface TenantIdentityProviderInput {
  alias: string;
  protocol: TenantIdpProtocol;
  providerType: TenantIdpProviderType;
  displayName: string;
  loginMode?: TenantIdpLoginMode;
  firstLoginPolicy?: TenantIdpFirstLoginPolicy;
  mfaTrustPolicy?: TenantIdpMfaTrustPolicy;
  allowedPlanes: TenantIdpPlane[];
  configurationRef: string;
  featureGate?: TenantIdpFeatureGate;
}

export interface NormalizedTenantIdentityProvider extends Required<
  Omit<TenantIdentityProviderInput, "allowedPlanes">
> {
  allowedPlanes: TenantIdpPlane[];
  providerLabel: string;
  iconKey: "microsoft" | "google" | "linkedin" | "key" | "organization";
  requiresAthyperMfa: boolean;
}

export type TenantIdpValidationResult = {
  ok: true;
  value: NormalizedTenantIdentityProvider;
} | {
  ok: false;
  errors: string[];
};

interface ProviderDefinition {
  label: string;
  iconKey: NormalizedTenantIdentityProvider["iconKey"];
  protocols: readonly TenantIdpProtocol[];
  defaultMfaTrustPolicy: TenantIdpMfaTrustPolicy;
  allowedPlanes: readonly TenantIdpPlane[];
  requiresAthyperMfa: boolean;
  featureGate: TenantIdpFeatureGate;
}

const PROVIDER_DEFINITIONS: Record<TenantIdpProviderType, ProviderDefinition> = {
  generic: {
    label: "Organization sign-in",
    iconKey: "organization",
    protocols: ["oidc", "saml"],
    defaultMfaTrustPolicy: "never",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  "entra-id": {
    label: "Continue with Microsoft",
    iconKey: "microsoft",
    protocols: ["oidc", "saml"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  "google-workspace": {
    label: "Continue with Google Workspace",
    iconKey: "google",
    protocols: ["oidc"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  linkedin: {
    label: "Continue with LinkedIn",
    iconKey: "linkedin",
    protocols: ["oidc"],
    defaultMfaTrustPolicy: "never",
    allowedPlanes: ["mesh"],
    requiresAthyperMfa: true,
    featureGate: "core",
  },
  okta: {
    label: "Continue with Okta",
    iconKey: "organization",
    protocols: ["oidc", "saml"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  adfs: {
    label: "Continue with ADFS",
    iconKey: "organization",
    protocols: ["saml"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  ping: {
    label: "Continue with Ping Identity",
    iconKey: "organization",
    protocols: ["oidc", "saml"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  "sap-identity": {
    label: "Continue with SAP Identity Authentication",
    iconKey: "organization",
    protocols: ["saml", "oidc"],
    defaultMfaTrustPolicy: "conditional",
    allowedPlanes: ["neon", "mesh", "admin"],
    requiresAthyperMfa: false,
    featureGate: "core",
  },
  "windows-kerberos": {
    label: "Continue with Windows",
    iconKey: "key",
    protocols: ["kerberos"],
    defaultMfaTrustPolicy: "never",
    allowedPlanes: ["neon", "mesh"],
    requiresAthyperMfa: false,
    featureGate: "windows-kerberos",
  },
};

export function tenantIdentityProviderDefinition(providerType: TenantIdpProviderType): ProviderDefinition {
  return PROVIDER_DEFINITIONS[providerType];
}

export function isWindowsKerberosEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export function validateTenantIdentityProvider(
  input: TenantIdentityProviderInput,
  options: { windowsKerberosEnabled?: boolean } = {},
): TenantIdpValidationResult {
  const errors: string[] = [];
  const alias = input.alias.trim();
  const displayName = input.displayName.trim();
  const configurationRef = input.configurationRef.trim();
  const definition = PROVIDER_DEFINITIONS[input.providerType];

  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(alias)) errors.push("alias must be 1-128 characters using letters, digits, '.', '_' or '-'.");
  if (!displayName || displayName.length > 160) errors.push("displayName is required and must be at most 160 characters.");
  if (!/^[a-zA-Z0-9._:/-]{1,256}$/.test(configurationRef)) errors.push("configurationRef must be a non-secret configuration reference.");
  if (!definition) errors.push("providerType is not supported.");
  if (!TENANT_IDP_PROTOCOLS.includes(input.protocol)) errors.push("protocol is not supported.");
  if (definition && !definition.protocols.includes(input.protocol)) errors.push(`${input.providerType} does not support ${input.protocol}.`);

  const allowedPlanes = [...new Set(input.allowedPlanes)];
  if (allowedPlanes.length === 0) errors.push("allowedPlanes must contain at least one plane.");
  for (const plane of allowedPlanes) {
    if (!["neon", "mesh", "admin"].includes(plane)) errors.push(`unsupported plane '${String(plane)}'.`);
    if (definition && !definition.allowedPlanes.includes(plane)) errors.push(`${input.providerType} is not eligible for ${plane}.`);
  }
  if (input.providerType === "linkedin" && allowedPlanes.includes("admin")) errors.push("LinkedIn cannot be enabled for Admin.");

  const featureGate = input.featureGate ?? definition?.featureGate ?? "core";
  if (featureGate === "windows-kerberos" && !options.windowsKerberosEnabled) {
    errors.push("Windows/Kerberos requires ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=true.");
  }
  if (input.providerType === "windows-kerberos" && featureGate !== "windows-kerberos") {
    errors.push("windows-kerberos must use the windows-kerberos feature gate.");
  }
  if (input.providerType !== "windows-kerberos" && featureGate !== "core") {
    errors.push("Only Windows/Kerberos may use the windows-kerberos feature gate.");
  }

  const loginMode = input.loginMode ?? "optional";
  const firstLoginPolicy = input.firstLoginPolicy ?? "existing-users-only";
  const mfaTrustPolicy = input.mfaTrustPolicy ?? definition?.defaultMfaTrustPolicy ?? "never";
  if (!["optional", "preferred", "exclusive"].includes(loginMode)) errors.push("loginMode is not supported.");
  if (!["invite-only", "jit", "existing-users-only"].includes(firstLoginPolicy)) errors.push("firstLoginPolicy is not supported.");
  if (!["never", "conditional", "trusted-assurance"].includes(mfaTrustPolicy)) errors.push("mfaTrustPolicy is not supported.");
  if (input.providerType === "linkedin" && mfaTrustPolicy !== "never") errors.push("LinkedIn must always require Athyper MFA for sensitive access.");
  if (input.providerType === "windows-kerberos" && loginMode === "exclusive" && !allowedPlanes.includes("neon")) {
    errors.push("Windows/Kerberos exclusive mode is only supported for controlled Neon workforce deployments.");
  }

  if (errors.length > 0 || !definition) return { ok: false, errors };
  return {
    ok: true,
    value: {
      alias,
      protocol: input.protocol,
      providerType: input.providerType,
      displayName,
      loginMode,
      firstLoginPolicy,
      mfaTrustPolicy,
      allowedPlanes,
      configurationRef,
      featureGate,
      providerLabel: definition.label,
      iconKey: definition.iconKey,
      requiresAthyperMfa: definition.requiresAthyperMfa,
    },
  };
}

export function isTenantIdentityProviderEligibleForPlane(
  providerType: TenantIdpProviderType,
  plane: TenantIdpPlane,
  featureGate: TenantIdpFeatureGate = "core",
  windowsKerberosEnabled = isWindowsKerberosEnabled(),
): boolean {
  const definition = PROVIDER_DEFINITIONS[providerType];
  if (!definition || !definition.allowedPlanes.includes(plane)) return false;
  if (definition.featureGate === "windows-kerberos" || featureGate === "windows-kerberos") return windowsKerberosEnabled;
  return true;
}

export function defaultProviderLabel(providerType: TenantIdpProviderType): string {
  return PROVIDER_DEFINITIONS[providerType]?.label ?? "Organization sign-in";
}
