import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";

export interface GovernedEntityCaseResult {
  readonly caseId: string;
  readonly snapshotId: string;
  readonly rowVersion: number;
  readonly status:
    "draft" | "submitted" | "approved" | "rejected" | "returned" | "materialized";
  readonly replayed: boolean;
  readonly outboxId: string;
  readonly businessPartnerId?: string;
}

export interface CreateGovernedInternalBusinessPartnerCaseCommand {
  readonly context: VerifiedRequestContext;
  readonly caseId: string;
  readonly caseCode: string;
  readonly entityContractId: string;
  readonly entityContractHash: string;
  readonly formTemplateReleaseId: string;
  readonly formTemplateReleaseNo: number;
  readonly formTemplateHash: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}

export interface TransitionGovernedInternalBusinessPartnerCaseCommand {
  readonly context: VerifiedRequestContext;
  readonly caseId: string;
  readonly action: "submit" | "approve" | "reject" | "return";
  readonly expectedVersion: number;
  readonly cycleRunId: string;
  readonly cycleTaskId: string;
  readonly reason?: string;
  readonly idempotencyKey: string;
}

export interface MaterializeGovernedInternalBusinessPartnerCaseCommand {
  readonly context: VerifiedRequestContext;
  readonly caseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface GovernedInternalBusinessPartnerCaseRepository<
  Transaction = unknown,
> {
  createDraft(
    command: CreateGovernedInternalBusinessPartnerCaseCommand,
    transaction: Transaction,
  ): Promise<GovernedEntityCaseResult>;
  transition(
    command: TransitionGovernedInternalBusinessPartnerCaseCommand,
    transaction: Transaction,
  ): Promise<GovernedEntityCaseResult>;
  materialize(
    command: MaterializeGovernedInternalBusinessPartnerCaseCommand,
    transaction: Transaction,
  ): Promise<GovernedEntityCaseResult>;
}

export interface GovernedInternalBusinessPartnerCaseService {
  createDraft(
    command: CreateGovernedInternalBusinessPartnerCaseCommand,
  ): Promise<GovernedEntityCaseResult>;
  transition(
    command: TransitionGovernedInternalBusinessPartnerCaseCommand,
  ): Promise<GovernedEntityCaseResult>;
  materialize(
    command: MaterializeGovernedInternalBusinessPartnerCaseCommand,
  ): Promise<GovernedEntityCaseResult>;
}

export type GovernedInternalBusinessPartnerCaseTransactionCoordinator<
  Transaction,
> = PlaneTransactionCoordinator<Transaction>;
