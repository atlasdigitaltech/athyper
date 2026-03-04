/**
 * MFA Service
 *
 * Main orchestration service for Multi-Factor Authentication.
 * Handles enrollment, verification, challenges, and trusted devices.
 */

import { randomBytes } from "crypto";

import { BackupCodesService } from "./backup-codes.service.js";
import { TotpService } from "./totp.service.js";

import type {
  IMfaService,
  ITotpService,
  IBackupCodesService,
  MfaMethod,
  MfaStatus,
  MfaChallenge,
  MfaPolicy,
  MfaPolicyCheckResult,
  TrustedDevice,
  BackupCodesResult,
  EnrollmentStartResult,
  EnrollmentVerifyInput,
  EnrollmentCompleteResult,
  CreateChallengeInput,
  MfaVerifyInput,
  MfaVerifyResult,
  MfaVerificationContext,
  MfaAuditInput,
  TrustDeviceResult,
} from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { Kysely } from "kysely";

// ============================================================================
// Configuration
// ============================================================================

export interface MfaServiceConfig {
  /** Default challenge expiry in minutes */
  challengeExpiryMinutes: number;
  /** Default trusted device expiry in days */
  trustedDeviceExpiryDays: number;
  /** Max challenge attempts before lockout */
  maxChallengeAttempts: number;
  /** Lockout duration in minutes */
  lockoutDurationMinutes: number;
  /** Number of backup codes to generate */
  backupCodesCount: number;
  /** Default issuer for TOTP */
  totpIssuer: string;
}

const DEFAULT_CONFIG: MfaServiceConfig = {
  challengeExpiryMinutes: 5,
  trustedDeviceExpiryDays: 30,
  maxChallengeAttempts: 5,
  lockoutDurationMinutes: 15,
  backupCodesCount: 10,
  totpIssuer: "athyper",
};

// ============================================================================
// MFA Service Implementation
// ============================================================================

export class MfaService implements IMfaService {
  private readonly totp: ITotpService;
  private readonly backupCodes: IBackupCodesService;
  private readonly config: MfaServiceConfig;

  constructor(
    private readonly db: Kysely<any>,
    private readonly logger: Logger,
    config?: Partial<MfaServiceConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.totp = new TotpService({ issuer: this.config.totpIssuer });
    this.backupCodes = new BackupCodesService(this.config.backupCodesCount);
  }

  // ==========================================================================
  // Status & Policy
  // ==========================================================================

  /**
   * Get MFA status for a principal
   */
  async getStatus(principalId: string, tenantId: string): Promise<MfaStatus> {
    // Get MFA config
    const config = await this.db
      .selectFrom("sec.mfa_config")
      .select([
        "id",
        "mfa_type as mfaType",
        "is_enabled as isEnabled",
        "is_verified as isVerified",
        "last_used_at as lastUsedAt",
      ])
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    // Count unused backup codes
    let backupCodesRemaining = 0;
    if (config) {
      const result = await this.db
        .selectFrom("sec.mfa_backup_code")
        .select(this.db.fn.count<number>("id").as("count"))
        .where("mfa_config_id", "=", config.id)
        .where("is_used", "=", false)
        .executeTakeFirst();
      backupCodesRemaining = result?.count ?? 0;
    }

    // Count trusted devices
    const trustedResult = await this.db
      .selectFrom("sec.mfa_trusted_device")
      .select(this.db.fn.count<number>("id").as("count"))
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_revoked", "=", false)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();

    // Check policy
    const policy = await this.isRequired(principalId, tenantId);

    return {
      isEnabled: config?.isEnabled ?? false,
      isVerified: config?.isVerified ?? false,
      methods: config ? [config.mfaType as MfaMethod] : [],
      hasBackupCodes: backupCodesRemaining > 0,
      backupCodesRemaining,
      trustedDevicesCount: trustedResult?.count ?? 0,
      lastUsedAt: config?.lastUsedAt,
      requiresSetup:
        policy.isRequired && !(config?.isEnabled && config?.isVerified),
      gracePeriodEndsAt: policy.gracePeriodEndsAt,
    };
  }

