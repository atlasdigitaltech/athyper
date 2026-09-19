import type { SecretStore } from "@athyper/server-contract-secrets";
import type {
  IdentityProviderAdapter,
  IdentityRelationship,
} from "./identity-saga.js";

export interface KeycloakIdentityProviderConfig {
  readonly baseUrl: string;
  readonly adminRealm: string;
  readonly clientId: string;
  readonly credentialReference: string;
  readonly secrets: SecretStore;
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
}

/** Keycloak Admin REST adapter. Credentials are resolved by opaque reference and never retained in jobs, rows, or logs. */
export class KeycloakIdentityProviderAdapter implements IdentityProviderAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly config: KeycloakIdentityProviderConfig) {
    const base = new URL(config.baseUrl);
    if (
      base.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(base.hostname)
    )
      throw new Error("KEYCLOAK_ADMIN_HTTPS_REQUIRED");
    if (
      !/^[a-zA-Z0-9._-]{1,128}$/.test(config.adminRealm) ||
      !config.clientId.trim() ||
      !config.credentialReference.trim()
    )
      throw new Error("KEYCLOAK_ADMIN_CONFIG_INVALID");
    this.baseUrl = base.toString().replace(/\/$/, "");
    this.fetcher = config.fetcher ?? fetch;
    this.now = config.now ?? Date.now;
  }

  async inviteOrCreate(input: {
    realmKey: string;
    identifier: string;
    displayName: string;
    invite: boolean;
    idempotencyKey: string;
  }): Promise<{ providerSubject: string }> {
    validateRealm(input.realmKey);
    validateIdempotency(input.idempotencyKey);
    const existing = await this.findUser(input.realmKey, input.identifier);
    if (existing) return { providerSubject: existing };
    const response = await this.request(
      input.realmKey,
      "/users",
      {
        method: "POST",
        body: JSON.stringify({
          username: input.identifier,
          email: input.identifier.includes("@") ? input.identifier : undefined,
          enabled: true,
          firstName: input.displayName,
          requiredActions: input.invite
            ? ["VERIFY_EMAIL", "UPDATE_PASSWORD"]
            : [],
        }),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": input.idempotencyKey,
        },
      },
      [201, 204, 409],
    );
    const location = response.headers.get("location"),
      located = location?.split("/").filter(Boolean).at(-1);
    const providerSubject =
      located ?? (await this.findUser(input.realmKey, input.identifier));
    if (!providerSubject) throw coded("KEYCLOAK_USER_CREATE_RECEIPT_MISSING");
    return { providerSubject };
  }

  async ensureMembership(input: {
    realmKey: string;
    providerSubject: string;
    externalOrganizationId: string;
    relationship: IdentityRelationship;
    idempotencyKey: string;
  }): Promise<void> {
    validateRealm(input.realmKey);
    validateUuidLike(input.providerSubject, "KEYCLOAK_SUBJECT_INVALID");
    validateUuidLike(
      input.externalOrganizationId,
      "KEYCLOAK_ORGANIZATION_INVALID",
    );
    validateIdempotency(input.idempotencyKey);
    await this.request(
      input.realmKey,
      `/organizations/${encodeURIComponent(input.externalOrganizationId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(input.providerSubject),
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": input.idempotencyKey,
          "x-athyper-relationship": input.relationship,
        },
      },
      [201, 204, 409],
    );
  }

  async ensureApplication(input: {
    providerSubject: string;
    plane: "studio" | "neon" | "mesh";
    targetTenantId: string;
    idempotencyKey: string;
  }): Promise<void> {
    validateUuidLike(input.providerSubject, "KEYCLOAK_SUBJECT_INVALID");
    validateUuidLike(input.targetTenantId, "KEYCLOAK_TARGET_TENANT_INVALID");
    validateIdempotency(input.idempotencyKey);
    if (!["studio", "neon", "mesh"].includes(input.plane))
      throw coded("KEYCLOAK_APPLICATION_PLANE_INVALID");
    // Application authorization remains plane-local. The provider owns authentication and organization membership only.
  }

  suspend(input: {
    realmKey: string;
    providerSubject: string;
    idempotencyKey: string;
  }): Promise<void> {
    return this.disable(input);
  }
  deprovision(input: {
    realmKey: string;
    providerSubject: string;
    idempotencyKey: string;
  }): Promise<void> {
    return this.disable(input);
  }

  private async disable(input: {
    realmKey: string;
    providerSubject: string;
    idempotencyKey: string;
  }): Promise<void> {
    validateRealm(input.realmKey);
    validateUuidLike(input.providerSubject, "KEYCLOAK_SUBJECT_INVALID");
    validateIdempotency(input.idempotencyKey);
    await this.request(
      input.realmKey,
      `/users/${encodeURIComponent(input.providerSubject)}`,
      {
        method: "PUT",
        body: '{"enabled":false}',
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": input.idempotencyKey,
        },
      },
      [204],
    );
  }

  private async findUser(
    realm: string,
    identifier: string,
  ): Promise<string | undefined> {
    const response = await this.request(
      realm,
      `/users?username=${encodeURIComponent(identifier)}&exact=true&max=2`,
      {},
      [200],
    );
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || body.length > 1)
      throw coded("KEYCLOAK_USER_LOOKUP_AMBIGUOUS");
    const id = (body[0] as { id?: unknown } | undefined)?.id;
    if (id === undefined) return undefined;
    validateUuidLike(id, "KEYCLOAK_USER_LOOKUP_INVALID");
    return String(id);
  }

  private async request(
    realm: string,
    path: string,
    init: RequestInit,
    accepted: readonly number[],
  ): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetcher(
      `${this.baseUrl}/admin/realms/${encodeURIComponent(realm)}${path}`,
      {
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (accepted.includes(response.status)) return response;
    throw coded(
      response.status === 429 || response.status >= 500
        ? "KEYCLOAK_PROVIDER_UNAVAILABLE"
        : `KEYCLOAK_PROVIDER_REJECTED_${response.status}`,
    );
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - this.now() > 30_000)
      return this.token.value;
    const secret = await this.config.secrets.resolve(
        this.config.credentialReference,
      ),
      secretCopy = Uint8Array.from(secret.bytes);
    const clientSecret = new TextDecoder().decode(secretCopy);
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/realms/${encodeURIComponent(this.config.adminRealm)}/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: clientSecret,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw coded(
          response.status === 429 || response.status >= 500
            ? "KEYCLOAK_PROVIDER_UNAVAILABLE"
            : "KEYCLOAK_ADMIN_AUTH_REJECTED",
        );
      const body = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
      };
      if (
        typeof body.access_token !== "string" ||
        !body.access_token ||
        !Number.isFinite(Number(body.expires_in))
      )
        throw coded("KEYCLOAK_ADMIN_TOKEN_INVALID");
      this.token = {
        value: body.access_token,
        expiresAt: this.now() + Math.max(1, Number(body.expires_in)) * 1000,
      };
      return body.access_token;
    } finally {
      secretCopy.fill(0);
    }
  }
}

function validateRealm(value: string) {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(value))
    throw coded("KEYCLOAK_REALM_INVALID");
}
function validateIdempotency(value: string) {
  if (!/^athyper:[a-z]+:[a-f0-9]{40}$/.test(value))
    throw coded("KEYCLOAK_IDEMPOTENCY_KEY_INVALID");
}
function validateUuidLike(value: unknown, code: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw coded(code);
}
function coded(code: string) {
  return Object.assign(new Error(code), { code });
}
