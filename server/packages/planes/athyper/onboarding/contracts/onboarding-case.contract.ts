export interface OnboardingCaseView {
  id: string;
  tenantId: string;
  caseCode: string;
  targetProductCode: string;
  status: string;
  decisionStatus: string;
  sourceOnboardingMode: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingPrincipalContext {
  tenantId: string;
  principalId: string;
}

export const ONBOARDING_CASE_STATUSES = new Set([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "provisioning",
  "active",
  "rejected",
  "cancelled",
  "failed",
]);
