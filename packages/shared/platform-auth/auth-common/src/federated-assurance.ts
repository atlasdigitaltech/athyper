/**
 * Federated authentication assurance contract.
 *
 * Keycloak is the only token issuer trusted by Athyper. This module does not
 * trust an external provider claim by itself; it normalizes the evidence that
 * Keycloak chose to publish and leaves the tenant policy decision to
 * `evaluateFederatedMfaPolicy`.
 */

export const AUTHENTICATION_ASSURANCE_LEVELS = ["aal1", "aal2", "aal3"] as const;
export type AuthenticationAssuranceLevel = typeof AUTHENTICATION_ASSURANCE_LEVELS[number];

export const FEDERATED_PROTOCOLS = ["oidc", "saml", "kerberos", "unknown"] as const;
export type FederatedProtocol = typeof FEDERATED_PROTOCOLS[number];

export const TENANT_MFA_TRUST_POLICIES = ["never", "conditional", "trusted-assurance"] as const;
export type TenantMfaTrustPolicy = typeof TENANT_MFA_TRUST_POLICIES[number];

export interface NormalizedFederatedAssurance {
  source: "local" | "federated" | "unknown";
  protocol: FederatedProtocol;
  identityProvider: string | null;
  acr: string | null;
  amr: string[];
  externalAcr: string | null;
  externalAmr: string[];
  samlAuthnContext: string | null;
  assuranceLevel: AuthenticationAssuranceLevel;
  externalAssuranceLevel: AuthenticationAssuranceLevel;
  keycloakAssuranceLevel: AuthenticationAssuranceLevel;
  mfaSatisfied: boolean;
  externalMfaSatisfied: boolean;
  keycloakMfaSatisfied: boolean;
  phishingResistant: boolean;
  externalPhishingResistant: boolean;
  keycloakPhishingResistant: boolean;
  authenticationTime: number | null;
  evidence: "explicit" | "inferred" | "none";
}

export interface FederatedMfaPolicyDecision {
  external: boolean;
  externalEvidenceAccepted: boolean;
  athyperMfaRequired: boolean;
  requiredAssurance: AuthenticationAssuranceLevel;
  meetsRequiredAssurance: boolean;
  phishingResistantPreferred: boolean;
  reason:
    | "local-assurance-sufficient"
    | "external-assurance-trusted"
    | "external-assurance-insufficient"
    | "external-assurance-not-trusted"
    | "admin-aal2-required"
    | "fresh-step-up-required";
}

export interface FederatedAssuranceOptions {
  /** Signed PKCE state may provide a provider hint when KC omits the alias. */
  providerAlias?: string | null;
}

export interface FederatedMfaPolicyOptions {
  plane: "neon" | "mesh" | "admin";
  requiredAssurance?: AuthenticationAssuranceLevel;
  nowSeconds?: number;
  maxAuthenticationAgeSeconds?: number;
  privileged?: boolean;
}

const AAL_RANK: Record<AuthenticationAssuranceLevel, number> = { aal1: 1, aal2: 2, aal3: 3 };

const KEYCLOAK_MFA_METHODS = new Set([
  "otp",
  "totp",
  "hotp",
  "webauthn",
  "fido2",
  "passkey",
  "hwk",
  "pk",
]);

const PHISHING_RESISTANT_METHODS = new Set([
  "webauthn",
  "fido2",
  "passkey",
  "hwk",
  "pk",
  "smartcard",
  "smartcardpki",
  "tlsclient",
]);

const MFA_METHODS = new Set(["mfa", "otp", "totp", "hotp", "sms", "webauthn", "fido2", "passkey", "hwk", "pk", "swk"]);

