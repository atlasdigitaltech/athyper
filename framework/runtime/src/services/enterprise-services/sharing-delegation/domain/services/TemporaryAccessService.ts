/**
 * TemporaryAccessService — Time-bound access grants with automatic expiry.
 *
 * Wraps RecordShareService and TaskDelegationService with expiry enforcement.
 */

import type { RecordShareService } from "./RecordShareService.js";
import type { ShareAuditService } from "./ShareAuditService.js";
import type { TaskDelegationService } from "./TaskDelegationService.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { DelegationGrantRepo } from "../../persistence/DelegationGrantRepo.js";
import type { RecordShareRepo } from "../../persistence/RecordShareRepo.js";
import type {
  RecordShare,
  DelegationGrant,
  CreateRecordShareInput,
  CreateDelegationInput,
} from "../types.js";

export class TemporaryAccessService {
  constructor(
    private readonly recordShareService: RecordShareService,
    private readonly delegationService: TaskDelegationService,
    private readonly auditService: ShareAuditService,
    private readonly delegationRepo: DelegationGrantRepo,
    private readonly shareRepo: RecordShareRepo,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a temporary record share with mandatory expiry.
   */
  async createTemporaryShare(
    input: CreateRecordShareInput & { expiresAt: Date },
  ): Promise<RecordShare> {
    if (input.expiresAt <= new Date()) {
      throw new Error("Expiry date must be in the future");
    }

    return this.recordShareService.share(input);
  }

  /**
   * Create a temporary delegation with mandatory expiry.
   */
  async createTemporaryDelegation(
    input: CreateDelegationInput & { expiresAt: Date },
  ): Promise<DelegationGrant> {
    if (input.expiresAt <= new Date()) {
      throw new Error("Expiry date must be in the future");
    }

    return this.delegationService.delegate(input);
  }

  /**
   * Revoke all expired grants across all tenants.
   * Called by the expiry cleanup worker.
   * Returns total count of revoked items.
   */
  async revokeAllExpired(): Promise<{
    delegationsRevoked: number;
    sharesRevoked: number;
  }> {
    const delegationsRevoked = await this.delegationRepo.revokeExpired();
    const sharesRevoked = await this.shareRepo.revokeExpired();

    if (delegationsRevoked > 0 || sharesRevoked > 0) {
      this.logger.info(
        { delegationsRevoked, sharesRevoked },
        "[share:expiry] Expired grants revoked",
      );
    }

    return { delegationsRevoked, sharesRevoked };
  }
}
