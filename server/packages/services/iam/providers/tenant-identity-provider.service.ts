import { sql, type Kysely } from "kysely";

import {
  isWindowsKerberosEnabled,
  validateTenantIdentityProvider,
  type NormalizedTenantIdentityProvider,
  type TenantIdentityProviderInput,
  type TenantIdpFeatureGate,
  type TenantIdpFirstLoginPolicy,
  type TenantIdpLoginMode,
  type TenantIdpMfaTrustPolicy,
  type TenantIdpPlane,
  type TenantIdpProtocol,
  type TenantIdpProviderType,
} from "./tenant-identity-provider.js";

type AnyDb = Kysely<Record<string, any>>;

export interface TenantIdentityProviderRecord {
  id: string;
  tenantId: string;
  alias: string;
  realmKey: string;
  protocol: TenantIdpProtocol;
  providerType: TenantIdpProviderType;
  displayName: string;
  loginMode: TenantIdpLoginMode;
  firstLoginPolicy: TenantIdpFirstLoginPolicy;
  mfaTrustPolicy: TenantIdpMfaTrustPolicy;
  allowedPlanes: TenantIdpPlane[];
  configurationRef: string;
  featureGate: TenantIdpFeatureGate;
  enabled: boolean;
  configurationVersion: number;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export class TenantIdentityProviderValidationError extends Error {
  readonly code = "INVALID_TENANT_IDENTITY_PROVIDER";
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "TenantIdentityProviderValidationError";
    this.errors = errors;
  }
}