export function normalizeFederatedAssurance(
  ...inputs: Array<Record<string, unknown> | null | undefined | FederatedAssuranceOptions>
): NormalizedFederatedAssurance {
  const claims = inputs.filter(isClaimsRecord) as Array<Record<string, unknown>>;
  const options = inputs.find(isAssuranceOptions);
  const amr = uniqueStrings(claims.flatMap((claim) => claimStrings(claim, ["amr"]))).map(normalizeMethod);
  const externalAmr = uniqueStrings(claims.flatMap((claim) => claimStrings(claim, [
    "athyper.external_amr",
    "external_amr",
    "federated_amr",
  ]))).map(normalizeMethod);
  const authenticationMethods = uniqueStrings(claims.flatMap((claim) => claimStrings(claim, [
    "athyper.authentication_method",
    "authentication_method",
  ]))).map(normalizeMethod);
  const allMethods = uniqueStrings([...amr, ...authenticationMethods]);
  const externalProvider = normalizeProviderAlias(firstString(claims, [
    "athyper.identity_provider",
    "identity_provider",
    "idp",
    "idp_alias",
    "provider_alias",
  ])) ?? normalizeProviderAlias(options?.providerAlias);
  const protocol = resolveProtocol(claims, externalProvider, firstString(claims, [
    "athyper.saml_authn_context",
    "saml_authn_context",
    "authn_context_class_ref",
    "AuthnContextClassRef",
  ]));
  const samlAuthnContext = firstString(claims, [
    "athyper.saml_authn_context",
    "saml_authn_context",
    "authn_context_class_ref",
    "AuthnContextClassRef",
  ]);
  const acr = firstString(claims, ["acr", "athyper.acr"]);
  const externalAcr = firstString(claims, ["athyper.external_acr", "external_acr", "federated_acr"]);
  const source: NormalizedFederatedAssurance["source"] = externalProvider || protocol !== "unknown"
    ? "federated"
    : allMethods.length > 0
      ? "local"
      : "unknown";

  const externalEvidenceMethods = externalAmr.length > 0 ? externalAmr : source === "federated" ? amr : [];
  const externalEvidenceAcr = externalAcr ?? (source === "federated" ? (acr ?? null) : null);
  const externalAssurance = deriveAssurance(externalEvidenceMethods, externalEvidenceAcr, samlAuthnContext ?? null);
  const effectiveAssurance = deriveAssurance(allMethods, acr ?? null, samlAuthnContext ?? null);
  // When the broker has not published an explicit federated_amr claim, only
  // Keycloak-specific strong methods are eligible as local step-up evidence.
  // Generic `mfa`/`sms` values remain external/ambiguous and cannot satisfy a
  // tenant policy of `never`.
  const keycloakMethods = source === "federated" && externalAmr.length === 0
    ? allMethods.filter((method) => KEYCLOAK_MFA_METHODS.has(method))
    : allMethods.filter((method) => !externalAmr.includes(method));
  const keycloakAssurance = source === "federated" && externalAmr.length === 0
    ? (isKeycloakMfaSource(claims) ? effectiveAssurance : deriveAssurance(keycloakMethods, null, null))
    : deriveAssurance(keycloakMethods, null, null);
  const authenticationTime = firstNumeric(claims, ["auth_time", "athyper.auth_time", "iat"]);
  const explicitEvidence = Boolean(
    acr || externalAcr || amr.length > 0 || externalAmr.length > 0 || samlAuthnContext,
  );

  return {
    source,
    protocol,
    identityProvider: externalProvider ?? null,
    acr: acr ?? null,
    amr: allMethods,
    externalAcr: externalAcr ?? null,
    externalAmr,
    samlAuthnContext: samlAuthnContext ?? null,
    assuranceLevel: effectiveAssurance.level,
    externalAssuranceLevel: externalAssurance.level,
    keycloakAssuranceLevel: keycloakAssurance.level,
    mfaSatisfied: effectiveAssurance.level !== "aal1",
    externalMfaSatisfied: externalAssurance.level !== "aal1",
    keycloakMfaSatisfied: keycloakAssurance.level !== "aal1",
    phishingResistant: effectiveAssurance.phishingResistant,
    externalPhishingResistant: externalAssurance.phishingResistant,
    keycloakPhishingResistant: keycloakAssurance.phishingResistant,
    authenticationTime,
    evidence: explicitEvidence ? "explicit" : source === "federated" ? "inferred" : "none",
  };
}

export function evaluateFederatedMfaPolicy(
  assurance: NormalizedFederatedAssurance,
  policy: TenantMfaTrustPolicy,
  options: FederatedMfaPolicyOptions,
): FederatedMfaPolicyDecision {
  const requiredAssurance = options.requiredAssurance ?? (options.plane === "admin" ? "aal2" : "aal1");
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAuthenticationAgeSeconds ?? 900;
  const isRecent = assurance.authenticationTime !== null
    && assurance.authenticationTime <= nowSeconds + 30
    && nowSeconds - assurance.authenticationTime <= maxAge;
  const external = assurance.source === "federated";
  const externalEvidenceAccepted = external
    && policy !== "never"
    && assurance.externalAssuranceLevel !== "aal1"
    && isRecent
    && (policy !== "trusted-assurance" || assurance.evidence === "explicit");
  const requiredAssuranceMet = meetsAssurance(assurance, requiredAssurance);
  const keycloakAssuranceMet = meetsAssurance(
    { ...assurance, assuranceLevel: assurance.keycloakAssuranceLevel },
    requiredAssurance,
  );
  const athyperMfaRequired = external
    ? !externalEvidenceAccepted && !assurance.keycloakMfaSatisfied
    : !requiredAssuranceMet;
  const phishingResistantPreferred = options.privileged === true;

  let reason: FederatedMfaPolicyDecision["reason"];
  if (options.plane === "admin" && !requiredAssuranceMet && !keycloakAssuranceMet) {
    reason = "admin-aal2-required";
  } else if (externalEvidenceAccepted) {
    reason = "external-assurance-trusted";
  } else if (external && assurance.authenticationTime !== null && !isRecent) {
    reason = "fresh-step-up-required";
  } else if (external && policy === "never") {
    reason = "external-assurance-not-trusted";
  } else if (external) {
    reason = "external-assurance-insufficient";
  } else {
    reason = "local-assurance-sufficient";
  }

  return {
    external,
    externalEvidenceAccepted,
    athyperMfaRequired,
    requiredAssurance,
    meetsRequiredAssurance: keycloakAssuranceMet || externalEvidenceAccepted,
    phishingResistantPreferred,
    reason,
  };
}

