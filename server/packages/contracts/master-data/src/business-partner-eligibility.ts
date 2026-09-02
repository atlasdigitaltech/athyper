import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const businessPartnerQualificationPermissions = Object.freeze({
  manage: "neon.supplier.qualification.admin",
  managePreference: "neon.supplier.preference.admin",
  activateSupplier: "neon.relationship.business_partner.activate",
  read: "neon.relationship.business_partner.read",
} as const);
export const customerOnboardingPermissions = Object.freeze({
  creditCreate:"neon.customer.credit.create",creditDecide:"neon.customer.credit.decide",creditRead:"neon.customer.credit.read",
  activate:"neon.customer.lifecycle.activate",suspend:"neon.customer.lifecycle.suspend",reactivate:"neon.customer.lifecycle.reactivate",
} as const);

export type PartnerEligibilityRole = "supplier" | "customer";
export type PartnerQualificationDecision = "pending" | "approved" | "conditional" | "rejected" | "suspended" | "expired";
export type SupplierPreferenceStatus = "pending" | "approved" | "rejected" | "revoked";
export type SupplierPreferenceTemporalStatus = "pending" | "scheduled" | "active" | "expired" | "rejected" | "revoked";
export type PartnerEligibilityReasonCode =
  | "PARTNER_INACTIVE" | "ROLE_MISSING" | "ROLE_INACTIVE"
  | "ORG_ASSIGNMENT_MISSING" | "ORG_COMPANY_INCOMPATIBLE"
  | "QUALIFICATION_PENDING" | "QUALIFICATION_REJECTED" | "QUALIFICATION_SUSPENDED" | "QUALIFICATION_EXPIRED"
  | "BLOCKED_FOR_OPERATION" | "RISK_ASSESSMENT_MISSING" | "RISK_ASSESSMENT_EXPIRED" | "RISK_CRITICAL"
  | "COMPANY_PROFILE_MISSING" | "COMPANY_PROFILE_INACTIVE" | "BANK_NOT_READY" | "PAYMENT_TERM_INVALID"
  | "CREDIT_REVIEW_MISSING" | "CREDIT_REVIEW_PENDING" | "CREDIT_REVIEW_REJECTED" | "CREDIT_REVIEW_SUSPENDED" | "CREDIT_REVIEW_EXPIRED";

export type CustomerCreditDecision="pending"|"approved"|"conditional"|"rejected"|"suspended"|"expired";
export interface CustomerCreditReview {readonly id:string;readonly tenantId:string;readonly businessPartnerId:string;readonly customerId:string;readonly operatingOrganizationId:string;readonly companyCodeId:string;readonly reviewTypeCode:string;readonly requestedCreditLimit?:number;readonly requestedCurrencyCode?:string;readonly approvedCreditLimit?:number;readonly approvedCurrencyCode?:string;readonly riskClassCode?:string;readonly decision:CustomerCreditDecision;readonly decisionReason?:string;readonly conditions:readonly Readonly<Record<string,unknown>>[];readonly effectiveFrom:string;readonly effectiveUntil?:string;readonly reviewedAt?:string;readonly reviewedBy?:string;readonly approvedAt?:string;readonly approvedBy?:string;readonly rowVersion:number;readonly createdAt:string;readonly createdBy:string;readonly updatedAt?:string;readonly updatedBy?:string;}
export interface CreateCustomerCreditReviewCommand {readonly context:VerifiedRequestContext;readonly idempotencyKey:string;readonly businessPartnerId:string;readonly customerId:string;readonly operatingOrganizationId:string;readonly companyCodeId:string;readonly reviewTypeCode:string;readonly requestedCreditLimit?:number;readonly requestedCurrencyCode?:string;readonly riskClassCode?:string;readonly effectiveFrom?:string;readonly effectiveUntil?:string;}
export interface DecideCustomerCreditReviewCommand {readonly context:VerifiedRequestContext;readonly reviewId:string;readonly expectedVersion:number;readonly decision:Exclude<CustomerCreditDecision,"pending"|"expired">;readonly reason:string;readonly approvedCreditLimit?:number;readonly approvedCurrencyCode?:string;readonly conditions?:readonly Readonly<Record<string,unknown>>[];readonly idempotencyKey:string;}
export interface CustomerLifecycleCommand {readonly context:VerifiedRequestContext;readonly businessPartnerId:string;readonly customerId:string;readonly operatingOrganizationId:string;readonly companyCodeId:string;readonly action:"activate"|"suspend"|"reactivate";readonly reasonCode:string;readonly idempotencyKey:string;readonly businessDate:string;}
export interface CustomerLifecycleResult {readonly customerId:string;readonly status:"prospect"|"active"|"suspended";readonly eventId:string;readonly replayed:boolean;readonly readiness?:PartnerEligibilityDecision;}

