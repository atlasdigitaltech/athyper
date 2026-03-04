/**
 * MFA (Multi-Factor Authentication) Types
 *
 * Type definitions for TOTP, backup codes, challenges, and policies.
 */

// ============================================================================
// MFA Method Types
// ============================================================================

/**
 * Supported MFA methods
 */
export type MfaMethod = "totp" | "webauthn" | "sms" | "email";

/**
 * All MFA methods as array (for iteration)
 */
export const MFA_METHODS: MfaMethod[] = ["totp", "webauthn", "sms", "email"];

/**
 * MFA event types for audit logging
 */
export type MfaEventType =
  | "mfa_enrolled"
  | "mfa_verified"
  | "mfa_disabled"
  | "mfa_login_success"
  | "mfa_login_failure"
  | "backup_code_used"
  | "backup_codes_regenerated"
  | "recovery_initiated"
  | "recovery_completed"
  | "challenge_locked"
  | "suspicious_activity";

// ============================================================================
// MFA Configuration
// ============================================================================

/**
 * MFA configuration for a principal
 */
export interface MfaConfig {
  id: string;
  principalId: string;
  tenantId: string;
  mfaType: MfaMethod;
  totpSecret?: string;
  recoveryEmail?: string;
  isEnabled: boolean;
  isVerified: boolean;
  enabledAt?: Date;
  verifiedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MFA status for a principal (used in UI)
 */
export interface MfaStatus {
  isEnabled: boolean;
  isVerified: boolean;
  methods: MfaMethod[];
  hasBackupCodes: boolean;
  backupCodesRemaining: number;
  trustedDevicesCount: number;
  lastUsedAt?: Date;
  requiresSetup: boolean;
  gracePeriodEndsAt?: Date;
}

// ============================================================================
// TOTP Types
// ============================================================================

/**
 * TOTP setup data (for QR code generation)
 */
export interface TotpSetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  issuer: string;
  accountName: string;
}

/**
 * TOTP verification result
 */
export interface TotpVerifyResult {
  valid: boolean;
  delta?: number; // Time step difference if valid
}

/**
 * TOTP configuration options
 */
export interface TotpConfig {
  /** Issuer name shown in authenticator app */
  issuer: string;
  /** Number of digits in code (default: 6) */
  digits: number;
  /** Time step in seconds (default: 30) */
  period: number;
  /** Hash algorithm (default: SHA1) */
  algorithm: "SHA1" | "SHA256" | "SHA512";
  /** Number of valid time windows before/after (default: 1) */
  window: number;
}

// ============================================================================
// Backup Codes
// ============================================================================

/**
 * Backup code record
 */
export interface BackupCode {
  id: string;
  mfaConfigId: string;
  codeHash: string;
  isUsed: boolean;
  usedAt?: Date;
  usedIp?: string;
  usedUserAgent?: string;
  createdAt: Date;
}

/**
 * Backup codes generation result
 */
export interface BackupCodesResult {
  codes: string[]; // Plain text codes (show once, then hash)
  count: number;
  createdAt: Date;
}

// ============================================================================
// MFA Challenge
// ============================================================================

/**
 * MFA challenge (pending verification)
 */