export function meetsAssurance(
  assurance: Pick<NormalizedFederatedAssurance, "assuranceLevel">,
  required: AuthenticationAssuranceLevel,
): boolean {
  return AAL_RANK[assurance.assuranceLevel] >= AAL_RANK[required];
}

export function isFreshAuthentication(
  assurance: Pick<NormalizedFederatedAssurance, "authenticationTime">,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 900,
): boolean {
  return assurance.authenticationTime !== null
    && assurance.authenticationTime <= nowSeconds + 30
    && nowSeconds - assurance.authenticationTime <= maxAgeSeconds;
}

function deriveAssurance(
  methods: readonly string[],
  acr: string | null,
  samlAuthnContext: string | null,
): { level: AuthenticationAssuranceLevel; phishingResistant: boolean } {
  const normalizedAcr = acr?.toLowerCase() ?? "";
  const normalizedSaml = samlAuthnContext?.toLowerCase() ?? "";
  const phishingResistant = methods.some((method) => PHISHING_RESISTANT_METHODS.has(method))
    || /smartcardpki|smartcard|tlsclient|fido|phishing[-_ ]?resistant|\bphr\b/.test(normalizedAcr)
    || /smartcardpki|smartcard|tlsclient|fido/.test(normalizedSaml);
  if (phishingResistant || /aal3|loa[:._ -]?3|high|phishing[-_ ]?resistant|\bphr\b/.test(normalizedAcr)) {
    return { level: "aal3", phishingResistant: true };
  }
  if (
    methods.some((method) => MFA_METHODS.has(method))
    || /aal2|loa[:._ -]?2|\bmfa\b|substantial/.test(normalizedAcr)
    || /timesynctoken|mobiletwofactorcontract|smartcard/.test(normalizedSaml)
  ) {
    return { level: "aal2", phishingResistant: false };
  }
  return { level: "aal1", phishingResistant: false };
}

function resolveProtocol(
  claims: Array<Record<string, unknown>>,
  provider: string | undefined,
  samlAuthnContext: string | undefined,
): FederatedProtocol {
  const explicit = firstString(claims, ["athyper.identity_protocol", "identity_provider_protocol", "protocol"])
    ?.toLowerCase();
  if (explicit === "oidc" || explicit === "saml" || explicit === "kerberos") return explicit;
  if (samlAuthnContext) return "saml";
  if (provider) return "oidc";
  return "unknown";
}

function isKeycloakMfaSource(claims: Array<Record<string, unknown>>): boolean {
  return firstString(claims, ["athyper.mfa_source", "mfa_source"])?.toLowerCase() === "keycloak";
}

function isClaimsRecord(value: Record<string, unknown> | FederatedAssuranceOptions | null | undefined): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !("providerAlias" in value));
}

function isAssuranceOptions(value: Record<string, unknown> | FederatedAssuranceOptions | null | undefined): value is FederatedAssuranceOptions {
  return Boolean(value && typeof value === "object" && "providerAlias" in value);
}

function claimStrings(claims: Record<string, unknown>, keys: readonly string[]): string[] {
  return keys.flatMap((key) => {
    const value = claims[key];
    if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
    return [];
  });
}

function firstString(claims: Array<Record<string, unknown>>, keys: readonly string[]): string | undefined {
  for (const claim of claims) {
    for (const key of keys) {
      const value = claim[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const first = value.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
        if (first) return first.trim();
      }
    }
  }
  return undefined;
}

function firstNumeric(claims: Array<Record<string, unknown>>, keys: readonly string[]): number | null {
  for (const claim of claims) {
    for (const key of keys) {
      const value = claim[key];
      const number = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
      if (Number.isFinite(number) && number > 0) return Math.floor(number);
    }
  }
  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeMethod(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeProviderAlias(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || ["local", "password", "keycloak", "none"].includes(normalized.toLowerCase())) return undefined;
  return /^[a-zA-Z0-9._-]{1,128}$/.test(normalized) ? normalized : undefined;
}
