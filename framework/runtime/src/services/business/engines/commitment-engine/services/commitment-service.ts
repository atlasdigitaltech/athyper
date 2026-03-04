// framework/runtime/src/services/business/engines/commitment-engine/services/commitment-service.ts

import { ok, fail } from "../../shared/engine-base.js";
import {
  matchFulfillmentToSchedule,
  calculateFulfilledAmount,
} from "../domain/fulfillment-matcher.js";
import {
  isValidCommitmentTransition,
  determineStatusFromFulfillment,
} from "../domain/lifecycle.js";
import { generateScheduleEntries } from "../domain/schedule-generator.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  Commitment,
  CreateCommitmentInput,
  CommitmentStatus,
  CreateFulfillmentInput,
  CommitmentFulfillment,
  SchedulePattern,
} from "../domain/types.js";
import type { CommitmentRepo } from "../persistence/commitment-repo.js";
import type { CommitmentFulfillmentRepo } from "../persistence/fulfillment-repo.js";
import type { CommitmentScheduleRepo } from "../persistence/schedule-repo.js";

/**
 * Commitment Service — manages commitment lifecycle.
 * BOUNDARY RULE: NEVER mutates funding_profile directly.
 * Emits events for Budget Engine to react.
 */
export interface CommitmentService {
  create(
    ctx: OperationContext,
    input: CreateCommitmentInput,
    docNumber: string,
    schedulePattern?: SchedulePattern,
  ): Promise<ServiceResult<Commitment>>;
  getById(tenantId: string, id: string): Promise<Commitment | null>;
  transition(
    ctx: OperationContext,
    id: string,
    targetStatus: CommitmentStatus,
  ): Promise<ServiceResult<Commitment>>;
  recordFulfillment(
    ctx: OperationContext,
    input: CreateFulfillmentInput,
  ): Promise<ServiceResult<CommitmentFulfillment>>;
  approve(
    ctx: OperationContext,
    id: string,
  ): Promise<ServiceResult<Commitment>>;
}

export class DefaultCommitmentService implements CommitmentService {
  constructor(
    private readonly commitmentRepo: CommitmentRepo,
    private readonly scheduleRepo: CommitmentScheduleRepo,
    private readonly fulfillmentRepo: CommitmentFulfillmentRepo,
  ) {}

  async create(
    ctx: OperationContext,
    input: CreateCommitmentInput,
    docNumber: string,
    schedulePattern?: SchedulePattern,
  ): Promise<ServiceResult<Commitment>> {
    // Create commitment
    const commitment = await this.commitmentRepo.create({
      ...input,
      docNumber,
    });

    // Generate schedule entries if pattern provided
    if (schedulePattern) {
      const entries = generateScheduleEntries(
        commitment.id,
        ctx.tenantId,
        schedulePattern,
        input.effectiveDate,
        input.totalAmount,
        input.currencyCode,
      );
      if (entries.length > 0) {
        await this.scheduleRepo.createBatch(entries);
      }
    }

    return ok(commitment);
  }

  async getById(tenantId: string, id: string): Promise<Commitment | null> {
    return this.commitmentRepo.getById(tenantId, id);
  }

  async transition(
    ctx: OperationContext,
    id: string,
    targetStatus: CommitmentStatus,
  ): Promise<ServiceResult<Commitment>> {
    const commitment = await this.commitmentRepo.getById(ctx.tenantId, id);
    if (!commitment) {
      return fail("COMMITMENT_NOT_FOUND", `Commitment ${id} not found`);
    }

    if (!isValidCommitmentTransition(commitment.status, targetStatus)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition from ${commitment.status} to ${targetStatus}`,
      );
    }

    // If cancelling, cancel pending schedules
    if (targetStatus === "CANCELLED") {
      await this.scheduleRepo.cancelAllPending(ctx.tenantId, id);
    }

    const updated = await this.commitmentRepo.updateStatus(
      ctx.tenantId,
      id,
      targetStatus,
    );
    return ok(updated);
  }

  async recordFulfillment(
    ctx: OperationContext,
    input: CreateFulfillmentInput,
  ): Promise<ServiceResult<CommitmentFulfillment>> {
    const commitment = await this.commitmentRepo.getById(
      ctx.tenantId,
      input.commitmentId,
    );
    if (!commitment) {
      return fail(
        "COMMITMENT_NOT_FOUND",
        `Commitment ${input.commitmentId} not found`,
      );
    }

    if (
      commitment.status !== "ACTIVE" &&
      commitment.status !== "PARTIALLY_FULFILLED"
    ) {
      return fail(
        "COMMITMENT_NOT_ACTIVE",
        `Commitment is ${commitment.status}, must be ACTIVE or PARTIALLY_FULFILLED`,
      );
    }

    // Match to schedule if applicable
    if (!input.scheduleId) {
      const schedules = await this.scheduleRepo.getByCommitmentId(
        ctx.tenantId,
        commitment.id,
      );
      const matched = matchFulfillmentToSchedule(schedules, input);
      if (matched) {
        input = { ...input, scheduleId: matched.id };
      }
    }

    // Record fulfillment
    const fulfillment = await this.fulfillmentRepo.create(input);

    // Update fulfilled amount
    const allFulfillments = await this.fulfillmentRepo.getByCommitmentId(
      ctx.tenantId,
      commitment.id,
    );
    const fulfilledAmount = calculateFulfilledAmount(allFulfillments);
    await this.commitmentRepo.updateFulfilledAmount(
      ctx.tenantId,
      commitment.id,
      fulfilledAmount,
    );

    // Auto-transition status
    const newStatus = determineStatusFromFulfillment(
      commitment.totalAmount,
      fulfilledAmount,
    );
    if (newStatus !== commitment.status) {
      await this.commitmentRepo.updateStatus(
        ctx.tenantId,
        commitment.id,
        newStatus,
      );
    }

    // Update schedule status if matched
    if (input.scheduleId) {
      await this.scheduleRepo.updateStatus(
        ctx.tenantId,
        input.scheduleId,
        "FULFILLED",
        {
          fulfilledAt: new Date(),
        },
      );
    }

    return ok(fulfillment);
  }

  async approve(
    ctx: OperationContext,
    id: string,
  ): Promise<ServiceResult<Commitment>> {
    const commitment = await this.commitmentRepo.getById(ctx.tenantId, id);
    if (!commitment) {
      return fail("COMMITMENT_NOT_FOUND", `Commitment ${id} not found`);
    }

    if (commitment.status !== "PENDING") {
      return fail(
        "NOT_PENDING",
        `Commitment is ${commitment.status}, must be PENDING for approval`,
      );
    }

    await this.commitmentRepo.updateApproval(ctx.tenantId, id, ctx.actorId);
    const updated = await this.commitmentRepo.updateStatus(
      ctx.tenantId,
      id,
      "ACTIVE",
    );
    return ok(updated);
  }
}
