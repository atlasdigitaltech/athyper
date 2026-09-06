import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  ActivateSupplierCommand,
  BusinessPartnerQualification,
  CreateBusinessPartnerQualificationCommand,
  CreateCustomerCreditReviewCommand,
  CreateCustomerDesignationCommand,
  CreateSupplierPreferenceCommand,
  CustomerAccountDesignation,
  CustomerCreditReview,
  CustomerLifecycleCommand,
  CustomerLifecycleResult,
  DecideBusinessPartnerQualificationCommand,
  DecideCustomerCreditReviewCommand,
  DecideCustomerDesignationCommand,
  DecideSupplierPreferenceCommand,
  ListSupplierPreferencesQuery,
  PartnerEligibilityDecision,
  ResolvePartnerEligibilityQuery,
  RevokeSupplierPreferenceCommand,
  SupplierActivationEvidence,
  SupplierPreferenceDesignation,
} from "./business-partner-eligibility.js";

export interface BusinessPartnerEligibilityRepository<Transaction = unknown> {
  findQualificationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<BusinessPartnerQualification | null>;
  getQualification(
    tenantId: string,
    qualificationId: string,
    transaction: Transaction,
  ): Promise<BusinessPartnerQualification | null>;
  createQualification(
    input: Omit<CreateBusinessPartnerQualificationCommand, "context"> & {
      readonly tenantId: string;
      readonly createdBy: string;
    },
    transaction: Transaction,
  ): Promise<BusinessPartnerQualification>;
  decideQualification(
    input: Omit<DecideBusinessPartnerQualificationCommand, "context"> & {
      readonly tenantId: string;
      readonly decidedBy: string;
      readonly decisionFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly qualification: BusinessPartnerQualification;
    readonly replayed: boolean;
  } | null>;
  resolve(
    input: Omit<ResolvePartnerEligibilityQuery, "context"> & {
      readonly tenantId: string;
    },
    transaction: Transaction,
  ): Promise<Omit<PartnerEligibilityDecision, "decisionFingerprint"> | null>;
  findSupplierActivationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<SupplierActivationEvidence | null>;
  activateSupplier(
    input: Omit<
      ActivateSupplierCommand,
      "context" | "commodityCategoryId" | "requirePaymentReadiness"
    > & {
      readonly tenantId: string;
      readonly activatedBy: string;
      readonly readiness: PartnerEligibilityDecision;
      readonly commandFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<SupplierActivationEvidence | null>;
  expireQualifications(
    input: {
      readonly tenantId: string;
      readonly actorId: string;
      readonly businessDate: string;
      readonly limit: number;
    },
    transaction: Transaction,
  ): Promise<readonly BusinessPartnerQualification[]>;
  findPreferenceByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<SupplierPreferenceDesignation | null>;
  getPreference(
    tenantId: string,
    preferenceId: string,
    businessDate: string,
    transaction: Transaction,
  ): Promise<SupplierPreferenceDesignation | null>;
  createPreference(
    input: Omit<CreateSupplierPreferenceCommand, "context"> & {
      readonly tenantId: string;
      readonly createdBy: string;
    },
    transaction: Transaction,
  ): Promise<SupplierPreferenceDesignation>;
  decidePreference(
    input: Omit<DecideSupplierPreferenceCommand, "context"> & {
      readonly tenantId: string;
      readonly decidedBy: string;
      readonly decisionFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly preference: SupplierPreferenceDesignation;
    readonly replayed: boolean;
  } | null>;
  revokePreference(
    input: Omit<RevokeSupplierPreferenceCommand, "context"> & {
      readonly tenantId: string;
      readonly revokedBy: string;
      readonly revocationFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly preference: SupplierPreferenceDesignation;
    readonly replayed: boolean;
  } | null>;
  listPreferences(
    input: Omit<ListSupplierPreferencesQuery, "context"> & {
      readonly tenantId: string;
    },
    transaction: Transaction,
  ): Promise<readonly SupplierPreferenceDesignation[]>;
  findCustomerCreditReviewByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<CustomerCreditReview | null>;
  getCustomerCreditReview(
    tenantId: string,
    reviewId: string,
    transaction: Transaction,
  ): Promise<CustomerCreditReview | null>;
  createCustomerCreditReview(
    input: Omit<CreateCustomerCreditReviewCommand, "context"> & {
      readonly tenantId: string;
      readonly createdBy: string;
    },
    transaction: Transaction,
  ): Promise<CustomerCreditReview>;
  decideCustomerCreditReview(
    input: Omit<DecideCustomerCreditReviewCommand, "context"> & {
      readonly tenantId: string;
      readonly decidedBy: string;
      readonly decisionFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly review: CustomerCreditReview;
    readonly replayed: boolean;
  } | null>;
  listCustomerCreditReviews(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly operatingOrganizationId: string;
      readonly companyCodeId: string;
    },
    transaction: Transaction,
  ): Promise<readonly CustomerCreditReview[]>;
  findCustomerDesignationByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<CustomerAccountDesignation | null>;
  getCustomerDesignation(
    tenantId: string,
    designationId: string,
    transaction: Transaction,
  ): Promise<CustomerAccountDesignation | null>;
  createCustomerDesignation(
    input: Omit<CreateCustomerDesignationCommand, "context"> & {
      readonly tenantId: string;
      readonly createdBy: string;
    },
    transaction: Transaction,
  ): Promise<CustomerAccountDesignation>;
  decideCustomerDesignation(
    input: Omit<DecideCustomerDesignationCommand, "context"> & {
      readonly tenantId: string;
      readonly decidedBy: string;
      readonly decisionFingerprint: string;
    },
    transaction: Transaction,
  ): Promise<{
    readonly designation: CustomerAccountDesignation;
    readonly replayed: boolean;
  } | null>;
  listCustomerDesignations(
    input: {
      readonly tenantId: string;
      readonly businessPartnerId: string;
      readonly operatingOrganizationId: string;
      readonly companyCodeId?: string;
    },
    transaction: Transaction,
  ): Promise<readonly CustomerAccountDesignation[]>;
  transitionCustomer(
    input: Omit<CustomerLifecycleCommand, "context"> & {
      readonly tenantId: string;
      readonly actorId: string;
      readonly readiness?: PartnerEligibilityDecision;
    },
    transaction: Transaction,
  ): Promise<CustomerLifecycleResult | null>;
}
export type BusinessPartnerEligibilityTransactionCoordinator<Transaction> =
  PlaneTransactionCoordinator<Transaction>;
