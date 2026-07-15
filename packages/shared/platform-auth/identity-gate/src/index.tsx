export { LoginGatePage } from "./login-gate-page";
export { ContextSelectPage } from "./context-select-page";
export { LogoutPage } from "./logout-page";
export { MfaChallengePage } from "./mfa-challenge-page";
export type {
  LastContext,
  OrgMembership,
  PublicSession,
} from "./types";
export {
  buildLoginHref,
  buildSelectContinuation,
  sanitizeAuthFlowContinuation,
  sanitizeFinalDestination,
} from "./url";

// Phase A — auth failure handling
export {
  dispatchAuthFailure,
  dispatchAuthFailureFromResponse,
  type AuthFailureCode,
  type AuthFailureOutcome,
  type AuthFailureDispatcherDeps,
  type AuthFailureSeverity,
} from "./auth-failure-handler";
export { RequiredActionBanner, type RequiredActionBannerProps } from "./required-action-banner";
export { AuthFailurePage, type AuthFailurePageProps } from "./auth-failure-page";
export { AuthFailureBridge, type AuthFailureBridgeProps } from "./auth-failure-bridge";







