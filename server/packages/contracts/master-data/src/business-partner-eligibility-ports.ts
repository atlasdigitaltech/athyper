import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { BusinessPartnerQualification, CreateBusinessPartnerQualificationCommand, CreateSupplierPreferenceCommand, DecideBusinessPartnerQualificationCommand, DecideSupplierPreferenceCommand, ListSupplierPreferencesQuery, PartnerEligibilityDecision, ResolvePartnerEligibilityQuery, RevokeSupplierPreferenceCommand, SupplierPreferenceDesignation } from "./business-partner-eligibility.js";

export interface BusinessPartnerEligibilityRepository<Transaction=unknown> {
  findQualificationByIdempotencyKey(tenantId:string,idempotencyKey:string,transaction:Transaction):Promise<BusinessPartnerQualification|null>;
  getQualification(tenantId:string,qualificationId:string,transaction:Transaction):Promise<BusinessPartnerQualification|null>;
  createQualification(input:Omit<CreateBusinessPartnerQualificationCommand,"context">&{readonly tenantId:string;readonly createdBy:string},transaction:Transaction):Promise<BusinessPartnerQualification>;
  decideQualification(input:Omit<DecideBusinessPartnerQualificationCommand,"context">&{readonly tenantId:string;readonly decidedBy:string;readonly decisionFingerprint:string},transaction:Transaction):Promise<{readonly qualification:BusinessPartnerQualification;readonly replayed:boolean}|null>;
  resolve(input:Omit<ResolvePartnerEligibilityQuery,"context">&{readonly tenantId:string},transaction:Transaction):Promise<Omit<PartnerEligibilityDecision,"decisionFingerprint">|null>;
  findPreferenceByIdempotencyKey(tenantId:string,idempotencyKey:string,transaction:Transaction):Promise<SupplierPreferenceDesignation|null>;
  getPreference(tenantId:string,preferenceId:string,businessDate:string,transaction:Transaction):Promise<SupplierPreferenceDesignation|null>;
  createPreference(input:Omit<CreateSupplierPreferenceCommand,"context">&{readonly tenantId:string;readonly createdBy:string},transaction:Transaction):Promise<SupplierPreferenceDesignation>;
  decidePreference(input:Omit<DecideSupplierPreferenceCommand,"context">&{readonly tenantId:string;readonly decidedBy:string;readonly decisionFingerprint:string},transaction:Transaction):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}|null>;
  revokePreference(input:Omit<RevokeSupplierPreferenceCommand,"context">&{readonly tenantId:string;readonly revokedBy:string;readonly revocationFingerprint:string},transaction:Transaction):Promise<{readonly preference:SupplierPreferenceDesignation;readonly replayed:boolean}|null>;
  listPreferences(input:Omit<ListSupplierPreferencesQuery,"context">&{readonly tenantId:string},transaction:Transaction):Promise<readonly SupplierPreferenceDesignation[]>;
}
export type BusinessPartnerEligibilityTransactionCoordinator<Transaction> = PlaneTransactionCoordinator<Transaction>;
