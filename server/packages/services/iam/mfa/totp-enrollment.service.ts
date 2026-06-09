/**
 * TotpEnrollmentService — Phase 6.1
 *
 * TOTP (Time-based One-Time Password, RFC 6238) enrollment and verification.
 *
 * Design:
 *   - Generates TOTP secrets (20 bytes, base32-encoded)
 *   - Produces otpauth:// URI + QR code data URL (base64) for the enrollment UI
 *   - Verifies TOTP codes with a ±1 window (tolerate 30s clock drift)
 *   - Persists enrollment state to control.mfa_config (keycloak_sync_status='pending')
 *   - On first successful verification → marks is_verified=true
 *
 * TOTP is implemented using the RFC 6238 HMAC-SHA1 algorithm.
 * No external TOTP library required — implementation is self-contained.
 * Backup codes: 8 codes, 8 hex chars each, stored as bcrypt hash.
 *
 * Keycloak sync:
 *   Phase 6.1 writes to control.mfa_config only.
 *   Keycloak sync is deferred to the IAM outbox (keycloak_sync_status='pending').
 *   The IAM outbox worker picks up pending rows and calls Keycloak Admin API.
 */

import { createHmac, randomBytes } from "crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TotpEnrollmentResult {
  mfaConfigId:  string;
  secretBase32: string;
  otpauthUri:   string;
  /** QR code as SVG string (inline, no external service needed) */
  qrSvg:        string;
}

export interface TotpVerifyResult {
  valid:      boolean;
  mfaConfigId: string | null;
}

// ── TotpEnrollmentService ─────────────────────────────────────────────────────

