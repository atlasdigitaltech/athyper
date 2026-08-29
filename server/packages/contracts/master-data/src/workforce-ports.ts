import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { BusinessPartnerRequestService } from "./business-partner-request-ports.js";
import type { CompleteOffboardingResourceCommand, CompleteWorkforceChecklistItemCommand, OffboardWorkforceCommand, PersonEvidenceView, ReadPersonEvidenceQuery, RetryWorkforceIamCommand, WorkforceDetail, WorkforceListQuery, WorkforceQuery, WorkforceSourceAdapterCommand, WorkforceSummary } from "./workforce.js";

export interface WorkforceRepository<Transaction = unknown> {
  list(input: Omit<WorkforceListQuery, "context"> & { readonly tenantId: string }, transaction: Transaction): Promise<readonly WorkforceSummary[]>;
  get(tenantId: string, employeeId: string, transaction: Transaction): Promise<WorkforceDetail | null>;
  completeChecklistItem(input: Omit<CompleteWorkforceChecklistItemCommand, "context"> & { readonly tenantId: string; readonly completedBy: string }, transaction: Transaction): Promise<WorkforceDetail | null>;
  offboard(input: Omit<OffboardWorkforceCommand, "context"> & { readonly tenantId: string; readonly actorId: string }, transaction: Transaction): Promise<{ readonly caseId: string; readonly replayed: boolean; readonly workforce: WorkforceDetail } | null>;
  completeOffboardingResource(input: Omit<CompleteOffboardingResourceCommand, "context"> & { readonly tenantId: string; readonly completedBy: string }, transaction: Transaction): Promise<{ readonly caseId: string; readonly completed: boolean } | null>;
  requestIamProjection(input: Omit<RetryWorkforceIamCommand, "context"> & { readonly tenantId: string; readonly actorId: string }, transaction: Transaction): Promise<{ readonly projectionId: string; readonly replayed: boolean } | null>;
  readPersonEvidence(input: Omit<ReadPersonEvidenceQuery, "context"> & { readonly tenantId: string; readonly principalId: string; readonly requestId: string; readonly expiresAt: string }, transaction: Transaction): Promise<PersonEvidenceView | null>;
}

export interface WorkforceService {
  list(query: WorkforceListQuery): Promise<readonly WorkforceSummary[]>;
  get(query: WorkforceQuery): Promise<WorkforceDetail>;
  completeChecklistItem(command: CompleteWorkforceChecklistItemCommand): Promise<WorkforceDetail>;
  offboard(command: OffboardWorkforceCommand): Promise<{ readonly caseId: string; readonly replayed: boolean; readonly workforce: WorkforceDetail }>;
  completeOffboardingResource(command: CompleteOffboardingResourceCommand): Promise<{ readonly caseId: string; readonly completed: boolean }>;
  retryIam(command: RetryWorkforceIamCommand): Promise<{ readonly projectionId: string; readonly replayed: boolean }>;
  readPersonEvidence(query: ReadPersonEvidenceQuery): Promise<PersonEvidenceView>;
  ingest(command: WorkforceSourceAdapterCommand): Promise<readonly { readonly externalId: string; readonly requestId: string; readonly replayed: boolean }[]>;
}

export interface WorkforceServiceDependencies<Transaction> {
  readonly repository: WorkforceRepository<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
  readonly requests: BusinessPartnerRequestService;
}
