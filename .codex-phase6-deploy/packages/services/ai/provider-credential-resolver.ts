/**
 * ProviderCredentialResolver
 *
 * A provider-neutral seam over the current environment-backed SecretResolver.
 * It deliberately separates secret material from log/health metadata:
 *
 * - `secret` is returned only by a successful resolution.
 * - metadata contains keyed fingerprints, never a secret reference, key suffix,
 *   API key, or backend exception.
 * - references are allow-listed per provider so a model binding cannot be used
 *   to read an arbitrary process environment variable.
 *
 * The async contract is intentional. A tenant vault/BYOK backend can replace
 * NamedSecretReader later without changing provider adapters again.
 */

import { createHmac } from "node:crypto";

export type ProviderCredentialOwner = "platform" | "tenant" | "developer";
export type ProviderCredentialSource =
  | "environment"
  | "platform_vault"
  | "tenant_vault"
  | "developer_local";
export type ProviderCredentialReadiness =
  | "ready"
  | "not_configured"
  | "invalid_reference"
  | "missing"
  | "unavailable";

export interface NamedSecretReader {
  has(secretRef: string): boolean | Promise<boolean>;
  resolve(secretRef: string): string | Promise<string>;
}

export interface ProviderCredentialRequest {
  providerId: string;
  secretRef?: string | null;
  owner?: ProviderCredentialOwner;
  /**
   * Required for tenant-owned credentials. It is included in the keyed
   * fingerprint input so the same upstream key cannot be correlated across
   * tenant scopes.
   */
  scopeId?: string;
}

export interface ProviderCredentialMetadata {
  providerId: string;
  owner: ProviderCredentialOwner;
  source: ProviderCredentialSource;
  readiness: ProviderCredentialReadiness;
  referenceFingerprint: string | null;
  credentialFingerprint: string | null;
}

export type ProviderCredentialResolution =
  | {
      ready: true;
      secret: string;
      metadata: ProviderCredentialMetadata & {
        readiness: "ready";
        referenceFingerprint: string;
        credentialFingerprint: string;
      };
    }
  | {
      ready: false;
      reasonCode:
        | "CREDENTIAL_NOT_CONFIGURED"
        | "CREDENTIAL_REFERENCE_INVALID"
        | "CREDENTIAL_MISSING"
        | "CREDENTIAL_BACKEND_UNAVAILABLE";
      metadata: ProviderCredentialMetadata;
    };

export interface ProviderCredentialResolverOptions {
  /**
   * Stable, high-entropy application secret used only for HMAC fingerprints.
   * Configure ATLAS_AGENT_CREDENTIAL_FINGERPRINT_KEY with at least 32 characters.
   */
  fingerprintKey: string;
  fingerprintVersion?: string;
  allowedReferences?: Readonly<Record<string, readonly string[]>>;
}

const DEFAULT_ALLOWED_REFERENCES: Readonly<Record<string, readonly string[]>> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  voyage: ["VOYAGE_API_KEY"],
  groq: ["GROQ_API_KEY"],
};

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SECRET_REF_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;
const MIN_FINGERPRINT_KEY_LENGTH = 32;

export class ProviderCredentialUnavailableError extends Error {
  readonly code = "PROVIDER_CREDENTIAL_UNAVAILABLE";

  constructor(readonly metadata: ProviderCredentialMetadata) {
    super(
      `Provider credential is ${metadata.readiness} for provider ${metadata.providerId}.`,
    );
    this.name = "ProviderCredentialUnavailableError";
  }
}

export class ProviderCredentialResolver {
  private readonly fingerprintVersion: string;
  private readonly allowedReferences: Readonly<Record<string, ReadonlySet<string>>>;

  constructor(
    private readonly secrets: NamedSecretReader,
    private readonly options: ProviderCredentialResolverOptions,
  ) {
    if (options.fingerprintKey.length < MIN_FINGERPRINT_KEY_LENGTH) {
      throw new Error(
        `ProviderCredentialResolver requires a fingerprint key of at least ${MIN_FINGERPRINT_KEY_LENGTH} characters.`,
      );
    }
    this.fingerprintVersion = normaliseFingerprintVersion(
      options.fingerprintVersion ?? "v1",
    );
    this.allowedReferences = buildAllowedReferences(options.allowedReferences);
  }

