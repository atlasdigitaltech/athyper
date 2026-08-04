/** Keycloak-authoritative MFA adapter. No application credential mirror exists. */
import type { Kysely } from "kysely";

type AnyDb = Kysely<Record<string, any>>;

export interface KcCredential {
  id: string;
  type: string;
  userLabel?: string;
  createdDate?: number;
  priority?: number;
}

export interface MfaMethod {
  id: string;
  method_type: "totp" | "webauthn";
  authority: "keycloak";
  is_enabled: true;
  is_verified: true;
  is_primary: boolean;
  enrolled_at: Date | null;
  verified_at: Date | null;
  last_used_at: null;
  keycloak_sync_status: "authoritative";
  updated_at: null;
  user_label: string | null;
}

export interface SyncResult {
  synced: number;
  removed: number;
  drifted: number;
}

export interface DriftReport {
  missingInKc: string[];
  missingInApp: KcCredential[];
}

export interface MfaSyncServiceDeps {
  db: AnyDb;
  kcBaseUrl: string;
  getAdminToken(realm: string): Promise<string>;
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

function mapKcType(value: string): "totp" | "webauthn" | null {
  if (value === "otp") return "totp";
  if (value === "webauthn" || value === "webauthn-passwordless") return "webauthn";
  return null;
}

export class MfaSyncService {
  private readonly baseUrl: string;

  constructor(private readonly deps: MfaSyncServiceDeps) {
    this.baseUrl = deps.kcBaseUrl.replace(/\/$/, "");
  }

  buildAiaUrl(
    realm: string,
    clientId: string,
    redirectUri: string,
    action: "webauthn-register" | "CONFIGURE_TOTP" | "UPDATE_PASSWORD",
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid",
      kc_action: action,
    });
    return `${this.baseUrl}/realms/${realm}/protocol/openid-connect/auth?${params}`;
  }

  async listCredentials(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<MfaMethod[]> {
    const subjectId = await this.resolveSubject(tenantId, principalId, realm);
    if (!subjectId) return [];
    const credentials = await this.fetchCredentials(realm, subjectId);
    return credentials.flatMap((credential, index) => {
      const methodType = mapKcType(credential.type);
      if (!methodType) return [];
      const enrolledAt = credential.createdDate ? new Date(credential.createdDate) : null;
      return [{
        id: credential.id,
        method_type: methodType,
        authority: "keycloak" as const,
        is_enabled: true as const,
        is_verified: true as const,
        is_primary: index === 0,
        enrolled_at: enrolledAt,
        verified_at: enrolledAt,
        last_used_at: null,
        keycloak_sync_status: "authoritative" as const,
        updated_at: null,
        user_label: credential.userLabel ?? null,
      }];
    });
  }

  async syncFromKC(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<SyncResult> {
    const methods = await this.listCredentials(tenantId, principalId, realm);
    this.deps.logger?.info("mfa_keycloak_read_complete", {
      tenant_id: tenantId,
      principal_id: principalId,
      count: methods.length,
    });
    return { synced: methods.length, removed: 0, drifted: 0 };
  }

  async revokeCredential(
    tenantId: string,
    principalId: string,
    credentialId: string,
    realm: string,
  ): Promise<void> {
    const subjectId = await this.resolveSubject(tenantId, principalId, realm);
    if (!subjectId) throw Object.assign(new Error("MFA subject not found"), { status: 404 });
    const credentials = await this.fetchCredentials(realm, subjectId);
    if (!credentials.some((credential) => credential.id === credentialId && mapKcType(credential.type))) {
      throw Object.assign(new Error(`MFA method '${credentialId}' not found`), { status: 404 });
    }
    const token = await this.deps.getAdminToken(realm);
    const response = await fetch(
      `${this.baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(subjectId)}/credentials/${encodeURIComponent(credentialId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.status !== 204 && response.status !== 404) {
      throw new Error(`Keycloak credential deletion failed (${response.status})`);
    }
  }

  async detectDrift(): Promise<DriftReport> {
    return { missingInKc: [], missingInApp: [] };
  }

  private async resolveSubject(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<string | null> {
    const row = await this.deps.db
      .selectFrom("master.principal_identity_binding as binding")
      .select("binding.subject_id")
      .where("binding.tenant_id", "=", tenantId)
      .where("binding.principal_id", "=", principalId)
      .where("binding.provider_code", "=", "keycloak")
      .where("binding.realm_key", "=", realm)
      .where("binding.status", "=", "active")
      .executeTakeFirst() as { subject_id: string } | undefined;
    return row?.subject_id ?? null;
  }

  private async fetchCredentials(realm: string, subjectId: string): Promise<KcCredential[]> {
    const token = await this.deps.getAdminToken(realm);
    const response = await fetch(
      `${this.baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(subjectId)}/credentials`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Keycloak credential read failed (${response.status})`);
    return await response.json() as KcCredential[];
  }
}

export function createMfaSyncService(deps: MfaSyncServiceDeps): MfaSyncService {
  return new MfaSyncService(deps);
}
