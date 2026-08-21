import type { AuthorizationDecision, AuthorizationRequest, EffectivePermissionSnapshot } from "./authorization.js";
import type { JwtClaims, VerifiedIdentity, VerifiedToken } from "./identity.js";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { VerifiedRequestContext } from "./authorization.js";

export interface TokenVerifier {
  verify(token: string, realmKey?: string): Promise<VerifiedToken>;
}

export interface IdentityResolver {
  resolve(claims: JwtClaims, realmKey: string): Promise<VerifiedIdentity>;
}

export interface PermissionResolver {
  resolve(identity: VerifiedIdentity): Promise<EffectivePermissionSnapshot>;
}

export interface Authorizer {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

export interface AuthenticationRequest {
  readonly token: string;
  readonly planeKey: PlaneKey;
  readonly requestId: string;
  readonly correlationId?: string;
  readonly route?: { readonly path: string; readonly method: string };
  /** Untrusted selectors may only narrow matching issuer claims; they never establish identity. */
  readonly requestedContext?: { readonly tenantId?: string; readonly realmKey?: string; readonly organizationId?: string; readonly authEpoch?: number };
}

export type AuthenticationFailureCode =
  | "AUTH_TOKEN_INVALID"
  | "AUTH_CLAIM_INVALID"
  | "AUTH_CONTEXT_MISMATCH"
  | "AUTH_ACCESS_DENIED"
  | "AUTH_REQUIRED_ACTION_PENDING"
  | "AUTH_AUTHORIZATION_UNAVAILABLE"
  | "AUTH_AUDIT_UNAVAILABLE";

export type AuthenticationResult =
  | { readonly ok: true; readonly context: VerifiedRequestContext }
  | {
      readonly ok: false;
      readonly status: 401 | 403 | 503;
      readonly code: AuthenticationFailureCode;
      readonly message: string;
    };

export interface Authenticator {
  authenticate(request: AuthenticationRequest): Promise<AuthenticationResult>;
}