export interface BusinessPartnerQualification {
  readonly id: string; readonly tenantId: string; readonly businessPartnerId: string;
  readonly partnerRole: PartnerEligibilityRole; readonly operatingOrganizationId?: string; readonly companyCodeId?: string;
  readonly commodityCapabilityId?: string; readonly qualificationTypeCode: string;
  readonly decision: PartnerQualificationDecision; readonly decisionReason?: string; readonly riskAssessmentId?: string;
  readonly effectiveFrom?: string; readonly effectiveUntil?: string; readonly nextReviewAt?: string;
  readonly reviewedAt?: string; readonly reviewedBy?: string; readonly approvedAt?: string; readonly approvedBy?: string;
  readonly rowVersion: number; readonly createdAt: string; readonly createdBy: string; readonly updatedAt?: string; readonly updatedBy?: string;
}

export interface PartnerEligibilityReason {
  readonly code: PartnerEligibilityReasonCode;
  readonly severity: "blocking" | "warning";
  readonly recordId?: string;
  readonly detail?: string;
}

export interface PartnerEligibilityDecision {
  readonly businessPartnerId: string; readonly role: PartnerEligibilityRole;
  readonly operatingOrganizationId: string; readonly companyCodeId?: string;
  readonly operationCode: string; readonly businessDate: string; readonly eligible: boolean;
  readonly reasons: readonly PartnerEligibilityReason[];
  readonly qualifications: readonly BusinessPartnerQualification[];
  readonly riskAssessment?: Readonly<{ id: string; status: string; riskBand: string; overallScore?: number; nextReviewAt?: string; version: number }>;
  readonly activeBlockIds: readonly string[];
  readonly preferredSupplier: boolean;
  readonly effectivePreferenceIds: readonly string[];
  readonly decisionFingerprint: string;
}

export interface SupplierActivationEvidence {
  readonly id:string; readonly tenantId:string; readonly businessPartnerId:string; readonly supplierId:string;
  readonly operatingOrganizationId:string; readonly companyCodeId?:string; readonly businessDate:string;
  readonly priorStatus:string; readonly resultingStatus:"active"; readonly readinessFingerprint:string;
  readonly readiness:PartnerEligibilityDecision; readonly idempotencyKey:string; readonly commandFingerprint:string;
  readonly activatedAt:string; readonly activatedBy:string;
}

export interface ActivateSupplierCommand {
  readonly context:VerifiedRequestContext; readonly businessPartnerId:string; readonly operatingOrganizationId:string;
  readonly companyCodeId?:string; readonly commodityCategoryId?:string; readonly businessDate:string;
  readonly requirePaymentReadiness?:boolean; readonly idempotencyKey:string;
}

export interface SupplierActivationReevaluationScope {
  readonly businessPartnerId:string; readonly operatingOrganizationId:string; readonly companyCodeId?:string;
  readonly commodityCategoryId?:string; readonly requirePaymentReadiness?:boolean;
}

export interface SupplierPreferenceDesignation {
  readonly id:string; readonly tenantId:string; readonly businessPartnerId:string; readonly supplierId:string;
  readonly operatingOrganizationId:string; readonly companyCodeId?:string; readonly commodityCategoryId?:string;
  readonly effectiveFrom:string; readonly effectiveUntil?:string; readonly rationale:string;
  readonly status:SupplierPreferenceStatus; readonly temporalStatus:SupplierPreferenceTemporalStatus;
  readonly decisionReason?:string; readonly reviewedAt?:string; readonly reviewedBy?:string; readonly approvedAt?:string; readonly approvedBy?:string;
  readonly revocationReason?:string; readonly revokedAt?:string; readonly revokedBy?:string;
  readonly rowVersion:number; readonly createdAt:string; readonly createdBy:string; readonly updatedAt?:string; readonly updatedBy?:string;
}

