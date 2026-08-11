import { formatNumber, NumberingError, type NumberingAllocationInput, type NumberingPolicy, type NumberingPreviewInput, type NumberingResult, type NumberingService } from "@athyper/server-contract-numbering";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export interface NumberingRepository<Transaction> {
  resolvePolicy(transaction: Transaction, input: NumberingPreviewInput): Promise<NumberingPolicy | undefined>;
  allocate(transaction: Transaction, input: NumberingAllocationInput, policy: NumberingPolicy): Promise<NumberingResult>;
}

export class DefaultNumberingService<Transaction> implements NumberingService {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Transaction>, private readonly repository: NumberingRepository<Transaction>) {}

  preview(input: NumberingPreviewInput): Promise<NumberingResult> {
    validateInput(input);
    return this.transactions.run(input.context.planeKey, input.context, async (transaction) => {
      const policy = await this.requiredPolicy(transaction, input);
      return formatNumber(policy, { ...input, tenantId: input.context.tenantId });
    });
  }

  async allocate(input: NumberingAllocationInput): Promise<NumberingResult> {
    validateInput(input);
    requiredUuid(input.allocationId, "NUMBERING_ALLOCATION_ID_INVALID");
    if (input.correlationId) requiredUuid(input.correlationId, "NUMBERING_CORRELATION_ID_INVALID");
    return this.transactions.run(input.context.planeKey, input.context, (transaction) => this.allocateWithinTransaction(transaction, input));
  }

  async allocateWithinTransaction(transaction: Transaction, input: NumberingAllocationInput): Promise<NumberingResult> {
    const policy = await this.requiredPolicy(transaction, { ...input, nextValue: 0 });
    return this.repository.allocate(transaction, input, policy);
  }

  private async requiredPolicy(transaction: Transaction, input: NumberingPreviewInput): Promise<NumberingPolicy> {
    const policy = await this.repository.resolvePolicy(transaction, input);
    if (!policy) throw new NumberingError("NUMBERING_POLICY_NOT_FOUND", `Active policy ${input.policyCode}@${input.policyRevision} was not found`, 404);
    return policy;
  }
}

function validateInput(input: NumberingPreviewInput | NumberingAllocationInput): void {
  requiredUuid(input.context.tenantId, "NUMBERING_TENANT_INVALID");
  requiredUuid(input.context.principalId, "NUMBERING_PRINCIPAL_INVALID");
  if (!/^[a-z][a-z0-9_.-]{1,126}$/u.test(input.policyCode)) throw new NumberingError("NUMBERING_POLICY_CODE_INVALID", "policyCode is invalid", 400);
  if (!Number.isInteger(input.policyRevision) || input.policyRevision < 1) throw new NumberingError("NUMBERING_POLICY_REVISION_INVALID", "policyRevision must be positive", 400);
}

function requiredUuid(value: string, code: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new NumberingError(code, `${code} must be a UUID`, 400);
}
