/**
 * MFA (Multi-Factor Authentication) Module
 *
 * Provides comprehensive MFA support including:
 * - TOTP (Time-based One-Time Password)
 * - Backup codes for recovery
 * - Trusted devices
 * - MFA policies and enforcement
 */

// Types
export * from "./types.js";

// Services
export { TotpService, createTotpService, encodeBase32, decodeBase32 } from "./totp.service.js";
export { BackupCodesService, createBackupCodesService, normalizeCode, formatCode } from "./backup-codes.service.js";
export { MfaService, createMfaService, type MfaServiceConfig } from "./mfa.service.js";

// Routes
export { createMfaRoutes, type MfaRoutesDependencies } from "./mfa.routes.js";

// Middleware
export {
  createMfaMiddleware,
  createMfaSessionMiddleware,
  setMfaVerified,
  clearMfaVerification,
  isMfaVerified,
  getMfaVerifiedAt,
  requireMfa,
  type MfaMiddlewareOptions,
  type MfaVerificationState,
} from "./mfa.middleware.js";