export interface ResolvePartnerEligibilityQuery {
  readonly context: VerifiedRequestContext; readonly businessPartnerId: string;
  readonly role: PartnerEligibilityRole; readonly operatingOrganizationId: string;
  readonly companyCodeId?: string; readonly commodityCategoryId?: string;
  readonly operationCode: string; readonly businessDate: string;
}

export interface CreateBusinessPartnerQualificationCommand {
  readonly context: VerifiedRequestContext; readonly idempotencyKey: string;
  readonly businessPartnerId: string; readonly partnerRole: PartnerEligibilityRole;
  readonly operatingOrganizationId: string; readonly companyCodeId?: string;
  readonly commodityCapabilityId?: string; readonly qualificationTypeCode: string;
  readonly riskAssessmentId?: string; readonly effectiveFrom?: string; readonly effectiveUntil?: string; readonly nextReviewAt?: string;
}

export interface DecideBusinessPartnerQualificationCommand {
  readonly context: VerifiedRequestContext; readonly qualificationId: string;
  readonly expectedVersion: number; readonly decision: Exclude<PartnerQualificationDecision, "pending">;
  readonly reason: string; readonly idempotencyKey: string;
}

export interface CreateSupplierPreferenceCommand {readonly context:VerifiedRequestContext;readonly idempotencyKey:string;readonly businessPartnerId:string;readonly supplierId:string;readonly operatingOrganizationId:string;readonly companyCodeId?:string;readonly commodityCategoryId?:string;readonly effectiveFrom:string;readonly effectiveUntil?:string;readonly rationale:string;}
export interface DecideSupplierPreferenceCommand {readonly context:VerifiedRequestContext;readonly preferenceId:string;readonly expectedVersion:number;readonly decision:"approved"|"rejected";readonly reason:string;readonly idempotencyKey:string;}
export interface RevokeSupplierPreferenceCommand {readonly context:VerifiedRequestContext;readonly preferenceId:string;readonly expectedVersion:number;readonly reason:string;readonly idempotencyKey:string;}
export interface ListSupplierPreferencesQuery {readonly context:VerifiedRequestContext;readonly businessPartnerId:string;readonly operatingOrganizationId:string;readonly companyCodeId?:string;readonly commodityCategoryId?:string;readonly businessDate:string;}

export interface BusinessPartnerEligibilityService {
  resolve(query: ResolvePartnerEligibilityQuery): Promise<PartnerEligibilityDecision>;
  activateSupplier(command:ActivateSupplierCommand):Promise<{readonly activation:SupplierActivationEvidence;readonly replayed:boolean}>;
  createQualification(command: CreateBusinessPartnerQualificationCommand): Promise<{ readonly qualification: BusinessPartnerQualification; readonly replayed: boolean }>;
  decideQualification(command: DecideBusinessPartnerQualificationCommand): Promise<{ readonly qualification: BusinessPartnerQualification; readonly replayed: boolean }>;
  createPreference(command:CreateSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  decidePreference(command:DecideSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  revokePreference(command:RevokeSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  listPreferences(query:ListSupplierPreferencesQuery):Promise<readonly SupplierPreferenceDesignation[]>;
  expireQualifications(input:{readonly tenantId:string;readonly actorId:string;readonly businessDate:string;readonly limit?:number}):Promise<readonly BusinessPartnerQualification[]>;
  reevaluateSupplierActivations(input:{readonly tenantId:string;readonly actorId:string;readonly businessDate:string;readonly scopes:readonly SupplierActivationReevaluationScope[]}):Promise<readonly PartnerEligibilityDecision[]>;
  createCustomerCreditReview(command:CreateCustomerCreditReviewCommand):Promise<{readonly review:CustomerCreditReview;readonly replayed:boolean}>;
  decideCustomerCreditReview(command:DecideCustomerCreditReviewCommand):Promise<{readonly review:CustomerCreditReview;readonly replayed:boolean}>;
  listCustomerCreditReviews(query:{readonly context:VerifiedRequestContext;readonly businessPartnerId:string;readonly operatingOrganizationId:string;readonly companyCodeId:string}):Promise<readonly CustomerCreditReview[]>;
  transitionCustomer(command:CustomerLifecycleCommand):Promise<CustomerLifecycleResult>;
}
