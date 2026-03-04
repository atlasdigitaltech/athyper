/**
 * MFA Middleware
 *
 * Express middleware for enforcing MFA verification on protected routes.
 */

import type { IMfaService } from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response } from "express";

// ============================================================================
// Types
// ============================================================================

export interface MfaMiddlewareOptions {
  /** MFA service instance */
  mfaService: IMfaService;
  /** Logger instance */
  logger: Logger;
  /** Get tenant ID from request */
  getTenantId: (req: Request) => string;
  /** Get principal ID from request */
  getPrincipalId: (req: Request) => string;
  /** Skip MFA check for certain paths */
  skipPaths?: string[];
  /** Skip MFA check for certain methods */
  skipMethods?: string[];
  /** Allow trusted devices to skip MFA */
  allowTrustedDevices?: boolean;
  /** Grace period in days (allow access without MFA during setup) */
  gracePeriodDays?: number;
  /** Custom handler for MFA required response */
  onMfaRequired?: (
    req: Request,
    res: Response,
    context: {
      principalId: string;
      tenantId: string;
      reason: string;
    }
  ) => void;
  /** Custom handler for MFA not verified response */
  onMfaNotVerified?: (
    req: Request,
    res: Response,
    context: {
      principalId: string;
      tenantId: string;
      challengeRequired: boolean;
    }
  ) => void;
}

export interface MfaVerificationState {
  /** MFA verification completed */
  verified: boolean;
  /** MFA verification timestamp */
  verifiedAt?: Date;
  /** Trust token if device is trusted */
  trustToken?: string;
  /** Challenge token if verification in progress */
  challengeToken?: string;
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create MFA enforcement middleware
 *
 * This middleware checks if MFA is required and verified for the current user.
 * It should be applied after authentication middleware.
 *
 * Usage:
 * ```ts
 * app.use('/api/protected', createMfaMiddleware({
 *   mfaService,
 *   logger,
 *   getTenantId: (req) => req.tenantId,
 *   getPrincipalId: (req) => req.user.id,
 * }));
 * ```
 */
export function createMfaMiddleware(
  options: MfaMiddlewareOptions
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const {
    mfaService,
    logger,
    getTenantId,
    getPrincipalId,
    skipPaths = [],
    skipMethods = ["OPTIONS"],
    allowTrustedDevices = true,
    gracePeriodDays: _gracePeriodDays = 7,
    onMfaRequired,
    onMfaNotVerified,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip for certain methods (e.g., OPTIONS for CORS)
      if (skipMethods.includes(req.method)) {
        return next();
      }

      // Skip for certain paths
      if (skipPaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      const tenantId = getTenantId(req);
      const principalId = getPrincipalId(req);

      // Check if user has a valid MFA verification in session
      const mfaState = (req as any).mfaState as MfaVerificationState | undefined;
      if (mfaState?.verified) {
        return next();
      }

      // Check if device is trusted
      if (allowTrustedDevices) {
        const trustToken =
          req.cookies?.mfa_trust || req.get("x-mfa-trust-token");

        if (trustToken) {
          const isTrusted = await mfaService.isTrustedDevice(
            principalId,
            tenantId,
            trustToken
          );

          if (isTrusted) {
            // Device is trusted, allow access
            (req as any).mfaState = { verified: true, trustToken };
            return next();
          }
        }
      }

      // Check MFA status
      const status = await mfaService.getStatus(principalId, tenantId);

      // If MFA not enabled, check if required
      if (!status.isEnabled) {
        const policy = await mfaService.isRequired(principalId, tenantId);

        if (policy.isRequired) {
          // Check grace period
          if (policy.gracePeriodEndsAt && new Date() < policy.gracePeriodEndsAt) {
            // Still in grace period, allow access but warn
            logger.warn("MFA required but in grace period", {
              principalId,
              gracePeriodEndsAt: policy.gracePeriodEndsAt,
            });
            return next();
          }

          // MFA required but not set up
          if (onMfaRequired) {
            onMfaRequired(req, res, {
              principalId,
              tenantId,
              reason: "MFA is required for your account",
            });
            return;
          }

          res.status(403).json({
            error: "MFA_REQUIRED",
            message: "MFA is required for your account. Please set up MFA to continue.",
            setupRequired: true,
          });
          return;
        }

        // MFA not required and not enabled, allow access
        return next();
      }

      // MFA is enabled but not verified in this session
      if (onMfaNotVerified) {
        onMfaNotVerified(req, res, {
          principalId,
          tenantId,
          challengeRequired: true,
        });
        return;
      }

      res.status(403).json({
        error: "MFA_VERIFICATION_REQUIRED",
        message: "MFA verification required. Please complete MFA to continue.",
        challengeRequired: true,
      });
    } catch (error) {
      logger.error("MFA middleware error", { error });
      next(error);
    }
  };
}

/**
 * Create middleware to set MFA verification state from session
 *
 * This should be used with session middleware to restore MFA state.
 */
export function createMfaSessionMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = (req as any).session;

    if (session?.mfaVerified) {
      (req as any).mfaState = {
        verified: true,
        verifiedAt: session.mfaVerifiedAt,
      };
    }

    next();
  };
}

/**
 * Mark MFA as verified in session
 */
export function setMfaVerified(req: Request): void {
  const session = (req as any).session;

  if (session) {
    session.mfaVerified = true;
    session.mfaVerifiedAt = new Date();
  }

  (req as any).mfaState = {
    verified: true,
    verifiedAt: new Date(),
  };
}

/**
 * Clear MFA verification from session
 */
export function clearMfaVerification(req: Request): void {
  const session = (req as any).session;

  if (session) {
    delete session.mfaVerified;
    delete session.mfaVerifiedAt;
  }

  delete (req as any).mfaState;
}

// ============================================================================
// Decorators / Helpers
// ============================================================================

/**
 * Check if request has verified MFA
 */
export function isMfaVerified(req: Request): boolean {
  return (req as any).mfaState?.verified === true;
}

/**
 * Get MFA verification timestamp
 */
export function getMfaVerifiedAt(req: Request): Date | undefined {
  return (req as any).mfaState?.verifiedAt;
}

/**
 * Create route-specific MFA requirement
 *
 * Usage:
 * ```ts
 * router.post('/sensitive-action',
 *   requireMfa(mfaService, logger),
 *   sensitiveActionHandler
 * );
 * ```
 */
export function requireMfa(
  mfaService: IMfaService,
  logger: Logger
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (isMfaVerified(req)) {
      return next();
    }

    // Check trusted device
    const trustToken = req.cookies?.mfa_trust || req.get("x-mfa-trust-token");

    if (trustToken) {
      const tenantId = (req as any).tenantId;
      const principalId = (req as any).user?.id;

      if (tenantId && principalId) {
        try {
          const isTrusted = await mfaService.isTrustedDevice(
            principalId,
            tenantId,
            trustToken
          );

          if (isTrusted) {
            (req as any).mfaState = { verified: true, trustToken };
            return next();
          }
        } catch (error) {
          logger.error("Error checking trusted device", { error });
        }
      }
    }

    res.status(403).json({
      error: "MFA_REQUIRED",
      message: "This action requires MFA verification",
    });
  };
}
