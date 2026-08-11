import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JobHandler } from "@athyper/server-contract-jobs";
import type { OnboardingLifecycleRepository, OnboardingTransactionCoordinator } from "./case-lifecycle.js";

export const ONBOARDING_MAINTENANCE_QUEUE = "studio-onboarding-maintenance";
export const EXPIRE_ONBOARDING_GUEST_ACCESS_JOB = "onboarding-guest-access-expire";

export interface GuestAccessExpiryPayload {
  readonly tenantId: string;
  readonly actorId: string;
  readonly limit?: number;
}

export class OnboardingMaintenanceService<Transaction> {
  constructor(
    private readonly repository: OnboardingLifecycleRepository<Transaction>,
    private readonly transactions: OnboardingTransactionCoordinator<Transaction>,
    private readonly authorizer: Authorizer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveWorkItem(command: { readonly context: VerifiedRequestContext; readonly caseId: string; readonly workItemId: string }): Promise<boolean> {
    const decision = await this.authorizer.authorize({ context: command.context, permissionCode: "studio.onboarding.work_item.resolve" });
    if (!decision.allowed) throw coded("ONBOARDING_WORK_ITEM_FORBIDDEN");
    return this.transactions.run(
      { tenantId: command.context.tenantId, principalId: command.context.principalId },
      transaction => this.repository.resolveWorkItem({ tenantId: command.context.tenantId, caseId: command.caseId, workItemId: command.workItemId, actorId: command.context.principalId }, transaction),
    );
  }

  async revokeExpiredGuestAccess(input: GuestAccessExpiryPayload): Promise<readonly string[]> {
    const limit = input.limit ?? 500;
    if (!input.tenantId.trim() || !input.actorId.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 5_000) throw coded("ONBOARDING_GUEST_EXPIRY_PAYLOAD_INVALID");
    return this.transactions.run(
      { tenantId: input.tenantId, principalId: input.actorId },
      transaction => this.repository.revokeExpiredGuestAccess({ tenantId: input.tenantId, actorId: input.actorId, now: this.now().toISOString(), limit }, transaction),
    );
  }
}

export function createGuestAccessExpiryHandler<Transaction>(service: OnboardingMaintenanceService<Transaction>): JobHandler<typeof EXPIRE_ONBOARDING_GUEST_ACCESS_JOB, GuestAccessExpiryPayload> {
  return {
    async handle(job, context) {
      if (context.signal.aborted) return { status: "discarded", reason: "cancelled" };
      const revoked = await service.revokeExpiredGuestAccess(job.data);
      await context.reportProgress({ revoked: revoked.length });
      return { status: "completed", output: { revoked: revoked.length } };
    },
  };
}

function coded(code: string): Error { return Object.assign(new Error(code), { code }); }
