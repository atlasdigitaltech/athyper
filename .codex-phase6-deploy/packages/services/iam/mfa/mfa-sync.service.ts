/**
 * MfaSyncService — Phase 5 (Keycloak MFA authority)
 *
 * Bridges Keycloak-hosted MFA enrollment (TOTP and WebAuthn) with the app's
 * local control.mfa_config metadata mirror.
 *
 * Responsibility boundary:
 *   - Keycloak owns every MFA credential and every verification decision.
 *   - This service only pulls safe credential metadata into the app mirror.
 *   - Credential secrets, public keys, counters and local verifiers never
 *     enter the application database.
 *
 * Keycloak AIA flow:
 *   1. POST /api/iam/mfa/webauthn/start  → returns { redirectUrl }
 *   2. Client navigates to redirectUrl (KC hosted WebAuthn registration UI)
 *   3. User completes WebAuthn reg; KC redirects to redirect_uri (our app)
 *   4. POST /api/iam/mfa/sync            → calls syncFromKC(), upserts row
 *
 * KC Admin REST endpoints used:
 *   GET    /admin/realms/{realm}/users/{kcUserId}/credentials
 *   DELETE /admin/realms/{realm}/users/{kcUserId}/credentials/{credentialId}
 *
 * KC credential type mapping:
 *   "otp"                  → method_type: "totp"    (TOTP / HOTP)
 *   "webauthn"             → method_type: "webauthn"
 *   "webauthn-passwordless"→ method_type: "webauthn"
 *
 * Admin token:
 *   Caller must provide a getAdminToken(realm) factory. Use KC service-account
 *   client credentials grant (grant_type=client_credentials) — never store
 *   the master realm admin password in app config.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

// ─── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/** Raw credential shape from KC Admin REST GET .../credentials */
export interface KcCredential {
  id: string;
  type: string;        // "otp" | "webauthn" | "webauthn-passwordless" | "password" …
  userLabel?: string;
  createdDate?: number; // epoch ms
  priority?: number;
}

export interface SyncResult {
  /** mfa_config rows upserted (created or updated) */
  synced: number;
  /** mfa_config rows removed because KC credential was deleted */
  removed: number;
  /** mfa_config rows whose KC credential has gone missing → marked 'drift' */
  drifted: number;
}

export interface DriftReport {
  /** mfa_config IDs whose keycloak_credential_id no longer exists in KC */
  missingInKc: string[];
  /** KC credentials that have no matching mfa_config row in the app */
  missingInApp: KcCredential[];
}

export interface MfaSyncServiceDeps {
  db: AnyDb;
  /**
   * Keycloak base URL (e.g. "https://auth.example.com").
   * Used for AIA redirect URL construction and Admin REST calls.
   */
  kcBaseUrl: string;
  /**
   * Return a valid KC admin access token for the given realm.
   * Typically obtained via service-account client_credentials grant.
   */
  getAdminToken(realm: string): Promise<string>;
  logger?: {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps a KC credential type string to our method_type enum value.
 * Returns null for types we don't track (e.g. "password").
 */
function mapKcType(kcType: string): "totp" | "webauthn" | null {
  if (kcType === "otp") return "totp";
  if (kcType === "webauthn" || kcType === "webauthn-passwordless") return "webauthn";
  return null;
}

// ─── Service class ─────────────────────────────────────────────────────────────

export class MfaSyncService {
  private readonly db: AnyDb;
  private readonly kcBaseUrl: string;
  private readonly getAdminToken: (realm: string) => Promise<string>;
  private readonly logger?: MfaSyncServiceDeps["logger"];

  constructor(deps: MfaSyncServiceDeps) {
    this.db            = deps.db;
    this.kcBaseUrl     = deps.kcBaseUrl.replace(/\/$/, "");
    this.getAdminToken = deps.getAdminToken;
    this.logger        = deps.logger;
  }

  // ── AIA URL builder ─────────────────────────────────────────────────────────

  /**
   * Build the Keycloak Application-Initiated Action redirect URL.
   *
   * The user must already hold an active KC browser session. KC will
   * recognise the session, run the kc_action flow, then redirect back
   * to redirectUri with an authorization code (or just a state param
   * if the client does not need a new token after the action).
   *
   * @param realm       KC realm name (e.g. "athyper")
   * @param clientId    OIDC client ID registered in KC
   * @param redirectUri Where KC sends the user after the action completes
   * @param action      "webauthn-register" | "CONFIGURE_TOTP" | "UPDATE_PASSWORD"
   */
  buildAiaUrl(
    realm: string,
    clientId: string,
    redirectUri: string,
    action: "webauthn-register" | "CONFIGURE_TOTP" | "UPDATE_PASSWORD",
  ): string {
    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:        "openid",
      kc_action:    action,
    });
    return `${this.kcBaseUrl}/realms/${realm}/protocol/openid-connect/auth?${params.toString()}`;
  }

