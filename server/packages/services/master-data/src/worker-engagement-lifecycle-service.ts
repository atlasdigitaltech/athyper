import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  SupplierWorkforceCommandGuard,
  SupplierWorkforcePolicyProof,
} from "./supplier-workforce-command-guard.js";
import { MasterDataError } from "./errors.js";

export interface PlacementCommandResult {
  readonly workerEngagementId: string;
  readonly placementId: string;
  readonly engagementVersion: number;
  readonly outboxId: string;
  readonly replayed: boolean;
}
export interface EngagementEndResult {
  readonly workerEngagementId: string;
  readonly engagementVersion: number;
  readonly iamOutboxId: string;
  readonly iamDesiredHash: string;
  readonly outboxId: string;
  readonly replayed: boolean;
}
export interface WorkerEngagementLifecycleRepository<Tx> {
  activatePlacement(
    input: Readonly<{
      tenantId: string;
      workerEngagementId: string;
      expectedVersion: number;
      idempotencyKey: string;
      actorId: string;
      correlationId?: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      companyCodeId: string;
      positionId?: string;
      orgUnitId?: string;
      managerEmployeeId?: string;
      costCenterId?: string;
      profitCenterId?: string;
      projectId?: string;
      siteId?: string;
      allocationPercent: number;
      isPrimary: boolean;
      metadata: Readonly<Record<string, unknown>>;
      policyEvidence: SupplierWorkforcePolicyProof;
    }>,
    tx: Tx,
  ): Promise<PlacementCommandResult | null>;
  endEngagement(
    input: Readonly<{
      tenantId: string;
      workerEngagementId: string;
      expectedVersion: number;
      idempotencyKey: string;
      actorId: string;
      correlationId?: string;
      reasonCode: string;
      effectiveAt: string;
      policyEvidence: SupplierWorkforcePolicyProof;
    }>,
    tx: Tx,
  ): Promise<EngagementEndResult | null>;
}

export function createWorkerEngagementLifecycleService<Tx>(options: {
  guard: SupplierWorkforceCommandGuard;
  repository: WorkerEngagementLifecycleRepository<Tx>;
  transactions: {
    run<T>(
      plane: "neon",
      actor: {
        tenantId: string;
        principalId: string;
        requestId: string;
        correlationId?: string;
      },
      work: (tx: Tx) => Promise<T>,
    ): Promise<T>;
  };
}) {
  const run = <T>(
    context: VerifiedRequestContext,
    work: (tx: Tx) => Promise<T>,
  ) => options.transactions.run("neon", actor(context), work);
  return Object.freeze({
    async activatePlacement(input: {
      context: VerifiedRequestContext;
      workerEngagementId: string;
      expectedVersion: number;
      idempotencyKey: string;
      effectiveFrom: string;
      effectiveUntil?: string;
      companyCodeId: string;
      positionId?: string;
      orgUnitId?: string;
      managerEmployeeId?: string;
      costCenterId?: string;
      profitCenterId?: string;
      projectId?: string;
      siteId?: string;
      allocationPercent?: number;
      isPrimary?: boolean;
      metadata?: Readonly<Record<string, unknown>>;
    }) {
      validateCommon(input);
      date(input.effectiveFrom, "effectiveFrom");
      if (input.effectiveUntil) {
        date(input.effectiveUntil, "effectiveUntil");
        if (input.effectiveUntil <= input.effectiveFrom)
          throw invalid("effectiveUntil must be after effectiveFrom");
      }
      const allocation = input.allocationPercent ?? 100;
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 100)
        throw invalid("allocationPercent must be between 0 and 100");
      return options.guard.execute(
        {
          context: input.context,
          boundary: "placement_change",
          permissionCode: "neon.workforce.request.apply",
          resource: {
            workerEngagementId: input.workerEngagementId,
            companyCodeId: input.companyCodeId,
          },
        },
        async (policyEvidence) => {
          const result = await run(input.context, (tx) =>
            options.repository.activatePlacement(
              {
                ...input,
                tenantId: input.context.tenantId,
                actorId: input.context.principalId,
                allocationPercent: allocation,
                isPrimary: input.isPrimary ?? true,
                metadata: input.metadata ?? {},
                ...(uuid(input.context.correlationId)
                  ? { correlationId: input.context.correlationId }
                  : {}),
                policyEvidence,
              },
              tx,
            ),
          );
          if (!result)
            throw conflict("Placement activation did not produce a result");
          return result;
        },
      );
    },
    async endEngagement(input: {
      context: VerifiedRequestContext;
      workerEngagementId: string;
      expectedVersion: number;
      idempotencyKey: string;
      reasonCode: string;
      effectiveAt: string;
    }) {
      validateCommon(input);
      if (!/^[A-Z][A-Z0-9_.-]{1,126}$/.test(input.reasonCode))
        throw invalid("reasonCode must be a safe reason code");
      if (Number.isNaN(Date.parse(input.effectiveAt)))
        throw invalid("effectiveAt must be an ISO timestamp");
      return options.guard.execute(
        {
          context: input.context,
          boundary: "engagement_end",
          permissionCode: "neon.workforce.request.apply",
          resource: { workerEngagementId: input.workerEngagementId },
        },
        async (policyEvidence) => {
          const result = await run(input.context, (tx) =>
            options.repository.endEngagement(
              {
                ...input,
                tenantId: input.context.tenantId,
                actorId: input.context.principalId,
                ...(uuid(input.context.correlationId)
                  ? { correlationId: input.context.correlationId }
                  : {}),
                policyEvidence,
              },
              tx,
            ),
          );
          if (!result)
            throw conflict("Engagement termination did not produce a result");
          return result;
        },
      );
    },
  });
}
function validateCommon(value: {
  expectedVersion: number;
  idempotencyKey: string;
}) {
  if (!Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1)
    throw invalid("expectedVersion must be positive");
  if (
    value.idempotencyKey.trim() !== value.idempotencyKey ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 180
  )
    throw invalid("idempotencyKey must contain 8 to 180 trimmed characters");
}
function date(value: string, name: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
    throw invalid(`${name} must be an ISO date`);
}
function actor(c: VerifiedRequestContext) {
  return {
    tenantId: c.tenantId,
    principalId: c.principalId,
    requestId: c.requestId,
    ...(c.correlationId ? { correlationId: c.correlationId } : {}),
  };
}
function uuid(v: string | undefined): v is string {
  return Boolean(
    v &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    ),
  );
}
function invalid(message: string) {
  return new MasterDataError(
    400,
    "WORKER_ENGAGEMENT_LIFECYCLE_INVALID",
    message,
  );
}
function conflict(message: string) {
  return new MasterDataError(
    409,
    "WORKER_ENGAGEMENT_LIFECYCLE_CONFLICT",
    message,
  );
}