  async resolve(
    request: ProviderCredentialRequest,
  ): Promise<ProviderCredentialResolution> {
    const providerId = normaliseProviderId(request.providerId);
    const owner = request.owner ?? "platform";
    const secretRef = request.secretRef?.trim() ?? "";
    const scopeId = request.scopeId?.trim() ?? "";
    const referenceFingerprint = secretRef
      ? this.fingerprint("ref", providerId, owner, scopeId, secretRef)
      : null;

    if (!secretRef) {
      return this.notReady(
        providerId,
        owner,
        "not_configured",
        referenceFingerprint,
        "CREDENTIAL_NOT_CONFIGURED",
      );
    }

    if (
      providerId === "invalid"
      || !SECRET_REF_PATTERN.test(secretRef)
      || (owner === "tenant" && !scopeId)
      || !this.allowedReferences[providerId]?.has(secretRef)
    ) {
      return this.notReady(
        providerId,
        owner,
        "invalid_reference",
        referenceFingerprint,
        "CREDENTIAL_REFERENCE_INVALID",
      );
    }

    try {
      if (!await this.secrets.has(secretRef)) {
        return this.notReady(
          providerId,
          owner,
          "missing",
          referenceFingerprint,
          "CREDENTIAL_MISSING",
        );
      }

      const secret = await this.secrets.resolve(secretRef);
      if (typeof secret !== "string" || secret.trim() === "") {
        return this.notReady(
          providerId,
          owner,
          "missing",
          referenceFingerprint,
          "CREDENTIAL_MISSING",
        );
      }

      return {
        ready: true,
        secret,
        metadata: {
          providerId,
          owner,
          source: "environment",
          readiness: "ready",
          referenceFingerprint: referenceFingerprint!,
          credentialFingerprint: this.fingerprint(
            "credential",
            providerId,
            owner,
            scopeId,
            secret,
          ),
        },
      };
    } catch {
      return this.notReady(
        providerId,
        owner,
        "unavailable",
        referenceFingerprint,
        "CREDENTIAL_BACKEND_UNAVAILABLE",
      );
    }
  }

  async require(
    request: ProviderCredentialRequest,
  ): Promise<Extract<ProviderCredentialResolution, { ready: true }>> {
    const result = await this.resolve(request);
    if (!result.ready) {
      throw new ProviderCredentialUnavailableError(result.metadata);
    }
    return result;
  }

  private notReady(
    providerId: string,
    owner: ProviderCredentialOwner,
    readiness: Exclude<ProviderCredentialReadiness, "ready">,
    referenceFingerprint: string | null,
    reasonCode: Extract<ProviderCredentialResolution, { ready: false }>["reasonCode"],
  ): Extract<ProviderCredentialResolution, { ready: false }> {
    return {
      ready: false,
      reasonCode,
      metadata: {
        providerId,
        owner,
        source: "environment",
        readiness,
        referenceFingerprint,
        credentialFingerprint: null,
      },
    };
  }

  private fingerprint(
    kind: "ref" | "credential",
    providerId: string,
    owner: ProviderCredentialOwner,
    scopeId: string,
    value: string,
  ): string {
    const digest = createHmac("sha256", this.options.fingerprintKey)
      .update(kind)
      .update("\0")
      .update(providerId)
      .update("\0")
      .update(owner)
      .update("\0")
      .update(scopeId)
      .update("\0")
      .update(value)
      .digest("hex")
      .slice(0, 32);
    return `${kind}:hmac-sha256:${this.fingerprintVersion}:${digest}`;
  }
}

function normaliseProviderId(value: string): string {
  const providerId = value.trim().toLowerCase();
  return PROVIDER_ID_PATTERN.test(providerId) ? providerId : "invalid";
}

function normaliseFingerprintVersion(value: string): string {
  const version = value.trim().toLowerCase();
  if (!/^v[1-9][0-9]{0,3}$/.test(version)) {
    throw new Error("ProviderCredentialResolver fingerprintVersion must match v<number>.");
  }
  return version;
}

function buildAllowedReferences(
  additions: ProviderCredentialResolverOptions["allowedReferences"],
): Readonly<Record<string, ReadonlySet<string>>> {
  const merged: Record<string, Set<string>> = {};
  for (const [providerId, refs] of Object.entries(DEFAULT_ALLOWED_REFERENCES)) {
    merged[providerId] = new Set(refs);
  }
  for (const [rawProviderId, refs] of Object.entries(additions ?? {})) {
    const providerId = normaliseProviderId(rawProviderId);
    if (providerId === "invalid") continue;
    const target = merged[providerId] ?? new Set<string>();
    for (const ref of refs) {
      if (SECRET_REF_PATTERN.test(ref)) target.add(ref);
    }
    merged[providerId] = target;
  }
  return merged;
}
