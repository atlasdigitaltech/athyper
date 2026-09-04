import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  ApplyWorkforceRequestCommand,
  ApplyWorkforceRequestResponse,
  CompleteOffboardingResourceCommand,
  CompleteWorkforceChecklistItemCommand,
  CreateWorkforceRequestCommand,
  DecideWorkforceRequestCommand,
  DecideWorkforceRequestResponse,
  OffboardWorkforceCommand,
  PersonEvidenceView,
  ReadPersonEvidenceQuery,
  RetryWorkforceIamCommand,
  SubmitWorkforceRequestCommand,
  SubmitWorkforceRequestResponse,
  ValidateWorkforceRequestCommand,
  ValidateWorkforceRequestResponse,
  WorkforceDetail,
  WorkforceListQuery,
  WorkforceQuery,
  WorkforceRequest,
  WorkforceRequestListQuery,
  WorkforceRequestValidationResult,
  WorkforceRequestWorkflowDefinition,
  WorkforceSourceAdapterCommand,
  WorkforceSummary,
} from "./workforce.js";

export interface WorkforceRequestRepository<Transaction = unknown> {
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<WorkforceRequest | null>;
  create(
    input: {
      readonly tenantId: string;
      readonly requestNo: string;
      readonly command: Omit<CreateWorkforceRequestCommand, "context">;
      readonly createdBy: string;
    },
    transaction: Transaction,
  ): Promise<WorkforceRequest>;
  get(
    tenantId: string,
    requestId: string,
    transaction: Transaction,
  ): Promise<WorkforceRequest | null>;
  list(
    input: Omit<WorkforceRequestListQuery, "context"> & {
      readonly tenantId: string;
    },
    transaction: Transaction,
  ): Promise<readonly WorkforceRequest[]>;
  recordValidation(
    input: {
      readonly tenantId: string;
      readonly requestId: string;
      readonly expectedVersion: number;
      readonly evaluatedBy: string;
      readonly result: WorkforceRequestValidationResult;
    },
    transaction: Transaction,
  ): Promise<WorkforceRequest | null>;
  submit(
    input: {
      readonly tenantId: string;
      readonly requestId: string;
      readonly expectedVersion: number;
      readonly submittedBy: string;
      readonly idempotencyKey: string;
      readonly definition: WorkforceRequestWorkflowDefinition;
      readonly decisionFingerprint: string;
      readonly correlationId?: string;
    },
    transaction: Transaction,
  ): Promise<SubmitWorkforceRequestResponse | null>;
  decide(
    input: {
      readonly tenantId: string;
      readonly command: Omit<DecideWorkforceRequestCommand, "context">;
      readonly decidedBy: string;
      readonly decisionFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<DecideWorkforceRequestResponse | null>;
  apply(
    input: {
      readonly tenantId: string;
      readonly command: Omit<ApplyWorkforceRequestCommand, "context">;
      readonly appliedBy: string;
      readonly applicationFingerprint: string;
      readonly correlationId?: string;
    },
    transaction: Transaction,
  ): Promise<ApplyWorkforceRequestResponse | null>;
}
export interface WorkforceRequestValidator<Transaction = unknown> {
  validate(
    input: {
      readonly context: ValidateWorkforceRequestCommand["context"];
      readonly request: WorkforceRequest;
    },
    transaction: Transaction,
  ): Promise<WorkforceRequestValidationResult>;
}
export interface WorkforceRequestWorkflowResolver<Transaction = unknown> {
  resolve(
    input: {
      readonly context: SubmitWorkforceRequestCommand["context"];
      readonly request: WorkforceRequest;
    },
    transaction: Transaction,
  ): Promise<WorkforceRequestWorkflowDefinition>;
}

export interface WorkforceRepository<Transaction = unknown> {
  list(
    input: Omit<WorkforceListQuery, "context"> & { readonly tenantId: string },
    transaction: Transaction,
  ): Promise<readonly WorkforceSummary[]>;
  get(
    tenantId: string,
    employeeId: string,
    transaction: Transaction,
  ): Promise<WorkforceDetail | null>;
  completeChecklistItem(
    input: Omit<CompleteWorkforceChecklistItemCommand, "context"> & {
      readonly tenantId: string;
      readonly completedBy: string;
    },
    transaction: Transaction,
  ): Promise<WorkforceDetail | null>;
  offboard(
    input: Omit<OffboardWorkforceCommand, "context"> & {
      readonly tenantId: string;
      readonly actorId: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly caseId: string;
    readonly replayed: boolean;
    readonly workforce: WorkforceDetail;
  } | null>;
  completeOffboardingResource(
    input: Omit<CompleteOffboardingResourceCommand, "context"> & {
      readonly tenantId: string;
      readonly completedBy: string;
    },
    transaction: Transaction,
  ): Promise<{ readonly caseId: string; readonly completed: boolean } | null>;
  requestIamProjection(
    input: Omit<RetryWorkforceIamCommand, "context"> & {
      readonly tenantId: string;
      readonly actorId: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly projectionId: string;
    readonly replayed: boolean;
  } | null>;
  readPersonEvidence(
    input: Omit<ReadPersonEvidenceQuery, "context"> & {
      readonly tenantId: string;
      readonly principalId: string;
      readonly requestId: string;
      readonly expiresAt: string;
    },
    transaction: Transaction,
  ): Promise<PersonEvidenceView | null>;
}

export interface WorkforceService {
  createRequest(command: CreateWorkforceRequestCommand): Promise<{
    readonly request: WorkforceRequest;
    readonly replayed: boolean;
  }>;
  getRequest(
    query: import("./workforce.js").WorkforceRequestQuery,
  ): Promise<WorkforceRequest>;
  listRequests(
    query: WorkforceRequestListQuery,
  ): Promise<readonly WorkforceRequest[]>;
  validateRequest(
    command: ValidateWorkforceRequestCommand,
  ): Promise<ValidateWorkforceRequestResponse>;
  submitRequest(
    command: SubmitWorkforceRequestCommand,
  ): Promise<SubmitWorkforceRequestResponse>;
  decideRequest(
    command: DecideWorkforceRequestCommand,
  ): Promise<DecideWorkforceRequestResponse>;
  applyRequest(
    command: ApplyWorkforceRequestCommand,
  ): Promise<ApplyWorkforceRequestResponse>;
  list(query: WorkforceListQuery): Promise<readonly WorkforceSummary[]>;
  get(query: WorkforceQuery): Promise<WorkforceDetail>;
  completeChecklistItem(
    command: CompleteWorkforceChecklistItemCommand,
  ): Promise<WorkforceDetail>;
  offboard(command: OffboardWorkforceCommand): Promise<{
    readonly caseId: string;
    readonly replayed: boolean;
    readonly workforce: WorkforceDetail;
  }>;
  completeOffboardingResource(
    command: CompleteOffboardingResourceCommand,
  ): Promise<{ readonly caseId: string; readonly completed: boolean }>;
  retryIam(
    command: RetryWorkforceIamCommand,
  ): Promise<{ readonly projectionId: string; readonly replayed: boolean }>;
  readPersonEvidence(
    query: ReadPersonEvidenceQuery,
  ): Promise<PersonEvidenceView>;
  ingest(command: WorkforceSourceAdapterCommand): Promise<
    readonly {
      readonly externalId: string;
      readonly requestId: string;
      readonly replayed: boolean;
    }[]
  >;
}

export interface WorkforceServiceDependencies<Transaction> {
  readonly repository: WorkforceRepository<Transaction>;
  readonly requestRepository: WorkforceRequestRepository<Transaction>;
  readonly requestValidator: WorkforceRequestValidator<Transaction>;
  readonly requestWorkflows: WorkforceRequestWorkflowResolver<Transaction>;
  readonly transactions: PlaneTransactionCoordinator<Transaction>;
}
