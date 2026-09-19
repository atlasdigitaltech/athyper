import type {
  AuthorizationDecision,
  AuthorizationRequest,
  EffectivePermissionSnapshot,
} from "./authorization.js";
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
  /** Server-selected enforcement profile hash. Metadata alone never activates a policy. */
  enforcedEntityProfile?(
    planeKey: PlaneKey,
    entityCode: string,
  ): string | undefined;
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
  /** Constraint result is never a grant. Only a separately published canonical
   * admission contract may combine it with an explicit target authorization. */
  checkSourceConstraints?(
    request: AuthorizationRequest,
  ): Promise<
    | { readonly state: "satisfied" }
    | { readonly state: "denied" | "unavailable"; readonly reason: string }
  >;
}

export interface AuthenticationRequest {
  readonly token: string;
  readonly planeKey: PlaneKey;
  readonly requestId: string;
  readonly correlationId?: string;
  readonly route?: { readonly path: string; readonly method: string };
  /** Untrusted selectors may only narrow matching issuer claims; they never establish identity. */
  readonly requestedContext?: {
    readonly tenantId?: string;
    readonly realmKey?: string;
    readonly organizationId?: string;
    readonly authEpoch?: number;
  };
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
