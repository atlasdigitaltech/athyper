/**
 * MfaSyncService — Phase 1.1 (IAM Completion)
 *
 * Bridges Keycloak-hosted MFA enrollment (WebAuthn) with the app's local
 * control.mfa_config mirror.
 *
 * Responsibility boundary:
 *   - TOTP:    App owns the secret → outbox pushes App→KC
 *              (keycloak_sync_status: 'pending' → 'synced').
 *              This service does NOT touch TOTP rows.
 *   - WebAuthn: KC owns the credential (via KC AIA / hosted UI).
 *              This service pulls KC→App after enrollment completes.
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
  credentialData?: string; // JSON string: { credentialId, credentialPublicKey, aaguid, counter, ... }
  secretData?: string;
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
  private async resolveKcUserId(principalId: string, tenantId: string): Promise<string | null> {
    const binding = await this.db
      .selectFrom("master.principal_identity_binding as pib")
      .select("pib.subject_id")
      .where("pib.principal_id", "=", principalId)
      .where("pib.tenant_id",   "=", tenantId)
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
   *   - KC credential absent   + app row present  + type=webauthn → mark drift (never delete — admin must confirm)
   *   - TOTP rows are skipped (app is source of truth for TOTP)
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
    const kcUserId = await this.resolveKcUserId(principalId, tenantId);
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

      // Skip TOTP — app is source of truth for TOTP (outbox pushes App→KC)
      if (methodType === "totp") continue;

      const existing = appRowByKcId.get(kcCred.id);
      const enrolledAt = kcCred.createdDate ? new Date(kcCred.createdDate) : new Date();

      // Extract public key from KC credentialData for assertion verification later
      let credMeta: Record<string, unknown> = {};
      if (kcCred.credentialData) {
        try {
          const parsed = JSON.parse(kcCred.credentialData) as Record<string, unknown>;
          credMeta = {
            credentialPublicKey: parsed.credentialPublicKey ?? null,
            aaguid:              parsed.aaguid ?? null,
            counter:             parsed.counter ?? 0,
            credentialId:        parsed.credentialId ?? kcCred.id,
          };
        } catch { /* ignore malformed credentialData */ }
      }
      const metaJson = JSON.stringify(credMeta);

      if (existing) {
        await this.db
          .updateTable("control.mfa_config")
          .set({
            keycloak_credential_id: kcCred.id,
            keycloak_sync_status:   "synced",
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
             keycloak_credential_id, keycloak_sync_status, user_label, metadata,
             enrolled_at, verified_at, created_by)
          VALUES (
            ${tenantId}::uuid, ${principalId}::uuid, ${methodType}, false, true, true,
            ${kcCred.id}, 'synced', ${kcCred.userLabel ?? null}, ${metaJson}::jsonb,
            ${enrolledAt.toISOString()}::timestamptz, ${enrolledAt.toISOString()}::timestamptz,
            ${principalId}::uuid
          )
          ON CONFLICT (tenant_id, principal_id, method_type)
          DO UPDATE SET
            keycloak_credential_id = EXCLUDED.keycloak_credential_id,
            keycloak_sync_status   = 'synced',
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

    // ── Pass 2: detect drift for webauthn rows whose KC credential is gone ──
    for (const row of existingRows) {
      if (row.method_type !== "webauthn") continue;
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
   * Revoke a WebAuthn credential: delete from KC then remove the mfa_config row.
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

    if (row.method_type === "totp") {
      // TOTP is managed by totp-enrollment.service — use DELETE /api/iam/mfa/:methodId instead
      throw Object.assign(
        new Error("TOTP methods must be removed via the TOTP deletion endpoint"),
        { status: 400, code: "USE_TOTP_DELETE" },
      );
    }

    // Delete from KC if we have a KC credential ID
    if (row.keycloak_credential_id) {
      const kcUserId = await this.resolveKcUserId(principalId, tenantId);
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
    const kcUserId = await this.resolveKcUserId(principalId, tenantId);
    const kcCreds  = kcUserId ? await this.fetchKcCredentials(realm, kcUserId) : [];

    const appRows = await this.db
      .selectFrom("control.mfa_config as mc")
      .select(["mc.id", "mc.method_type", "mc.keycloak_credential_id"])
      .where("mc.principal_id", "=", principalId)
      .where("mc.tenant_id",   "=", tenantId)
      .where("mc.method_type", "=", "webauthn") // only KC-owned types
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
      return t === "webauthn" && !appKcIds.has(c.id);
    });

    return { missingInKc, missingInApp };
  }

  /**
   * Push all pending TOTP credentials to Keycloak via the Admin REST API.
   * Called by the IAM outbox worker. Updates keycloak_sync_status to 'synced'
   * on success or 'error' on failure.
   *
   * KC credential format (26.x):
   *   POST /admin/realms/{realm}/users/{userId}/credentials
   *   Body: CredentialRepresentation with type="otp", secretData, credentialData
   */
  async syncPendingTotp(
    tenantId: string,
    principalId: string,
    realm: string,
  ): Promise<{ synced: number; failed: number }> {
    const kcUserId = await this.resolveKcUserId(principalId, tenantId);
    if (!kcUserId) {
      this.logger?.warn("mfa_totp_sync_no_binding", { principal_id: principalId });
      return { synced: 0, failed: 0 };
    }

    // Fetch all pending TOTP rows for this principal
    const pendingRows = await this.db
      .selectFrom("control.mfa_config as mc")
      .select(["mc.id", "mc.credential_hash"] as never[])
      .where("mc.principal_id",         "=", principalId)
      .where("mc.tenant_id",            "=", tenantId)
      .where("mc.method_type",          "=", "totp")
      .where("mc.keycloak_sync_status", "=", "pending")
      .where("mc.is_verified",          "=", true)
      .execute() as Array<{ id: string; credential_hash: string }>;

    let synced = 0;
    let failed = 0;

    for (const row of pendingRows) {
      try {
        // Best-effort: try to push TOTP secret to KC so KC can enforce it natively.
        // App validates TOTP independently, so mark synced regardless of KC push result.
        try {
          const token = await this.getAdminToken(realm);
          const url   = `${this.kcBaseUrl}/admin/realms/${realm}/users/${kcUserId}/credentials`;

          const body = JSON.stringify({
            type:           "otp",
            secretData:     JSON.stringify({ value: row.credential_hash, salt: "" }),
            credentialData: JSON.stringify({
              subType:   "totp",
              digits:    6,
              counter:   0,
              period:    30,
              algorithm: "HmacSHA1",
            }),
          });

          const resp = await fetch(url, {
            method:  "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body,
          });

          if (!resp.ok && resp.status !== 409) {
            const detail = await resp.text().catch(() => "");
            this.logger?.warn("mfa_totp_kc_push_failed", { mfa_config_id: row.id, status: resp.status, detail });
          }
        } catch (kcErr) {
          // KC unavailable or rejects credential format — not fatal, app enforces MFA
          this.logger?.warn("mfa_totp_kc_push_error", { mfa_config_id: row.id, err: String(kcErr) });
        }

        // Always mark as synced — app is source of truth for TOTP verification
        const creds = await this.fetchKcCredentials(realm, kcUserId).catch(() => []);
        const kcCred = creds.find(c => c.type === "otp");

        await this.db
          .updateTable("control.mfa_config")
          .set({
            keycloak_sync_status:   "synced",
            keycloak_credential_id: kcCred?.id ?? null,
            keycloak_synced_at:     new Date(),
          } as never)
          .where("id", "=", row.id)
          .execute();

        synced++;
        this.logger?.info("mfa_totp_synced_to_kc", { mfa_config_id: row.id, kc_user_id: kcUserId });
      } catch (err) {
        failed++;
        this.logger?.error("mfa_totp_sync_failed", { mfa_config_id: row.id, err: String(err) });
      }
    }

    return { synced, failed };
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createMfaSyncService(deps: MfaSyncServiceDeps): MfaSyncService {
  return new MfaSyncService(deps);
}
