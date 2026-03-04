// framework/runtime/src/services/business/engines/federation-engine/services/ic-transaction-service.ts

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  IntercompanyTransaction,
  CreateICTransactionInput,
} from "../domain/types.js";
import type { ICTransactionRepo } from "../persistence/ic-transaction-repo.js";
import type { LegalEntityRepo } from "../persistence/legal-entity-repo.js";

/**
 * Intercompany Transaction Service — manages IC order creation and mirroring.
 */
export interface ICTransactionService {
  /** Create an IC transaction and auto-mirror to dest entity */
  create(
    ctx: OperationContext,
    input: CreateICTransactionInput,
  ): Promise<ServiceResult<IntercompanyTransaction>>;
  /** Get IC transaction by ID */
  getById(
    tenantId: string,
    id: string,
  ): Promise<IntercompanyTransaction | null>;
  /** Mark IC transaction as posted (both sides) */
  markPosted(
    ctx: OperationContext,
    id: string,
    sourceJeId: string,
    destJeId: string,
  ): Promise<ServiceResult<IntercompanyTransaction>>;
}

export class DefaultICTransactionService implements ICTransactionService {
  constructor(
    private readonly icRepo: ICTransactionRepo,
    private readonly entityRepo: LegalEntityRepo,
  ) {}

  async create(
    ctx: OperationContext,
    input: CreateICTransactionInput,
  ): Promise<ServiceResult<IntercompanyTransaction>> {
    // Validate both entities exist
    const source = await this.entityRepo.getByCode(
      ctx.tenantId,
      input.sourceEntityCode,
    );
    if (!source)
      return fail(
        "SOURCE_NOT_FOUND",
        `Source entity ${input.sourceEntityCode} not found`,
      );

    const dest = await this.entityRepo.getByCode(
      ctx.tenantId,
      input.destEntityCode,
    );
    if (!dest)
      return fail(
        "DEST_NOT_FOUND",
        `Dest entity ${input.destEntityCode} not found`,
      );

    if (input.sourceEntityCode === input.destEntityCode) {
      return fail(
        "SAME_ENTITY",
        "Source and destination entities cannot be the same",
      );
    }

    const txn = await this.icRepo.create(input);

    // Auto-mirror (set status to MIRRORED)
    const mirrored = await this.icRepo.updateStatus(
      ctx.tenantId,
      txn.id,
      "MIRRORED",
    );
    return ok(mirrored);
  }

  async getById(
    tenantId: string,
    id: string,
  ): Promise<IntercompanyTransaction | null> {
    return this.icRepo.getById(tenantId, id);
  }

  async markPosted(
    ctx: OperationContext,
    id: string,
    sourceJeId: string,
    destJeId: string,
  ): Promise<ServiceResult<IntercompanyTransaction>> {
    const txn = await this.icRepo.getById(ctx.tenantId, id);
    if (!txn) return fail("IC_TXN_NOT_FOUND", `IC transaction ${id} not found`);

    const updated = await this.icRepo.updateStatus(ctx.tenantId, id, "POSTED", {
      sourceJeId,
      destJeId,
    });
    return ok(updated);
  }
}
