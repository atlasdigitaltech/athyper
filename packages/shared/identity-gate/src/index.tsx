export { LoginGatePage } from "./LoginGatePage";
export { ContextSelectPage } from "./ContextSelectPage";
export { LogoutPage } from "./LogoutPage";
export { MfaChallengePage } from "./MfaChallengePage";
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
export { RequiredActionBanner, type RequiredActionBannerProps } from "./RequiredActionBanner";
export { AuthFailurePage, type AuthFailurePageProps } from "./AuthFailurePage";
export { AuthFailureBridge, type AuthFailureBridgeProps } from "./AuthFailureBridge";
