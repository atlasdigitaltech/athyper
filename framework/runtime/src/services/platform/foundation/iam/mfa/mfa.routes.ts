/**
 * MFA Routes
 *
 * REST API endpoints for Multi-Factor Authentication.
 */

import { z } from "zod";

import type { IMfaService, MfaMethod } from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";

// ============================================================================
// Validation Schemas
// ============================================================================

const EnrollmentStartBodySchema = z.object({
  method: z.enum(["totp", "webauthn", "sms", "email"]).default("totp"),
});

const EnrollmentVerifyBodySchema = z.object({
  code: z.string().min(6).max(20),
});

const VerifyChallengeBodySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(6).max(20),
  isBackupCode: z.boolean().optional(),
  rememberDevice: z.boolean().optional(),
  deviceName: z.string().max(100).optional(),
});

const DisableMfaBodySchema = z.object({
  code: z.string().min(6).max(6),
});

const CreateChallengeBodySchema = z.object({
  principalId: z.string().uuid(),
  sessionId: z.string().optional(),
});

const _TrustDeviceBodySchema = z.object({
  deviceId: z.string().min(1).max(100),
  deviceName: z.string().max(100).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface MfaRoutesDependencies {
  mfaService: IMfaService;
  logger: Logger;
  getTenantId: (req: Request) => string;
  getPrincipalId: (req: Request) => string;
}

/**
 * Create MFA routes
 */
export function createMfaRoutes(
  router: Router,
  deps: MfaRoutesDependencies
): Router {
  const { mfaService, logger, getTenantId, getPrincipalId } = deps;

  // ==========================================================================
  // Status & Policy
  // ==========================================================================

  /**
   * GET /mfa/status
   * Get MFA status for current user
   */
  router.get(
    "/mfa/status",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const status = await mfaService.getStatus(principalId, tenantId);

        return res.json(status);
      } catch (error) {
        logger.error("Failed to get MFA status", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /mfa/required
   * Check if MFA is required for current user
   */
  router.get(
    "/mfa/required",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const result = await mfaService.isRequired(principalId, tenantId);

        return res.json(result);
      } catch (error) {
        logger.error("Failed to check MFA requirement", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // Enrollment
  // ==========================================================================

  /**
   * POST /mfa/enroll
   * Start MFA enrollment
   */
  router.post(
    "/mfa/enroll",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const parseResult = EnrollmentStartBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { method } = parseResult.data;

        const result = await mfaService.startEnrollment(
          principalId,
          tenantId,
          method as MfaMethod
        );

        // Don't expose secret directly, only via setupData
        return res.json({
          status: result.status,
          mfaType: result.mfaType,
          setupData: result.setupData
            ? {
                otpauthUrl: result.setupData.otpauthUrl,
                qrCodeDataUrl: result.setupData.qrCodeDataUrl,
                issuer: result.setupData.issuer,
                accountName: result.setupData.accountName,
                // Include secret for manual entry
                secret: result.setupData.secret,
              }
            : undefined,
        });
      } catch (error) {
        logger.error("Failed to start MFA enrollment", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/enroll/verify
   * Verify MFA enrollment with first code
   */
  router.post(
    "/mfa/enroll/verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const parseResult = EnrollmentVerifyBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { code } = parseResult.data;

        const result = await mfaService.verifyEnrollment({
          principalId,
          tenantId,
          code,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        if (!result.success) {
          return res.status(400).json({
            error: "VERIFICATION_FAILED",
            message: result.error ?? "Invalid verification code",
          });
        }

        return res.json({
          success: true,
          mfaEnabled: result.mfaEnabled,
          backupCodes: result.backupCodes,
          message: "MFA enabled successfully. Save your backup codes securely.",
        });
      } catch (error) {
        logger.error("Failed to verify MFA enrollment", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /mfa/enroll
   * Cancel pending MFA enrollment
   */
  router.delete(
    "/mfa/enroll",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        await mfaService.cancelEnrollment(principalId, tenantId);

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to cancel MFA enrollment", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // Challenge & Verification (for login flow)
  // ==========================================================================

  /**
   * POST /mfa/challenge
   * Create a new MFA challenge (called during login)
   */
  router.post(
    "/mfa/challenge",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const parseResult = CreateChallengeBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { principalId, sessionId } = parseResult.data;

        const challenge = await mfaService.createChallenge({
          principalId,
          tenantId,
          sessionId,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        return res.status(201).json({
          challengeToken: challenge.challengeToken,
          expiresAt: challenge.expiresAt,
          maxAttempts: challenge.maxAttempts,
        });
      } catch (error) {
        logger.error("Failed to create MFA challenge", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/verify
   * Verify an MFA challenge
   */
  router.post(
    "/mfa/verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const parseResult = VerifyChallengeBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { challengeToken, code, isBackupCode, rememberDevice, deviceName } =
          parseResult.data;

        const deviceId = req.get("x-device-id") || req.cookies?.deviceId;

        const result = await mfaService.verifyChallenge(
          { challengeToken, code, isBackupCode, rememberDevice, deviceName },
          {
            principalId,
            tenantId,
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
            deviceId,
            rememberDevice,
          }
        );

        if (!result.success) {
          const status = result.lockedUntil ? 423 : 401;
          return res.status(status).json({
            error: result.lockedUntil ? "ACCOUNT_LOCKED" : "VERIFICATION_FAILED",
            message: result.reason,
            remainingAttempts: result.remainingAttempts,
            lockedUntil: result.lockedUntil,
          });
        }

        const response: Record<string, unknown> = { success: true };

        // Include trust token if device was trusted
        if (result.trustToken) {
          response.trustToken = result.trustToken;
          // Optionally set cookie
          res.cookie("mfa_trust", result.trustToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            sameSite: "strict",
          });
        }

        return res.json(response);
      } catch (error) {
        logger.error("Failed to verify MFA challenge", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // Management
  // ==========================================================================

  /**
   * DELETE /mfa
   * Disable MFA for current user
   */
  router.delete(
    "/mfa",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const parseResult = DisableMfaBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { code } = parseResult.data;

        const success = await mfaService.disable(principalId, tenantId, code);

        if (!success) {
          return res.status(400).json({
            error: "DISABLE_FAILED",
            message: "Invalid verification code or MFA not enabled",
          });
        }

        return res.json({
          success: true,
          message: "MFA disabled successfully",
        });
      } catch (error) {
        logger.error("Failed to disable MFA", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // Backup Codes
  // ==========================================================================

  /**
   * POST /mfa/backup-codes/regenerate
   * Regenerate backup codes
   */
  router.post(
    "/mfa/backup-codes/regenerate",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const result = await mfaService.regenerateBackupCodes(principalId, tenantId);

        return res.json({
          backupCodes: result.codes,
          count: result.count,
          message: "Backup codes regenerated. Previous codes are now invalid.",
        });
      } catch (error) {
        logger.error("Failed to regenerate backup codes", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // Trusted Devices
  // ==========================================================================

  /**
   * GET /mfa/devices
   * List trusted devices
   */
  router.get(
    "/mfa/devices",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const devices = await mfaService.getTrustedDevices(principalId, tenantId);

        return res.json({
          devices: devices.map((d) => ({
            id: d.id,
            deviceId: d.deviceId,
            deviceName: d.deviceName,
            deviceType: d.deviceType,
            lastUsedAt: d.lastUsedAt,
            lastIp: d.lastIp,
            expiresAt: d.expiresAt,
            createdAt: d.createdAt,
          })),
        });
      } catch (error) {
        logger.error("Failed to list trusted devices", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /mfa/devices/:deviceId
   * Revoke a trusted device
   */
  router.delete(
    "/mfa/devices/:deviceId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);
        const { deviceId } = req.params;

        await mfaService.revokeDevice(principalId, tenantId, deviceId);

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to revoke trusted device", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /mfa/devices
   * Revoke all trusted devices
   */
  router.delete(
    "/mfa/devices",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const count = await mfaService.revokeAllDevices(principalId, tenantId);

        return res.json({
          revokedCount: count,
          message: `Revoked ${count} trusted devices`,
        });
      } catch (error) {
        logger.error("Failed to revoke all trusted devices", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/devices/check
   * Check if current device is trusted (used during login)
   */
  router.post(
    "/mfa/devices/check",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        // Get trust token from cookie or header
        const trustToken =
          req.cookies?.mfa_trust || req.get("x-mfa-trust-token");

        if (!trustToken) {
          return res.json({ trusted: false });
        }

        const trusted = await mfaService.isTrustedDevice(
          principalId,
          tenantId,
          trustToken
        );

        return res.json({ trusted });
      } catch (error) {
        logger.error("Failed to check trusted device", { error });
        return next(error);
      }
    }
  );

  // ==========================================================================
  // WebAuthn Endpoints
  // ==========================================================================

  /**
   * POST /mfa/webauthn/register-options
   * Get registration options for a new passkey
   */
  router.post(
    "/mfa/webauthn/register-options",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const webauthnService = (req as any).webauthnService;
        if (!webauthnService) {
          return res.status(501).json({ error: "WebAuthn not configured" });
        }

        const userName = (req as any).auth?.email ?? principalId;
        const displayName = (req as any).auth?.displayName ?? userName;

        const options = await webauthnService.startRegistration(
          principalId,
          tenantId,
          userName,
          displayName,
        );

        return res.json(options);
      } catch (error) {
        logger.error("Failed to start WebAuthn registration", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/webauthn/register-verify
   * Verify registration response and store the credential
   */
  router.post(
    "/mfa/webauthn/register-verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = z.object({
          challenge: z.string().min(1),
          response: z.object({
            id: z.string(),
            rawId: z.string(),
            type: z.literal("public-key"),
            response: z.object({
              clientDataJSON: z.string(),
              attestationObject: z.string(),
            }),
          }),
        }).parse(req.body);

        const webauthnService = (req as any).webauthnService;
        if (!webauthnService) {
          return res.status(501).json({ error: "WebAuthn not configured" });
        }

        const result = await webauthnService.verifyRegistration(
          body.challenge,
          body.response,
        );

        if (!result.verified) {
          return res.status(400).json({ verified: false, error: result.error });
        }

        return res.json({ verified: true, credentialId: result.credentialId });
      } catch (error) {
        logger.error("Failed to verify WebAuthn registration", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/webauthn/auth-options
   * Get authentication options for an existing passkey
   */
  router.post(
    "/mfa/webauthn/auth-options",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = getPrincipalId(req);

        const webauthnService = (req as any).webauthnService;
        if (!webauthnService) {
          return res.status(501).json({ error: "WebAuthn not configured" });
        }

        const options = await webauthnService.startAuthentication(
          principalId,
          tenantId,
        );

        return res.json(options);
      } catch (error) {
        logger.error("Failed to start WebAuthn authentication", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /mfa/webauthn/auth-verify
   * Verify authentication response
   */
  router.post(
    "/mfa/webauthn/auth-verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = z.object({
          challenge: z.string().min(1),
          response: z.object({
            id: z.string(),
            rawId: z.string(),
            type: z.literal("public-key"),
            response: z.object({
              clientDataJSON: z.string(),
              authenticatorData: z.string(),
              signature: z.string(),
              userHandle: z.string().optional(),
            }),
          }),
        }).parse(req.body);

        const webauthnService = (req as any).webauthnService;
        if (!webauthnService) {
          return res.status(501).json({ error: "WebAuthn not configured" });
        }

        const result = await webauthnService.verifyAuthentication(
          body.challenge,
          body.response,
        );

        if (!result.verified) {
          return res.status(403).json({ verified: false, error: result.error });
        }

        return res.json({ verified: true, credentialId: result.credentialId });
      } catch (error) {
        logger.error("Failed to verify WebAuthn authentication", { error });
        return next(error);
      }
    }
  );

  return router;
}
