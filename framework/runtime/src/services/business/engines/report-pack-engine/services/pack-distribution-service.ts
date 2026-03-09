// framework/runtime/src/services/business/engines/report-pack-engine/services/pack-distribution-service.ts
//
// Manages governed distribution of pack instances.
// Creates distribution records, tracks recipients, and logs downloads.
// Actual delivery is delegated to notify.* — this is the finance-side registry.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  PackDistribution,
  PackDistributionRecipient,
  DistributionFormat,
} from "../domain/types.js";
import type { PackInstanceRepo } from "../persistence/pack-repo.js";
import type {
  CertificationRepo,
  DistributionRepo,
  PackActivityRepo,
} from "../persistence/governance-repo.js";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateDistributionInput {
  packInstanceId: string;
  distributionCode: string;
  name: string;
  description?: string;
  format: DistributionFormat;
  recipients: RecipientInput[];
  notes?: string;
  linkExpiresAt?: Date;
}

export interface RecipientInput {
  recipientId?: string;
  recipientName: string;
  recipientEmail?: string;
  recipientRole?: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PackDistributionService {
  /** Create a new distribution for a certified pack */
  createDistribution(
    ctx: OperationContext,
    input: CreateDistributionInput,
  ): Promise<ServiceResult<PackDistribution>>;

  /** Get distribution with recipients */
  getDistribution(
    id: string,
  ): Promise<ServiceResult<{
    distribution: PackDistribution;
    recipients: PackDistributionRecipient[];
  }>>;

  /** List distributions for a pack instance */
  listDistributions(
    packInstanceId: string,
  ): Promise<PackDistribution[]>;

  /** Mark a distribution as sent (after notify.* delivery) */
  markSent(
    ctx: OperationContext,
    distributionId: string,
  ): Promise<ServiceResult<PackDistribution>>;

  /** Recall a distribution */
  recall(
    ctx: OperationContext,
    distributionId: string,
    reason: string,
  ): Promise<ServiceResult<PackDistribution>>;

  /** Record a view or download event */
  recordAccess(
    ctx: OperationContext,
    distributionId: string,
    recipientId: string | null,
    eventType: "VIEW" | "DOWNLOAD",
    format?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ServiceResult<void>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultPackDistributionService
  implements PackDistributionService
{
  constructor(
    private readonly distRepo: DistributionRepo,
    private readonly certRepo: CertificationRepo,
    private readonly instanceRepo: PackInstanceRepo,
    private readonly activityRepo: PackActivityRepo,
  ) {}

  async createDistribution(
    ctx: OperationContext,
    input: CreateDistributionInput,
  ): Promise<ServiceResult<PackDistribution>> {
    // Verify pack instance exists and is in a distributable state
    const instance = await this.instanceRepo.getById(ctx.tenantId, input.packInstanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Pack instance ${input.packInstanceId} not found`);
    }

    if (instance.status !== "PUBLISHED" && instance.status !== "FINALIZED") {
      return fail(
        "NOT_DISTRIBUTABLE",
        `Pack must be FINALIZED or PUBLISHED to distribute (current: ${instance.status})`,
      );
    }

    // Check certification exists
    const cert = await this.certRepo.getByPackInstance(input.packInstanceId);

    // Generate secure link token for LINK format
    const secureLinkToken = input.format === "LINK"
      ? generateSecureToken()
      : null;

    // Create distribution
    const distribution = await this.distRepo.create({
      tenantId: ctx.tenantId,
      packInstanceId: input.packInstanceId,
      distributionCode: input.distributionCode,
      name: input.name,
      description: input.description ?? null,
      format: input.format,
      certificationId: cert?.id ?? null,
      distributedBy: ctx.actorId,
      secureLinkToken,
      linkExpiresAt: input.linkExpiresAt ?? null,
      notes: input.notes ?? null,
    });

    // Add recipients
    for (const r of input.recipients) {
      await this.distRepo.addRecipient({
        distributionId: distribution.id,
        recipientId: r.recipientId ?? null,
        recipientName: r.recipientName,
        recipientEmail: r.recipientEmail ?? null,
        recipientRole: r.recipientRole ?? null,
      });
    }

    // Update counts
    await this.distRepo.updateCounts(distribution.id, {
      recipientCount: input.recipients.length,
    });

    // Log activity
    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance.entityCode,
      packInstanceId: input.packInstanceId,
      activityType: "DISTRIBUTION_CREATED",
      actorType: "user",
      actorId: ctx.actorId,
      message: `Distribution "${input.name}" created for ${input.recipients.length} recipients`,
      payload: {
        distributionId: distribution.id,
        format: input.format,
        recipientCount: input.recipients.length,
      },
    });

    return ok(distribution);
  }

  async getDistribution(
    id: string,
  ): Promise<ServiceResult<{
    distribution: PackDistribution;
    recipients: PackDistributionRecipient[];
  }>> {
    const distribution = await this.distRepo.getById(id);
    if (!distribution) {
      return fail("DISTRIBUTION_NOT_FOUND", `Distribution ${id} not found`);
    }

    const recipients = await this.distRepo.getRecipients(id);
    return ok({ distribution, recipients });
  }

  async listDistributions(
    packInstanceId: string,
  ): Promise<PackDistribution[]> {
    return this.distRepo.listByPackInstance(packInstanceId);
  }

  async markSent(
    ctx: OperationContext,
    distributionId: string,
  ): Promise<ServiceResult<PackDistribution>> {
    const dist = await this.distRepo.getById(distributionId);
    if (!dist) {
      return fail("DISTRIBUTION_NOT_FOUND", `Distribution ${distributionId} not found`);
    }

    if (dist.status === "RECALLED") {
      return fail("ALREADY_RECALLED", "Cannot send a recalled distribution");
    }

    const updated = await this.distRepo.updateStatus(distributionId, "SENT");

    // Log activity
    const instance = await this.instanceRepo.getById(ctx.tenantId, dist.packInstanceId);
    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance?.entityCode ?? "",
      packInstanceId: dist.packInstanceId,
      activityType: "DISTRIBUTION_SENT",
      actorType: "system",
      actorId: ctx.actorId,
      message: `Distribution "${dist.name}" sent`,
      payload: { distributionId },
    });

    return ok(updated);
  }

  async recall(
    ctx: OperationContext,
    distributionId: string,
    reason: string,
  ): Promise<ServiceResult<PackDistribution>> {
    const dist = await this.distRepo.getById(distributionId);
    if (!dist) {
      return fail("DISTRIBUTION_NOT_FOUND", `Distribution ${distributionId} not found`);
    }

    if (dist.status === "RECALLED") {
      return fail("ALREADY_RECALLED", "Distribution already recalled");
    }

    const updated = await this.distRepo.recall(distributionId, ctx.actorId, reason);

    const instance = await this.instanceRepo.getById(ctx.tenantId, dist.packInstanceId);
    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance?.entityCode ?? "",
      packInstanceId: dist.packInstanceId,
      activityType: "DISTRIBUTION_SENT", // reuse — payload distinguishes recall
      actorType: "user",
      actorId: ctx.actorId,
      message: `Distribution "${dist.name}" recalled: ${reason}`,
      payload: { distributionId, action: "RECALLED", reason },
    });

    return ok(updated);
  }

  async recordAccess(
    ctx: OperationContext,
    distributionId: string,
    recipientId: string | null,
    eventType: "VIEW" | "DOWNLOAD",
    format?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ServiceResult<void>> {
    const dist = await this.distRepo.getById(distributionId);
    if (!dist) {
      return fail("DISTRIBUTION_NOT_FOUND", `Distribution ${distributionId} not found`);
    }

    if (dist.status === "RECALLED") {
      return fail("DISTRIBUTION_RECALLED", "This distribution has been recalled");
    }

    // Log the access event
    await this.distRepo.logDownload({
      tenantId: ctx.tenantId,
      distributionId,
      recipientId,
      eventType,
      format: format ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    // Update recipient engagement
    if (recipientId) {
      if (eventType === "VIEW") {
        await this.distRepo.recordView(recipientId);
      } else {
        await this.distRepo.recordDownload(recipientId);
      }
    }

    // Update distribution counts
    const recipients = await this.distRepo.getRecipients(distributionId);
    const viewedCount = recipients.filter((r) => r.viewCount > 0).length;
    const downloadedCount = recipients.filter((r) => r.downloadCount > 0).length;
    await this.distRepo.updateCounts(distributionId, {
      viewedCount,
      downloadedCount,
    });

    // Log activity
    const activityType = eventType === "VIEW"
      ? "DISTRIBUTION_VIEWED" as const
      : "DISTRIBUTION_DOWNLOADED" as const;

    const instance = await this.instanceRepo.getById(ctx.tenantId, dist.packInstanceId);
    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance?.entityCode ?? "",
      packInstanceId: dist.packInstanceId,
      activityType,
      actorType: "user",
      actorId: ctx.actorId,
      message: `Pack ${eventType.toLowerCase()}ed`,
      payload: { distributionId, recipientId, format },
    });

    return ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSecureToken(): string {
  // Crypto-random hex token (64 chars = 256 bits)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
