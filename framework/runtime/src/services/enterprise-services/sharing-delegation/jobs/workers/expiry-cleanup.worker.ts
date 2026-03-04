/**
 * Expiry Cleanup Worker — Revokes expired delegation grants and record shares.
 *
 * Runs as a scheduled job (daily) to clean up expired grants.
 * Uses TemporaryAccessService.revokeAllExpired() for the actual work.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { ShareAuditService } from "../../domain/services/ShareAuditService.js";
import type { TemporaryAccessService } from "../../domain/services/TemporaryAccessService.js";
import type { Job } from "@athyper/core";

export interface ExpiryCleanupPayload {
  triggeredBy?: string;
}

export interface ExpiryCleanupResult {
  delegationsRevoked: number;
  sharesRevoked: number;
  executedAt: string;
}

/**
 * Factory: creates the expiry cleanup job handler.
 */
export function createExpiryCleanupHandler(
  temporaryAccessService: TemporaryAccessService,
  auditService: ShareAuditService,
  logger: Logger,
) {
  return async function expiryCleanupHandler(
    job: Job<ExpiryCleanupPayload>,
  ): Promise<ExpiryCleanupResult> {
    logger.info("[share:expiry-cleanup] Starting expiry cleanup job");

    const { delegationsRevoked, sharesRevoked } =
      await temporaryAccessService.revokeAllExpired();

    const result: ExpiryCleanupResult = {
      delegationsRevoked,
      sharesRevoked,
      executedAt: new Date().toISOString(),
    };

    if (delegationsRevoked > 0 || sharesRevoked > 0) {
      logger.info(result, "[share:expiry-cleanup] Cleanup complete");
    } else {
      logger.debug("[share:expiry-cleanup] No expired grants found");
    }

    return result;
  };
}