export interface TenantIdentityProviderServiceOptions {
  windowsKerberosEnabled?: boolean;
  logger?: {
    info?(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createTenantIdentityProviderService(
  db: AnyDb,
  options: TenantIdentityProviderServiceOptions = {},
) {
  const windowsKerberosEnabled = options.windowsKerberosEnabled ?? isWindowsKerberosEnabled();

  return {
    async list(tenantId: string, plane?: TenantIdpPlane): Promise<TenantIdentityProviderRecord[]> {
      const result = await sql<ProviderRow>`
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          keycloak_alias,
          realm_key,
          protocol,
          provider_type,
          display_name,
          login_mode,
          first_login_policy,
          mfa_trust_policy,
          allowed_planes,
          configuration_ref,
          feature_gate,
          enabled,
          configuration_version,
          activated_at::text AS activated_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM master.tenant_identity_provider
        WHERE tenant_id = ${tenantId}::uuid
          AND (${plane ?? null}::text IS NULL OR ${plane ?? null} = ANY(allowed_planes))
        ORDER BY display_name, keycloak_alias
      `.execute(db);
      return result.rows.map(toRecord);
    },

    async create(
      tenantId: string,
      input: TenantIdentityProviderInput,
      actorId: string,
      realmKey = "athyper",
    ): Promise<TenantIdentityProviderRecord> {
      const normalized = validateOrThrow(input, windowsKerberosEnabled);
      const result = await sql<ProviderRow>`
        INSERT INTO master.tenant_identity_provider (
          tenant_id, keycloak_alias, realm_key, protocol, provider_type,
          display_name, configuration_ref, feature_gate, login_mode,
          first_login_policy, mfa_trust_policy, allowed_planes, enabled,
          configuration_version, activated_at, created_by
        ) VALUES (
          ${tenantId}::uuid, ${normalized.alias}, ${realmKey}, ${normalized.protocol},
          ${normalized.providerType}, ${normalized.displayName}, ${normalized.configurationRef},
          ${normalized.featureGate}, ${normalized.loginMode}, ${normalized.firstLoginPolicy},
          ${normalized.mfaTrustPolicy}, ${sql.raw(`ARRAY[${normalized.allowedPlanes.map((plane) => `'${plane}'`).join(",")}]::text[]`)},
          false, 1, NULL, ${actorId}::uuid
        )
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          keycloak_alias,
          realm_key,
          protocol,
          provider_type,
          display_name,
          login_mode,
          first_login_policy,
          mfa_trust_policy,
          allowed_planes,
          configuration_ref,
          feature_gate,
          enabled,
          configuration_version,
          activated_at::text AS activated_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `.execute(db);
      const row = result.rows[0];
      if (!row) throw new Error("Identity provider was not created.");
      options.logger?.info?.("tenant_identity_provider_created", {
        tenantId,
        providerType: normalized.providerType,
        alias: normalized.alias,
      });
      return toRecord(row);
    },

    async activate(tenantId: string, providerId: string, actorId: string): Promise<TenantIdentityProviderRecord | null> {
      const result = await sql<ProviderRow>`
        UPDATE master.tenant_identity_provider
        SET enabled = true,
            activated_at = COALESCE(activated_at, now()),
            configuration_version = configuration_version + 1,
            updated_at = now(),
            updated_by = ${actorId}::uuid
        WHERE id = ${providerId}::uuid
          AND tenant_id = ${tenantId}::uuid
          AND (
            provider_type <> 'windows-kerberos'
            OR ${windowsKerberosEnabled}
          )
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          keycloak_alias,
          realm_key,
          protocol,
          provider_type,
          display_name,
          login_mode,
          first_login_policy,
          mfa_trust_policy,
          allowed_planes,
          configuration_ref,
          feature_gate,
          enabled,
          configuration_version,
          activated_at::text AS activated_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `.execute(db);
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },

    async disable(tenantId: string, providerId: string, actorId: string): Promise<boolean> {
      const result = await sql<{ id: string }>`
        UPDATE master.tenant_identity_provider
        SET enabled = false, updated_at = now(), updated_by = ${actorId}::uuid
        WHERE id = ${providerId}::uuid AND tenant_id = ${tenantId}::uuid
        RETURNING id::text AS id
      `.execute(db);
      return result.rows.length > 0;
    },

    async setMfaTrustPolicy(
      tenantId: string,
      providerId: string,
      policy: TenantIdpMfaTrustPolicy,
      actorId: string,
    ): Promise<TenantIdentityProviderRecord | null> {
      if (!(["never", "conditional", "trusted-assurance"] as const).includes(policy)) {
        throw new TenantIdentityProviderValidationError(["mfaTrustPolicy is not supported."]);
      }
      const result = await sql<ProviderRow>`
        UPDATE master.tenant_identity_provider
        SET mfa_trust_policy = ${policy},
            configuration_version = configuration_version + 1,
            updated_at = now(),
            updated_by = ${actorId}::uuid
        WHERE id = ${providerId}::uuid
          AND tenant_id = ${tenantId}::uuid
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          keycloak_alias,
          realm_key,
          protocol,
          provider_type,
          display_name,
          login_mode,
          first_login_policy,
          mfa_trust_policy,
          allowed_planes,
          configuration_ref,
          feature_gate,
          enabled,
          configuration_version,
          activated_at::text AS activated_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `.execute(db);
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    },
  };
}

interface ProviderRow {
  id: string;
  tenant_id: string;
  keycloak_alias: string;
  realm_key: string;
  protocol: TenantIdpProtocol;
  provider_type: TenantIdpProviderType;
  display_name: string;
  login_mode: TenantIdpLoginMode;
  first_login_policy: TenantIdpFirstLoginPolicy;
  mfa_trust_policy: TenantIdpMfaTrustPolicy;
  allowed_planes: string[];
  configuration_ref: string;
  feature_gate: TenantIdpFeatureGate;
  enabled: boolean;
  configuration_version: number;
  activated_at: string | null;
  created_at: string;
  updated_at: string | null;
}

function validateOrThrow(
  input: TenantIdentityProviderInput,
  windowsKerberosEnabled: boolean,
): NormalizedTenantIdentityProvider {
  const result = validateTenantIdentityProvider(input, { windowsKerberosEnabled });
  if (!result.ok) throw new TenantIdentityProviderValidationError(result.errors);
  return result.value;
}

function toRecord(row: ProviderRow): TenantIdentityProviderRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    alias: row.keycloak_alias,
    realmKey: row.realm_key,
    protocol: row.protocol,
    providerType: row.provider_type,
    displayName: row.display_name,
    loginMode: row.login_mode,
    firstLoginPolicy: row.first_login_policy,
    mfaTrustPolicy: row.mfa_trust_policy,
    allowedPlanes: row.allowed_planes.filter((plane): plane is TenantIdpPlane => ["neon", "mesh", "admin"].includes(plane)),
    configurationRef: row.configuration_ref,
    featureGate: row.feature_gate,
    enabled: row.enabled,
    configurationVersion: Number(row.configuration_version),
    activatedAt: row.activated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