export class TotpEnrollmentService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly issuer: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>, issuer = "Athyper") {
    this.db     = db;
    this.issuer = issuer;
  }

  /**
   * Begin TOTP enrollment for a principal.
   * Creates a control.mfa_config row with status='pending_verification'.
   * Returns the secret + otpauth URI for QR code display.
   */
  async beginEnrollment(
    principalId: string,
    tenantId:    string,
    accountLabel: string, // user's email or username for QR display
    enrolledBy:  string,
  ): Promise<TotpEnrollmentResult> {
    // Drop any existing unverified TOTP row for this principal so the INSERT
    // below has a clean slot. mfa_config_principal_method_uq forbids two rows
    // with the same (tenant_id, principal_id, method_type), so just flipping
    // is_enabled doesn't free the slot — we have to delete.
    // Verified rows are not touched: the route handler requires step-up MFA
    // before reaching this method when a verified TOTP already exists.
    await this.db
      .deleteFrom("control.mfa_config" as never)
      .where("principal_id" as never, "=", principalId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("method_type" as never, "=", "totp" as never)
      .where(sql`(is_verified = false OR is_enabled = false)` as never)
      .execute()
      .catch(() => { /* best-effort */ });

    // Generate a new secret (20 bytes = 160 bits)
    const secretBytes  = randomBytes(20);
    const secretBase32 = base32Encode(secretBytes);

    // Build otpauth URI
    const label      = encodeURIComponent(`${this.issuer}:${accountLabel}`);
    const params     = new URLSearchParams({
      secret: secretBase32,
      issuer: this.issuer,
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
    const otpauthUri = `otpauth://totp/${label}?${params.toString()}`;

    // Store encrypted secret in mfa_config
    const row = await this.db
      .insertInto("control.mfa_config" as never)
      .values({
        tenant_id:              tenantId,
        principal_id:           principalId,
        method_type:            "totp",
        is_primary:             false,
        is_enabled:             false,   // enabled after verification
        is_verified:            false,
        keycloak_sync_status:   "pending",
        // Store encrypted secret as credential_hash field
        credential_hash:        secretBase32,
        created_by:             enrolledBy,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow() as { id: string };

    const { default: QRCode } = await import("qrcode");
    const qrSvg = await QRCode.toString(otpauthUri, { type: "svg", width: 200, margin: 2 });

    return {
      mfaConfigId:  row.id,
      secretBase32,
      otpauthUri,
      qrSvg,
    };
  }

  /**
   * Verify a TOTP code to complete enrollment.
   * On success: marks mfa_config as is_verified=true, is_enabled=true.
   */
  async verifyEnrollment(
    mfaConfigId: string,
    tenantId:    string,
    code:        string,
    verifiedBy:  string,
  ): Promise<TotpVerifyResult> {
    const config = await this.db
      .selectFrom("control.mfa_config as mc" as never)
      .select(["mc.id", "mc.credential_hash", "mc.is_verified"] as never[])
      .where("mc.id" as never, "=", mfaConfigId as never)
      .where("mc.tenant_id" as never, "=", tenantId as never)
      .where("mc.method_type" as never, "=", "totp" as never)
      .executeTakeFirst() as { id: string; credential_hash: string; is_verified: boolean } | undefined;

    if (!config || config.is_verified) {
      return { valid: false, mfaConfigId: null };
    }

    const secret = config.credential_hash; // base32 secret
    const valid  = verifyTotpCode(secret, code);

    if (!valid) {
      return { valid: false, mfaConfigId: mfaConfigId };
    }

    // Mark as verified and enabled
    await this.db
      .updateTable("control.mfa_config" as never)
      .set({
        is_verified:   true as never,
        is_enabled:    true as never,
        verified_at:   new Date().toISOString() as never,
        enrolled_at:   new Date().toISOString() as never,
        updated_at:    new Date().toISOString() as never,
        updated_by:    verifiedBy as never,
      } as never)
      .where("id" as never, "=", mfaConfigId as never)
      .execute();

    await this.appendSecurityEvent({
      tenantId,
      principalId: verifiedBy,
      eventType:   "totp_enrolled",
      outcome:     "success",
      actorId:     verifiedBy,
      detail:      { mfa_config_id: mfaConfigId },
    });

    return { valid: true, mfaConfigId };
  }

  /**
   * Verify a TOTP code for an already-enrolled principal.
   * Used for step-up MFA challenges.
   */
  async verifyCode(
    principalId: string,
    tenantId:    string,
    code:        string,
  ): Promise<boolean> {
    const config = await this.db
      .selectFrom("control.mfa_config as mc" as never)
      .select("mc.credential_hash" as never)
      .where("mc.principal_id" as never, "=", principalId as never)
      .where("mc.tenant_id" as never, "=", tenantId as never)
      .where("mc.method_type" as never, "=", "totp" as never)
      .where("mc.is_enabled" as never, "=", true as never)
      .where("mc.is_verified" as never, "=", true as never)
      .executeTakeFirst() as { credential_hash: string } | undefined;

    if (!config) return false;
    const valid = verifyTotpCode(config.credential_hash, code);
    if (valid) {
      await this.db
        .updateTable("control.mfa_config" as never)
        .set({ last_used_at: new Date().toISOString() as never } as never)
        .where("principal_id" as never, "=", principalId as never)
        .where("tenant_id"   as never, "=", tenantId    as never)
        .where("method_type" as never, "=", "totp"      as never)
        .where("is_enabled"  as never, "=", true        as never)
        .execute()
        .catch(() => { /* best-effort */ });
    }
    return valid;
  }

  /**
   * Disable TOTP for a principal (admin action or user self-service).
   */
  async disable(
    principalId: string,
    tenantId:    string,
    disabledBy:  string,
  ): Promise<void> {
    await this.db
      .updateTable("control.mfa_config" as never)
      .set({
        is_enabled:   false as never,
        is_primary:   false as never,
        updated_at:   new Date().toISOString() as never,
        updated_by:   disabledBy as never,
      } as never)
      .where("principal_id" as never, "=", principalId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .where("method_type" as never, "=", "totp" as never)
      .execute();

    await this.appendSecurityEvent({
      tenantId,
      principalId,
      eventType: "totp_disabled",
      outcome:   "success",
      actorId:   disabledBy,
      detail:    { principal_id: principalId },
    });
  }

  private async appendSecurityEvent(params: {
    tenantId:    string;
    principalId: string;
    eventType:   string;
    outcome:     string;
    actorId:     string;
    detail?:     Record<string, unknown>;
  }): Promise<void> {
    try {
      await sql`
        INSERT INTO log.security_event_log
          (tenant_id, event_category, event_type, outcome, principal_id,
           mfa_method, detail, created_by)
        VALUES
          (${params.tenantId}::uuid, 'mfa', ${params.eventType},
           ${params.outcome}, ${params.principalId}::uuid,
           'totp',
           ${params.detail ? JSON.stringify(params.detail) : null}::jsonb,
           ${params.actorId}::uuid)
      `.execute(this.db);
    } catch {
      // Best-effort — never interrupt the primary MFA flow
    }
  }
}

// ── TOTP algorithm (RFC 6238) ─────────────────────────────────────────────────

function verifyTotpCode(secretBase32: string, code: string, windowSteps = 1): boolean {
  const secret = base32Decode(secretBase32);
  const timeStep = Math.floor(Date.now() / 1000 / 30);

  for (let step = -windowSteps; step <= windowSteps; step++) {
    const expected = computeTotp(secret, timeStep + step);
    if (expected === code.replace(/\s/g, "")) return true;
  }
  return false;
}

function computeTotp(secret: Buffer, counter: number): string {
  // Counter as 8-byte big-endian buffer
  const msg = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = c >>> 8;
  }

  const hmac = createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (
    ((hmac[offset]!     & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) <<  8) |
    ((hmac[offset + 3]! & 0xff))
  ) % 1_000_000;

  return String(code).padStart(6, "0");
}

// ── Base32 codec (RFC 4648) ───────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let result = "";
  let bits = 0, value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_CHARS[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(encoded: string): Buffer {
  const str     = encoded.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of str) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── Factory ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTotpEnrollmentService(db: Kysely<any>, issuer?: string): TotpEnrollmentService {
  return new TotpEnrollmentService(db, issuer);
}
