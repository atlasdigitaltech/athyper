import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const businessPartnerQualificationPermissions = Object.freeze({
  manage: "neon.supplier.qualification.admin",
  managePreference: "neon.supplier.preference.admin",
  read: "neon.relationship.business_partner.read",
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
  | "COMPANY_PROFILE_MISSING" | "COMPANY_PROFILE_INACTIVE" | "BANK_NOT_READY" | "PAYMENT_TERM_INVALID";

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
  createQualification(command: CreateBusinessPartnerQualificationCommand): Promise<{ readonly qualification: BusinessPartnerQualification; readonly replayed: boolean }>;
  decideQualification(command: DecideBusinessPartnerQualificationCommand): Promise<{ readonly qualification: BusinessPartnerQualification; readonly replayed: boolean }>;
  createPreference(command:CreateSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  decidePreference(command:DecideSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  revokePreference(command:RevokeSupplierPreferenceCommand):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}>;
  listPreferences(query:ListSupplierPreferencesQuery):Promise<readonly SupplierPreferenceDesignation[]>;
}
