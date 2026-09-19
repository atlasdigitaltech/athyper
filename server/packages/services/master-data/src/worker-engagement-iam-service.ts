import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { SupplierWorkforceCommandGuard, SupplierWorkforcePolicyProof } from "./supplier-workforce-command-guard.js";
import { MasterDataError } from "./errors.js";

export interface WorkerEngagementIamResult {
  readonly workerEngagementId: string;
  readonly desiredStatus: "active" | "suspended" | "deprovisioned";
  readonly desiredVersion: number;
  readonly desiredHash: string;
  readonly outboxId: string;
  readonly replayed: boolean;
}

export interface WorkerEngagementIamRepository<Tx> {
  project(input: Readonly<{
    tenantId: string;
    workerEngagementId: string;
    expectedVersion: number;
    idempotencyKey: string;
    actorId: string;
    correlationId?: string;
    policyEvidence: SupplierWorkforcePolicyProof;
  }>, transaction: Tx): Promise<WorkerEngagementIamResult | null>;
}

export function createWorkerEngagementIamService<Tx>(options: {
  guard: SupplierWorkforceCommandGuard;
  repository: WorkerEngagementIamRepository<Tx>;
  transactions: { run<T>(plane: "neon", actor: { tenantId: string; principalId: string; requestId: string; correlationId?: string }, work: (transaction: Tx) => Promise<T>): Promise<T> };
}) {
  return Object.freeze({
    async project(input: Readonly<{
      context: VerifiedRequestContext;
      workerEngagementId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }>): Promise<WorkerEngagementIamResult> {
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
        throw invalid("expectedVersion must be a positive integer");
      if (input.idempotencyKey.trim() !== input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200)
        throw invalid("idempotencyKey must contain 8 to 200 trimmed characters");
      return options.guard.execute({
        context: input.context,
        boundary: "iam_project",
        permissionCode: "neon.workforce.request.apply",
        resource: { workerEngagementId: input.workerEngagementId },
      }, async (policyEvidence) => {
        const result = await options.transactions.run("neon", actor(input.context), (transaction) =>
          options.repository.project({
            tenantId: input.context.tenantId,
            workerEngagementId: input.workerEngagementId,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
            actorId: input.context.principalId,
            ...(uuid(input.context.correlationId) ? { correlationId: input.context.correlationId } : {}),
            policyEvidence,
          }, transaction),
        );
        if (!result)
          throw new MasterDataError(409, "WORKER_ENGAGEMENT_IAM_CONFLICT", "Worker engagement IAM projection did not produce a result");
        return result;
      });
    },
  });
}

function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}) }; }
function uuid(value: string | undefined): value is string { return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)); }
function invalid(message: string) { return new MasterDataError(400, "WORKER_ENGAGEMENT_IAM_INVALID", message); }