  /**
   * Check if MFA is required for a principal
   */
  async isRequired(
    principalId: string,
    tenantId: string,
  ): Promise<MfaPolicyCheckResult> {
    // Check tenant-level policy
    const tenantPolicy = await this.db
      .selectFrom("sec.mfa_policy")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("scope_type", "=", "tenant")
      .where("scope_ref", "is", null)
      .executeTakeFirst();

    if (tenantPolicy?.is_required) {
      return {
        isRequired: true,
        allowedMethods: tenantPolicy.allowed_methods as MfaMethod[],
        enforcedByPolicy: this.mapPolicy(tenantPolicy),
      };
    }

    // Check role-based policies (via role bindings)
    const rolePolicy = await this.db
      .selectFrom("core.mfa_policy as mp")
      .innerJoin("core.role_binding as rb", (join) =>
        join
          .onRef("rb.persona_code", "=", "mp.scope_ref")
          .on("rb.principal_id", "=", principalId),
      )
      .selectAll("mp")
      .where("mp.tenant_id", "=", tenantId)
      .where("mp.scope_type", "=", "role")
      .where("mp.is_required", "=", true)
      .executeTakeFirst();

    if (rolePolicy) {
      return {
        isRequired: true,
        allowedMethods: rolePolicy.allowed_methods as MfaMethod[],
        enforcedByPolicy: this.mapPolicy(rolePolicy),
      };
    }

    return {
      isRequired: false,
      allowedMethods: ["totp"],
    };
  }

  // ==========================================================================
  // Enrollment
  // ==========================================================================