export interface MfaChallenge {
  id: string;
  principalId: string;
  tenantId: string;
  challengeToken: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  isCompleted: boolean;
  completedAt?: Date;
  attemptCount: number;
  maxAttempts: number;
  lockedUntil?: Date;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Challenge creation input
 */
export interface CreateChallengeInput {
  principalId: string;
  tenantId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresInMinutes?: number;
  maxAttempts?: number;
}

/**
 * Challenge verification result
 */
export interface ChallengeVerifyResult {
  success: boolean;
  challengeId?: string;
  reason?: string;
  remainingAttempts?: number;
  lockedUntil?: Date;
}

// ============================================================================
// Trusted Device
// ============================================================================

/**
 * Trusted device record
 */
export interface TrustedDevice {
  id: string;
  principalId: string;
  tenantId: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: "desktop" | "mobile" | "tablet";
  trustTokenHash: string;
  lastUsedAt?: Date;
  lastIp?: string;
  expiresAt: Date;
  isRevoked: boolean;
  revokedAt?: Date;
  createdAt: Date;
}

/**
 * Trust device input
 */
export interface TrustDeviceInput {
  principalId: string;
  tenantId: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: "desktop" | "mobile" | "tablet";
  expiresInDays?: number;
}

/**
 * Trust device result
 */
export interface TrustDeviceResult {
  deviceId: string;
  trustToken: string; // Plain text token (store in cookie)
  expiresAt: Date;
}

// ============================================================================
// MFA Policy
// ============================================================================

/**
 * Policy scope type
 */
export type MfaPolicyScopeType = "tenant" | "role" | "group";

/**
 * MFA policy record
 */
export interface MfaPolicy {
  id: string;
  tenantId: string;
  scopeType: MfaPolicyScopeType;
  scopeRef?: string;
  isRequired: boolean;
  allowedMethods: MfaMethod[];
  gracePeriodDays?: number;
  allowTrustedDevices: boolean;
  trustedDeviceExpiryDays: number;
  backupCodesCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/**
 * Policy check result
 */
export interface MfaPolicyCheckResult {
  isRequired: boolean;
  allowedMethods: MfaMethod[];
  gracePeriodEndsAt?: Date;
  enforcedByPolicy?: MfaPolicy;
}

// ============================================================================
// MFA Audit
// ============================================================================

/**
 * MFA audit log entry
 */
export interface MfaAuditEntry {
  id: string;
  principalId: string;
  tenantId: string;
  eventType: MfaEventType;
  mfaType?: MfaMethod;
  ipAddress?: string;
  userAgent?: string;
  geoLocation?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Audit log input
 */
export interface MfaAuditInput {
  principalId: string;
  tenantId: string;
  eventType: MfaEventType;
  mfaType?: MfaMethod;
  ipAddress?: string;
  userAgent?: string;
  geoLocation?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Enrollment Flow
// ============================================================================

/**
 * MFA enrollment status
 */
export type EnrollmentStatus = "not_started" | "pending_verification" | "completed";

/**
 * Enrollment start result
 */
export interface EnrollmentStartResult {
  status: EnrollmentStatus;
  mfaType: MfaMethod;
  setupData?: TotpSetupData;
  backupCodes?: string[];
}

/**
 * Enrollment verification input
 */
export interface EnrollmentVerifyInput {
  principalId: string;
  tenantId: string;
  code: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Enrollment completion result
 */
export interface EnrollmentCompleteResult {
  success: boolean;
  mfaEnabled: boolean;
  backupCodes?: string[];
  error?: string;
}

// ============================================================================
// Login Verification Flow
// ============================================================================

/**
 * MFA verification context (passed during login)
 */
export interface MfaVerificationContext {
  principalId: string;
  tenantId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  rememberDevice?: boolean;
}

/**
 * MFA verification input
 */
export interface MfaVerifyInput {
  challengeToken: string;
  code: string;
  isBackupCode?: boolean;
  rememberDevice?: boolean;
  deviceName?: string;
}

/**
 * MFA verification result
 */
export interface MfaVerifyResult {
  success: boolean;
  reason?: string;
  remainingAttempts?: number;
  lockedUntil?: Date;
  trustToken?: string; // If device was trusted
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * TOTP service interface
 */
export interface ITotpService {
  /** Generate a new TOTP secret */
  generateSecret(): string;

  /** Generate setup data including QR code */
  generateSetupData(
    secret: string,
    accountName: string,
    issuer?: string
  ): Promise<TotpSetupData>;

  /** Verify a TOTP code */
  verify(secret: string, code: string): TotpVerifyResult;

  /** Generate current TOTP code (for testing) */
  generate(secret: string): string;
}

/**
 * Backup codes service interface
 */
export interface IBackupCodesService {
  /** Generate new backup codes */
  generate(count?: number): BackupCodesResult;

  /** Verify a backup code */
  verify(code: string, codeHash: string): Promise<boolean>;

  /** Hash a backup code for storage */
  hash(code: string): Promise<string>;
}

/**
 * MFA service interface
 */
export interface IMfaService {
  // Status
  getStatus(principalId: string, tenantId: string): Promise<MfaStatus>;
  isRequired(principalId: string, tenantId: string): Promise<MfaPolicyCheckResult>;

  // Enrollment
  startEnrollment(
    principalId: string,
    tenantId: string,
    method?: MfaMethod
  ): Promise<EnrollmentStartResult>;
  verifyEnrollment(input: EnrollmentVerifyInput): Promise<EnrollmentCompleteResult>;
  cancelEnrollment(principalId: string, tenantId: string): Promise<void>;

  // Verification
  createChallenge(input: CreateChallengeInput): Promise<MfaChallenge>;
  verifyChallenge(input: MfaVerifyInput, context: MfaVerificationContext): Promise<MfaVerifyResult>;

  // Management
  disable(principalId: string, tenantId: string, code: string): Promise<boolean>;
  regenerateBackupCodes(principalId: string, tenantId: string): Promise<BackupCodesResult>;

  // Trusted devices
  getTrustedDevices(principalId: string, tenantId: string): Promise<TrustedDevice[]>;
  revokeDevice(principalId: string, tenantId: string, deviceId: string): Promise<void>;
  revokeAllDevices(principalId: string, tenantId: string): Promise<number>;
  isTrustedDevice(principalId: string, tenantId: string, trustToken: string): Promise<boolean>;
}
