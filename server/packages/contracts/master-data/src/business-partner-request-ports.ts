import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  BusinessPartnerRequest,
  BusinessPartnerRequestListQuery,
  BusinessPartnerRequestQuery,
  BusinessPartnerRequestSchemaReference,
  BusinessPartnerRequestWorkflow,
  BusinessPartnerRequestWorkflowDefinition,
  BusinessPartnerRequestView,
  BusinessPartnerAggregate,
  BusinessPartnerAggregateQuery,
  BusinessPartnerRequestValidationResult,
  ApplyBusinessPartnerRequestCommand,
  ApplyBusinessPartnerRequestResponse,
  CreateBusinessPartnerRequestCommand,
  DecideBusinessPartnerRequestCommand,
  DecideBusinessPartnerRequestResponse,
  PatchBusinessPartnerRequestCommand,
  SubmitBusinessPartnerRequestCommand,
  SubmitBusinessPartnerRequestResponse,
  ValidateBusinessPartnerRequestCommand,
  ValidateBusinessPartnerRequestResponse,
} from "./business-partner-requests.js";

export interface BusinessPartnerRequestRepository<Transaction = unknown> {
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  create(input: {
    readonly tenantId: string;
    readonly requestNo: string;
    readonly command: Omit<CreateBusinessPartnerRequestCommand, "context">;
    readonly schema: BusinessPartnerRequestSchemaReference;
    readonly createdBy: string;
  }, transaction: Transaction): Promise<BusinessPartnerRequest>;
  get(tenantId: string, requestId: string, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  getView(tenantId: string, requestId: string, transaction: Transaction): Promise<BusinessPartnerRequestView | null>;
  list(query: Omit<BusinessPartnerRequestListQuery, "context"> & { readonly tenantId: string }, transaction: Transaction): Promise<readonly BusinessPartnerRequest[]>;
  getAggregate(tenantId: string, businessPartnerId: string, operatingOrganizationId: string, transaction: Transaction): Promise<BusinessPartnerAggregate | null>;
  patch(input: Omit<PatchBusinessPartnerRequestCommand, "context"> & { readonly tenantId: string; readonly updatedBy: string }, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  recordValidation(input: {
    readonly tenantId: string;
    readonly requestId: string;
    readonly expectedVersion: number;
    readonly evaluatedBy: string;
    readonly result: BusinessPartnerRequestValidationResult;
  }, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  submit(input: {
    readonly tenantId: string;
    readonly requestId: string;
    readonly expectedVersion: number;
    readonly submittedBy: string;
    readonly idempotencyKey: string;
    readonly definition: BusinessPartnerRequestWorkflowDefinition;
    readonly decisionFingerprint: string;
    readonly correlationId?: string;
  }, transaction: Transaction): Promise<SubmitBusinessPartnerRequestResponse | null>;
  decide(input: {
    readonly tenantId: string;
    readonly command: Omit<DecideBusinessPartnerRequestCommand, "context">;
    readonly decidedBy: string;
    readonly decisionFingerprint: string;
  }, transaction: Transaction): Promise<DecideBusinessPartnerRequestResponse | null>;
  apply(input: {
    readonly tenantId: string;
    readonly command: Omit<ApplyBusinessPartnerRequestCommand, "context">;
    readonly appliedBy: string;
    readonly applicationFingerprint: string;
    readonly correlationId?: string;
  }, transaction: Transaction): Promise<ApplyBusinessPartnerRequestResponse | null>;
}

export interface BusinessPartnerRequestSchemaResolver {
  resolve(input: { readonly context: CreateBusinessPartnerRequestCommand["context"]; readonly kind: CreateBusinessPartnerRequestCommand["kind"]; readonly sourceKind: CreateBusinessPartnerRequestCommand["source"]["kind"]; readonly requestedRole?: CreateBusinessPartnerRequestCommand["requestedRole"] }): Promise<BusinessPartnerRequestSchemaReference>;
}

export interface BusinessPartnerRequestValidator<Transaction = unknown> {
  validate(input: { readonly context: ValidateBusinessPartnerRequestCommand["context"]; readonly request: BusinessPartnerRequest }, transaction: Transaction): Promise<BusinessPartnerRequestValidationResult>;
}

export interface BusinessPartnerRequestWorkflowResolver<Transaction = unknown> {
  resolve(input: { readonly context: SubmitBusinessPartnerRequestCommand["context"]; readonly request: BusinessPartnerRequest }, transaction: Transaction): Promise<BusinessPartnerRequestWorkflowDefinition>;
}

export interface BusinessPartnerRequestNumberAllocator<Transaction = unknown> {
  next(tenantId: string, transaction: Transaction): Promise<string>;
}

export interface BusinessPartnerRequestService {
  create(command: CreateBusinessPartnerRequestCommand): Promise<{ readonly request: BusinessPartnerRequest; readonly replayed: boolean }>;
  get(query: BusinessPartnerRequestQuery): Promise<BusinessPartnerRequest>;
  getView(query: BusinessPartnerRequestQuery): Promise<BusinessPartnerRequestView>;
  list(query: BusinessPartnerRequestListQuery): Promise<readonly BusinessPartnerRequest[]>;
  getAggregate(query: BusinessPartnerAggregateQuery): Promise<BusinessPartnerAggregate>;
  patch(command: PatchBusinessPartnerRequestCommand): Promise<BusinessPartnerRequest>;
  validate(command: ValidateBusinessPartnerRequestCommand): Promise<ValidateBusinessPartnerRequestResponse>;
  submit(command: SubmitBusinessPartnerRequestCommand): Promise<SubmitBusinessPartnerRequestResponse>;
  decide(command: DecideBusinessPartnerRequestCommand): Promise<DecideBusinessPartnerRequestResponse>;
  apply(command: ApplyBusinessPartnerRequestCommand): Promise<ApplyBusinessPartnerRequestResponse>;
}

export type BusinessPartnerRequestTransactionCoordinator<Transaction> = PlaneTransactionCoordinator<Transaction>;