  // ── KC Admin REST helpers ────────────────────────────────────────────────────

  /**
   * Resolve the KC user ID (subject_id) for a given principal.
   * Looks up master.principal_identity_binding where provider_code = 'keycloak'.
   */
  private async resolveKcUserId(principalId: string, tenantId: string, realm: string): Promise<string | null> {
    const binding = await this.db
      .selectFrom("master.principal_identity_binding as pib")
      .select("pib.subject_id")
      .where("pib.principal_id", "=", principalId)
      .where("pib.tenant_id",   "=", tenantId)
      .where("pib.realm_key",   "=", realm)
      .where("pib.provider_code", "=", "keycloak")
      .executeTakeFirst() as { subject_id: string } | undefined;

    return binding?.subject_id ?? null;
  }

  /**
   * Fetch all credentials for a KC user via Admin REST API.
   * Returns an empty array on 404 (user not found in KC).
   */
  private async fetchKcCredentials(
    realm: string,
    kcUserId: string,
  ): Promise<KcCredential[]> {
    const token = await this.getAdminToken(realm);
    const url   = `${this.kcBaseUrl}/admin/realms/${realm}/users/${kcUserId}/credentials`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (resp.status === 404) return [];

    if (!resp.ok) {
      const body = await resp.text().catch(() => "(no body)");
      throw new Error(`KC Admin API error: ${resp.status} ${resp.statusText} — ${body}`);
    }

    return (await resp.json()) as KcCredential[];
  }

  /**
   * Delete a single credential from KC via Admin REST.
   */
  private async deleteKcCredential(
    realm: string,
    kcUserId: string,
    credentialId: string,
  ): Promise<void> {
    const token = await this.getAdminToken(realm);
    const url   = `${this.kcBaseUrl}/admin/realms/${realm}/users/${kcUserId}/credentials/${credentialId}`;

    const resp = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.status === 204 || resp.status === 404) return; // 404 = already gone

