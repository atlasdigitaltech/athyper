export type OnboardingPlane = "studio" | "neon" | "mesh" | "trustiam";
export type OnboardingCaseStatus = "draft" | "submitted" | "qualifying" | "awaiting_approval" | "approved" | "provisioning" | "reconciling" | "active" | "rejected" | "cancelled" | "failed" | "offboarding" | "offboarded";
export type OnboardingResourceStatus = "planned" | "applying" | "applied" | "drifted" | "failed" | "retained" | "revoked";

export interface OnboardingCase { readonly id:string;readonly tenantId:string;readonly caseCode:string;readonly canonicalPartyId:string;readonly status:OnboardingCaseStatus;readonly desiredVersion:number;readonly desiredHash:string;readonly targets:readonly OnboardingTargetDesiredState[]; }
export interface OnboardingTargetDesiredState { readonly targetId:string;readonly plane:OnboardingPlane;readonly targetTenantId:string;readonly criticality:"activation_critical"|"independent";readonly resources:readonly DesiredOnboardingResource[]; }
/** These gates are deliberately independent; no value implies another. */
export interface AccessGateDesiredState {
  readonly subscriptionEntitlement?:Readonly<{planId:string;capabilityCodes:readonly string[]}>;
  readonly iamMembership?:Readonly<{externalOrganizationId:string;principalIds:readonly string[]}>;
  readonly planeProjection?:Readonly<{projectionId:string;scopeTargetIds:readonly string[]}>;
  readonly authorizationGrants?:Readonly<{principalId:string;roleCodes:readonly string[];scopeTargetIds:readonly string[]}>;
}
export interface DesiredOnboardingResource { readonly resourceKey:string;readonly resourceKind:string;readonly desiredState:Readonly<Record<string,unknown>>;readonly accessGates?:AccessGateDesiredState;readonly retention:"deletable"|"retain_business_data"|"retain_legal_and_audit"; }
export interface OnboardingResourceObservation { readonly targetId:string;readonly resourceKey:string;readonly resourceId?:string;readonly appliedVersion?:number;readonly appliedHash?:string;readonly status:OnboardingResourceStatus;readonly observedAt:string;readonly evidenceId?:string;readonly failureCode?:string; }
export type OnboardingCommandOperation = "apply" | "revoke" | "retain";
export interface OnboardingCommandIntent { readonly commandCode:string;readonly operation:OnboardingCommandOperation;readonly targetId:string;readonly resourceKey:string;readonly targetPlane:OnboardingPlane;readonly targetTenantId:string;readonly desiredVersion:number;readonly desiredHash:string;readonly body:Readonly<Record<string,unknown>>; }
export interface OnboardingReconciliationResult { readonly caseId:string;readonly desiredVersion:number;readonly converged:boolean;readonly commands:readonly OnboardingCommandIntent[];readonly driftedResourceKeys:readonly string[]; }
export interface GuestAccessTokenRecord { readonly caseId:string;readonly tokenHash:string;readonly hashAlgorithm:"sha256";readonly scopes:readonly ("case:read"|"case:update"|"evidence:upload")[];readonly expiresAt:string;readonly revokedAt?:string; }
export const ONBOARDING_EVENT_CODES = ["onboarding.case.state_changed","onboarding.resource.desired","provisioning.resource.applied","provisioning.resource.retained","provisioning.resource.revoked","provisioning.resource.failed","reconciliation.drift_detected","reconciliation.resource_converged"] as const;
export type OnboardingEventCode = typeof ONBOARDING_EVENT_CODES[number];