  /**
   * Start MFA enrollment
   */
  async startEnrollment(
    principalId: string,
    tenantId: string,
    method: MfaMethod = "totp",
  ): Promise<EnrollmentStartResult> {
    // Check if already enrolled
    const existing = await this.db
      .selectFrom("sec.mfa_config")
      .select(["id", "is_enabled as isEnabled", "is_verified as isVerified"])
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("mfa_type", "=", method)
      .executeTakeFirst();

    if (existing?.isEnabled && existing?.isVerified) {
      return {
        status: "completed",
        mfaType: method,
      };
    }

    // Generate new TOTP secret
    const secret = this.totp.generateSecret();

    // Get account name (email or principal ID)
    const profile = await this.db
      .selectFrom("core.principal_profile")
      .select("email")
      .where("principal_id", "=", principalId)
      .executeTakeFirst();

    const accountName = profile?.email ?? principalId;

    // Generate setup data
    const setupData = await this.totp.generateSetupData(
      secret,
      accountName,
      this.config.totpIssuer,
    );

    // Upsert MFA config
    if (existing) {
      await this.db
        .updateTable("sec.mfa_config")
        .set({
          totp_secret: secret,
          is_verified: false,
          updated_at: new Date(),
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      await this.db
        .insertInto("sec.mfa_config")
        .values({
          principal_id: principalId,
          tenant_id: tenantId,
          mfa_type: method,
          totp_secret: secret,
          is_enabled: false,
          is_verified: false,
        })
        .execute();
    }

    this.logger.info("MFA enrollment started", { principalId, method });

    return {
      status: "pending_verification",
      mfaType: method,
      setupData,
    };
  }

  /**
   * Verify MFA enrollment with first code
   */
  async verifyEnrollment(
    input: EnrollmentVerifyInput,
  ): Promise<EnrollmentCompleteResult> {
    const { principalId, tenantId, code, ipAddress, userAgent } = input;

    // Get pending config
    const config = await this.db
      .selectFrom("sec.mfa_config")
      .selectAll()
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_verified", "=", false)
      .executeTakeFirst();

    if (!config || !config.totp_secret) {
      return {
        success: false,
        mfaEnabled: false,
        error: "No pending enrollment found",
      };
    }

    // Verify TOTP code
    const result = this.totp.verify(config.totp_secret, code);

    if (!result.valid) {
      await this.logAudit({
        principalId,
        tenantId,
        eventType: "mfa_login_failure",
        mfaType: config.mfa_type as MfaMethod,
        ipAddress,
        userAgent,
        details: { reason: "invalid_enrollment_code" },
      });

      return {
        success: false,
        mfaEnabled: false,
        error: "Invalid verification code",
      };
    }

    // Generate backup codes
    const backupCodesResult = this.backupCodes.generate(
      this.config.backupCodesCount,
    );

    // Hash and store backup codes
    await this.storeBackupCodes(config.id, backupCodesResult.codes);

    // Enable MFA
    const now = new Date();
    await this.db
      .updateTable("sec.mfa_config")
      .set({
        is_enabled: true,
        is_verified: true,
        enabled_at: now,
        verified_at: now,
        updated_at: now,
      })
      .where("id", "=", config.id)
      .execute();

    // Log audit
    await this.logAudit({
      principalId,
      tenantId,
      eventType: "mfa_enrolled",
      mfaType: config.mfa_type as MfaMethod,
      ipAddress,
      userAgent,
    });

    this.logger.info("MFA enrollment completed", { principalId });

    return {
      success: true,
      mfaEnabled: true,
      backupCodes: backupCodesResult.codes,
    };
  }

  /**
   * Cancel pending enrollment
   */
  async cancelEnrollment(principalId: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom("sec.mfa_config")
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_verified", "=", false)
      .execute();

    this.logger.info("MFA enrollment cancelled", { principalId });
  }

  // ==========================================================================
  // Challenge & Verification
  // ==========================================================================

  /**
   * Create an MFA challenge for login verification
   */
  async createChallenge(input: CreateChallengeInput): Promise<MfaChallenge> {
    const {
      principalId,
      tenantId,
      sessionId,
      ipAddress,
      userAgent,
      expiresInMinutes = this.config.challengeExpiryMinutes,
      maxAttempts = this.config.maxChallengeAttempts,
    } = input;

    // Generate challenge token
    const challengeToken = randomBytes(32).toString("hex");

    // Calculate expiry
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Insert challenge
    const result = await this.db
      .insertInto("sec.mfa_challenge")
      .values({
        principal_id: principalId,
        tenant_id: tenantId,
        challenge_token: challengeToken,
        session_id: sessionId,
        ip_address: ipAddress,
        user_agent: userAgent,
        max_attempts: maxAttempts,
        expires_at: expiresAt,
      })
      .returning([
        "id",
        "principal_id as principalId",
        "tenant_id as tenantId",
        "challenge_token as challengeToken",
        "session_id as sessionId",
        "ip_address as ipAddress",
        "user_agent as userAgent",
        "is_completed as isCompleted",
        "attempt_count as attemptCount",
        "max_attempts as maxAttempts",
        "expires_at as expiresAt",
        "created_at as createdAt",
      ])
      .executeTakeFirstOrThrow();

    return result as MfaChallenge;
  }

  /**
   * Verify an MFA challenge
   */
  async verifyChallenge(
    input: MfaVerifyInput,
    context: MfaVerificationContext,
  ): Promise<MfaVerifyResult> {
    const { challengeToken, code, isBackupCode, rememberDevice, deviceName } =
      input;
    const { principalId, tenantId, ipAddress, userAgent, deviceId } = context;

    // Get challenge
    const challenge = await this.db
      .selectFrom("sec.mfa_challenge")
      .selectAll()
      .where("challenge_token", "=", challengeToken)
      .where("principal_id", "=", principalId)
      .where("is_completed", "=", false)
      .executeTakeFirst();

    if (!challenge) {
      return { success: false, reason: "Challenge not found or expired" };
    }

    // Check expiry
    if (new Date() > challenge.expires_at) {
      return { success: false, reason: "Challenge expired" };
    }

    // Check lockout
    if (challenge.locked_until && new Date() < challenge.locked_until) {
      return {
        success: false,
        reason: "Account temporarily locked",
        lockedUntil: challenge.locked_until,
      };
    }

    // Get MFA config
    const config = await this.db
      .selectFrom("sec.mfa_config")
      .selectAll()
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_enabled", "=", true)
      .executeTakeFirst();

    if (!config) {
      return { success: false, reason: "MFA not configured" };
    }

    let verified = false;

    // Try backup code first if specified or if format matches
    if (
      isBackupCode ||
      (this.backupCodes as BackupCodesService).isBackupCodeFormat(code)
    ) {
      verified = await this.verifyBackupCode(
        config.id,
        code,
        principalId,
        tenantId,
        ipAddress,
        userAgent,
      );
    } else {
      // Verify TOTP
      const totpResult = this.totp.verify(config.totp_secret!, code);
      verified = totpResult.valid;
    }

    // Update attempt count
    const newAttemptCount = challenge.attempt_count + 1;
    const remainingAttempts = challenge.max_attempts - newAttemptCount;

    if (!verified) {
      // Check if should lock
      let lockedUntil: Date | undefined;
      if (remainingAttempts <= 0) {
        lockedUntil = new Date(
          Date.now() + this.config.lockoutDurationMinutes * 60 * 1000,
        );

        await this.logAudit({
          principalId,
          tenantId,
          eventType: "challenge_locked",
          ipAddress,
          userAgent,
          details: { challengeId: challenge.id },
        });
      }

      await this.db
        .updateTable("sec.mfa_challenge")
        .set({
          attempt_count: newAttemptCount,
          locked_until: lockedUntil,
        })
        .where("id", "=", challenge.id)
        .execute();

      await this.logAudit({
        principalId,
        tenantId,
        eventType: "mfa_login_failure",
        mfaType: config.mfa_type as MfaMethod,
        ipAddress,
        userAgent,
        details: { attemptCount: newAttemptCount },
      });

      return {
        success: false,
        reason: "Invalid code",
        remainingAttempts: Math.max(0, remainingAttempts),
        lockedUntil,
      };
    }

    // Success - mark challenge complete
    await this.db
      .updateTable("sec.mfa_challenge")
      .set({
        is_completed: true,
        completed_at: new Date(),
      })
      .where("id", "=", challenge.id)
      .execute();

    // Update last used
    await this.db
      .updateTable("sec.mfa_config")
      .set({ last_used_at: new Date() })
      .where("id", "=", config.id)
      .execute();

    await this.logAudit({
      principalId,
      tenantId,
      eventType: "mfa_login_success",
      mfaType: config.mfa_type as MfaMethod,
      ipAddress,
      userAgent,
    });

    // Trust device if requested
    let trustToken: string | undefined;
    if (rememberDevice && deviceId) {
      const trustResult = await this.trustDevice(
        principalId,
        tenantId,
        deviceId,
        deviceName,
      );
      trustToken = trustResult.trustToken;
    }

    return { success: true, trustToken };
  }

  // ==========================================================================
  // Management
  // ==========================================================================

  /**
   * Disable MFA for a principal
   */
  async disable(
    principalId: string,
    tenantId: string,
    code: string,
  ): Promise<boolean> {
    // Get config
    const config = await this.db
      .selectFrom("sec.mfa_config")
      .selectAll()
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_enabled", "=", true)
      .executeTakeFirst();

    if (!config) {
      return false;
    }

    // Verify code before disabling
    const result = this.totp.verify(config.totp_secret!, code);
    if (!result.valid) {
      return false;
    }

    // Delete backup codes
    await this.db
      .deleteFrom("sec.mfa_backup_code")
      .where("mfa_config_id", "=", config.id)
      .execute();

    // Delete config
    await this.db
      .deleteFrom("sec.mfa_config")
      .where("id", "=", config.id)
      .execute();

    // Revoke all trusted devices
    await this.revokeAllDevices(principalId, tenantId);

    await this.logAudit({
      principalId,
      tenantId,
      eventType: "mfa_disabled",
      mfaType: config.mfa_type as MfaMethod,
    });

    this.logger.info("MFA disabled", { principalId });

    return true;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(
    principalId: string,
    tenantId: string,
  ): Promise<BackupCodesResult> {
    // Get config
    const config = await this.db
      .selectFrom("sec.mfa_config")
      .select("id")
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_enabled", "=", true)
      .executeTakeFirstOrThrow();

    // Delete existing backup codes
    await this.db
      .deleteFrom("sec.mfa_backup_code")
      .where("mfa_config_id", "=", config.id)
      .execute();

    // Generate new codes
    const result = this.backupCodes.generate(this.config.backupCodesCount);

    // Store hashed codes
    await this.storeBackupCodes(config.id, result.codes);

    await this.logAudit({
      principalId,
      tenantId,
      eventType: "backup_codes_regenerated",
    });

    this.logger.info("Backup codes regenerated", { principalId });

    return result;
  }

  // ==========================================================================
  // Trusted Devices
  // ==========================================================================

  /**
   * Get trusted devices for a principal
   */
  async getTrustedDevices(
    principalId: string,
    tenantId: string,
  ): Promise<TrustedDevice[]> {
    const devices = await this.db
      .selectFrom("sec.mfa_trusted_device")
      .selectAll()
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_revoked", "=", false)
      .where("expires_at", ">", new Date())
      .orderBy("last_used_at", "desc")
      .execute();

    return devices.map((d) => ({
      id: d.id,
      principalId: d.principal_id,
      tenantId: d.tenant_id,
      deviceId: d.device_id,
      deviceName: d.device_name,
      deviceType: d.device_type,
      trustTokenHash: d.trust_token_hash,
      lastUsedAt: d.last_used_at,
      lastIp: d.last_ip,
      expiresAt: d.expires_at,
      isRevoked: d.is_revoked,
      revokedAt: d.revoked_at,
      createdAt: d.created_at,
    }));
  }

  /**
   * Trust a device
   */
  private async trustDevice(
    principalId: string,
    tenantId: string,
    deviceId: string,
    deviceName?: string,
  ): Promise<TrustDeviceResult> {
    const trustToken = randomBytes(32).toString("hex");
    const trustTokenHash = await this.hashToken(trustToken);
    const expiresAt = new Date(
      Date.now() + this.config.trustedDeviceExpiryDays * 24 * 60 * 60 * 1000,
    );

    await this.db
      .insertInto("sec.mfa_trusted_device")
      .values({
        principal_id: principalId,
        tenant_id: tenantId,
        device_id: deviceId,
        device_name: deviceName,
        trust_token_hash: trustTokenHash,
        expires_at: expiresAt,
      })
      .onConflict((oc) =>
        oc.columns(["principal_id", "device_id"]).doUpdateSet({
          trust_token_hash: trustTokenHash,
          expires_at: expiresAt,
          is_revoked: false,
          revoked_at: null,
          last_used_at: new Date(),
        }),
      )
      .execute();

    return { deviceId, trustToken, expiresAt };
  }

  /**
   * Check if device is trusted
   */
  async isTrustedDevice(
    principalId: string,
    tenantId: string,
    trustToken: string,
  ): Promise<boolean> {
    const tokenHash = await this.hashToken(trustToken);

    const device = await this.db
      .selectFrom("sec.mfa_trusted_device")
      .select("id")
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("trust_token_hash", "=", tokenHash)
      .where("is_revoked", "=", false)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();

    if (device) {
      // Update last used
      await this.db
        .updateTable("sec.mfa_trusted_device")
        .set({ last_used_at: new Date() })
        .where("id", "=", device.id)
        .execute();
      return true;
    }

    return false;
  }

  /**
   * Revoke a trusted device
   */
  async revokeDevice(
    principalId: string,
    tenantId: string,
    deviceId: string,
  ): Promise<void> {
    await this.db
      .updateTable("sec.mfa_trusted_device")
      .set({
        is_revoked: true,
        revoked_at: new Date(),
      })
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("device_id", "=", deviceId)
      .execute();
  }

  /**
   * Revoke all trusted devices
   */
  async revokeAllDevices(
    principalId: string,
    tenantId: string,
  ): Promise<number> {
    const result = await this.db
      .updateTable("sec.mfa_trusted_device")
      .set({
        is_revoked: true,
        revoked_at: new Date(),
      })
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .where("is_revoked", "=", false)
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Store hashed backup codes
   */
  private async storeBackupCodes(
    configId: string,
    codes: string[],
  ): Promise<void> {
    for (const code of codes) {
      const hash = await this.backupCodes.hash(code);
      await this.db
        .insertInto("sec.mfa_backup_code")
        .values({
          mfa_config_id: configId,
          code_hash: hash,
        })
        .execute();
    }
  }

  /**
   * Verify and consume a backup code
   */
  private async verifyBackupCode(
    configId: string,
    code: string,
    principalId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<boolean> {
    // Get unused backup codes
    const codes = await this.db
      .selectFrom("sec.mfa_backup_code")
      .select(["id", "code_hash as codeHash"])
      .where("mfa_config_id", "=", configId)
      .where("is_used", "=", false)
      .execute();

    for (const storedCode of codes) {
      const match = await this.backupCodes.verify(code, storedCode.codeHash);
      if (match) {
        // Mark as used
        await this.db
          .updateTable("sec.mfa_backup_code")
          .set({
            is_used: true,
            used_at: new Date(),
            used_ip: ipAddress,
            used_user_agent: userAgent,
          })
          .where("id", "=", storedCode.id)
          .execute();

        await this.logAudit({
          principalId,
          tenantId,
          eventType: "backup_code_used",
          ipAddress,
          userAgent,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Hash a token for storage
   */
  private async hashToken(token: string): Promise<string> {
    const { createHash } = await import("crypto");
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Log audit event
   */
  private async logAudit(input: MfaAuditInput): Promise<void> {
    await this.db
      .insertInto("sec.mfa_audit_log")
      .values({
        principal_id: input.principalId,
        tenant_id: input.tenantId,
        event_type: input.eventType,
        mfa_type: input.mfaType,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        geo_location: input.geoLocation,
        details: input.details ? JSON.stringify(input.details) : null,
      })
      .execute();
  }

  /**
   * Map database policy to typed policy
   */
  private mapPolicy(row: any): MfaPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      scopeType: row.scope_type,
      scopeRef: row.scope_ref,
      isRequired: row.is_required,
      allowedMethods: row.allowed_methods,
      gracePeriodDays: row.grace_period_days,
      allowTrustedDevices: row.allow_trusted_devices,
      trustedDeviceExpiryDays: row.trusted_device_expiry_days,
      backupCodesCount: row.backup_codes_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create MFA service instance
 */
export function createMfaService(
  db: Kysely<any>,
  logger: Logger,
  config?: Partial<MfaServiceConfig>,
): MfaService {
  return new MfaService(db, logger, config);
}