    if (!resp.ok) {
      const body = await resp.text().catch(() => "(no body)");
      throw new Error(`KC credential DELETE failed: ${resp.status} ${resp.statusText} — ${body}`);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Pull all MFA credentials for a principal from KC and reconcile with
   * the local control.mfa_config mirror.
   *
   * Rules:
   *   - KC credential present  + app row missing  → INSERT row (synced)
   *   - KC credential present  + app row present  → UPDATE labels/status (synced)
   *   - KC credential absent   + app row present  + type in (totp,webauthn)
   *     → mark drift (never delete — audit/admin workflows may inspect it)
   *
   * @param tenantId    App tenant UUID
   * @param principalId App principal UUID
   * @param realm       KC realm name
   */
  async syncFromKC(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<SyncResult> {
    const kcUserId = await this.resolveKcUserId(principalId, tenantId, realm);
    if (!kcUserId) {
      this.logger?.warn("mfa_sync_no_binding", { principal_id: principalId, tenant_id: tenantId });
      return { synced: 0, removed: 0, drifted: 0 };
    }

    const kcCreds = await this.fetchKcCredentials(realm, kcUserId);

    // Load existing mfa_config rows for this principal (all types)
    const existingRows = await this.db
      .selectFrom("control.mfa_config as mc")
      .select([
        "mc.id",
        "mc.method_type",
        "mc.keycloak_credential_id",
        "mc.keycloak_sync_status",
        "mc.is_enabled",
        "mc.is_verified",
      ])
      .where("mc.principal_id", "=", principalId)
      .where("mc.tenant_id",   "=", tenantId)
      .execute() as Array<{
        id: string;
        method_type: string;
        keycloak_credential_id: string | null;
        keycloak_sync_status: string;
        is_enabled: boolean;
        is_verified: boolean;
      }>;

    // Index: kcCredentialId → existing app row
    const appRowByKcId = new Map(
      existingRows
        .filter(r => r.keycloak_credential_id)
        .map(r => [r.keycloak_credential_id!, r]),
    );

    // Index: kcCredentialId → KC credential (for drift detection)
    const kcCredMap = new Map(kcCreds.map(c => [c.id, c]));

    let synced = 0, removed = 0, drifted = 0;

    // ── Pass 1: upsert KC credentials into mfa_config ──────────────────────
    for (const kcCred of kcCreds) {
      const methodType = mapKcType(kcCred.type);
      if (!methodType) continue; // skip passwords and other non-MFA credentials

      const existing = appRowByKcId.get(kcCred.id);
      const enrolledAt = kcCred.createdDate ? new Date(kcCred.createdDate) : new Date();

      // Deliberately safe metadata only. Keycloak remains the sole owner of
      // the OTP secret and WebAuthn public-key material.
      const credMeta = {
        authority: "keycloak",
        credential_type: kcCred.type,
        keycloak_credential_id: kcCred.id,
      };
      const metaJson = JSON.stringify(credMeta);

      if (existing) {
        await this.db
          .updateTable("control.mfa_config")
          .set({
            keycloak_credential_id: kcCred.id,
            keycloak_sync_status:   "synced",
            keycloak_synced_at:     sql`now()`,
            authority:               "keycloak",
            user_label:             kcCred.userLabel ?? null,
            is_enabled:             true,
            is_verified:            true,
            metadata:               sql`${metaJson}::jsonb`,
            enrolled_at:            existing.is_enabled ? undefined : enrolledAt,
            verified_at:            existing.is_verified ? undefined : enrolledAt,
            updated_at:             sql`now()`,
          })
          .where("id", "=", existing.id)
          .execute();
      } else {
        await sql`
          INSERT INTO control.mfa_config
            (tenant_id, principal_id, method_type, is_primary, is_enabled, is_verified,
             authority, keycloak_credential_id, keycloak_sync_status, keycloak_synced_at, user_label, metadata,
             enrolled_at, verified_at, created_by)
          VALUES (
            ${tenantId}::uuid, ${principalId}::uuid, ${methodType}, false, true, true,
            'keycloak',
            ${kcCred.id}, 'synced', now(), ${kcCred.userLabel ?? null}, ${metaJson}::jsonb,
            ${enrolledAt.toISOString()}::timestamptz, ${enrolledAt.toISOString()}::timestamptz,
            ${principalId}::uuid
          )
          ON CONFLICT (tenant_id, principal_id, method_type)
          DO UPDATE SET
            keycloak_credential_id = EXCLUDED.keycloak_credential_id,
            keycloak_sync_status   = 'synced',
            keycloak_synced_at     = now(),
            authority              = 'keycloak',
            user_label             = EXCLUDED.user_label,
            metadata               = EXCLUDED.metadata,
            is_enabled             = true,
            is_verified            = true,
            enrolled_at            = COALESCE(control.mfa_config.enrolled_at, EXCLUDED.enrolled_at),
            verified_at            = COALESCE(control.mfa_config.verified_at, EXCLUDED.verified_at),
            updated_at             = now()
        `.execute(this.db);
      }
      synced++;
    }

    // ── Pass 2: detect drift for KC-owned rows whose credential is gone ──
    for (const row of existingRows) {
      if (row.method_type !== "totp" && row.method_type !== "webauthn") continue;
      if (!row.keycloak_credential_id) continue;
      if (kcCredMap.has(row.keycloak_credential_id)) continue;

      // KC credential no longer exists → mark drift (do not auto-delete)
      await this.db
        .updateTable("control.mfa_config")
        .set({
          keycloak_sync_status: "drift",
          updated_at:           sql`now()`,
        })
        .where("id", "=", row.id)
        .execute();

      this.logger?.warn("mfa_sync_drift_detected", {
        principal_id:          principalId,
        mfa_config_id:         row.id,
        keycloak_credential_id: row.keycloak_credential_id,
      });
      drifted++;
    }

    this.logger?.info("mfa_sync_complete", {
      principal_id: principalId,
      tenant_id:    tenantId,
      realm,
      synced, removed, drifted,
    });

    return { synced, removed, drifted };
  }

  /**
   * Revoke a Keycloak MFA credential: delete from KC then remove the mirror row.
   *
   * Ownership is verified — the mfa_config row must belong to the given
   * principal + tenant before any KC call is made.
   *
   * @param tenantId         App tenant UUID
   * @param principalId      App principal UUID
   * @param mfaConfigId      App mfa_config.id (NOT the KC credential ID)
   * @param realm            KC realm name
   */
  async revokeCredential(
    tenantId: string,
    principalId: string,
    mfaConfigId: string,
    realm: string,
  ): Promise<void> {
    // Verify ownership and get the KC credential ID
    const row = await this.db
      .selectFrom("control.mfa_config as mc")
      .select(["mc.id", "mc.method_type", "mc.keycloak_credential_id"])
      .where("mc.id",           "=", mfaConfigId)
      .where("mc.principal_id", "=", principalId)
      .where("mc.tenant_id",    "=", tenantId)
      .executeTakeFirst() as { id: string; method_type: string; keycloak_credential_id: string | null } | undefined;

    if (!row) {
      throw Object.assign(new Error(`MFA method '${mfaConfigId}' not found`), { status: 404 });
    }

    // Delete from KC if we have a KC credential ID
    if (row.keycloak_credential_id) {
      const kcUserId = await this.resolveKcUserId(principalId, tenantId, realm);
      if (kcUserId) {
        await this.deleteKcCredential(realm, kcUserId, row.keycloak_credential_id);
      }
    }

    // Remove the app mirror row
    await this.db
      .deleteFrom("control.mfa_config")
      .where("id",           "=", mfaConfigId)
      .where("principal_id", "=", principalId)
      .where("tenant_id",    "=", tenantId)
      .execute();

    this.logger?.info("mfa_credential_revoked", {
      principal_id:          principalId,
      tenant_id:             tenantId,
      mfa_config_id:         mfaConfigId,
      keycloak_credential_id: row.keycloak_credential_id,
    });
  }

  /**
   * Compare KC credentials with app mfa_config rows to identify divergence.
   *
   * Returns two lists:
   *   - missingInKc:  app rows whose KC credential ID is no longer in KC
   *   - missingInApp: KC credentials that have no app mirror row
   *
   * Use for admin drift-inspection; remediation is done via syncFromKC() or
   * revokeCredential().
   */
  async detectDrift(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<DriftReport> {
    const kcUserId = await this.resolveKcUserId(principalId, tenantId, realm);
    const kcCreds  = kcUserId ? await this.fetchKcCredentials(realm, kcUserId) : [];

    const appRows = await this.db
      .selectFrom("control.mfa_config as mc")
      .select(["mc.id", "mc.method_type", "mc.keycloak_credential_id"])
      .where("mc.principal_id", "=", principalId)
      .where("mc.tenant_id",   "=", tenantId)
      .where("mc.method_type", "in", ["totp", "webauthn"]) // only KC-owned types
      .execute() as Array<{ id: string; method_type: string; keycloak_credential_id: string | null }>;

    const kcIds    = new Set(kcCreds.map(c => c.id));
    const appKcIds = new Set(
      appRows.filter(r => r.keycloak_credential_id).map(r => r.keycloak_credential_id!),
    );

    const missingInKc = appRows
      .filter(r => r.keycloak_credential_id && !kcIds.has(r.keycloak_credential_id))
      .map(r => r.id);

    const missingInApp = kcCreds.filter(c => {
      const t = mapKcType(c.type);
      return (t === "totp" || t === "webauthn") && !appKcIds.has(c.id);
    });

    return { missingInKc, missingInApp };
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createMfaSyncService(deps: MfaSyncServiceDeps): MfaSyncService {
  return new MfaSyncService(deps);
}
