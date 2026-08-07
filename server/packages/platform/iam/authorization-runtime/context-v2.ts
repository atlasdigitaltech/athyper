import type {
  CanonicalPlane,
  ResourceCoordinates,
  ScopeDimension,
} from "../authorization-evaluator/index.js";
import type {
  AuthorizationSessionV2,
} from "./session-v2.js";
import type { CanonicalConsumerSubject } from "./consumer-enforcement.js";

export const AUTHORIZATION_CONTEXT_CONTRACT_VERSION =
  "wave5.authorization-context.v2" as const;

export interface AuthorizationRequestContextV2 {
  readonly contractVersion: typeof AUTHORIZATION_CONTEXT_CONTRACT_VERSION;
  readonly plane: CanonicalPlane;
  readonly tenantOrAccountId: string;
  readonly principalId: string;
  readonly identityBindingId: string;
  readonly catalogVersion: string;
  readonly authorizationFingerprint: string;
  readonly mfaSatisfied: boolean;
  readonly sodSatisfied: boolean;
  readonly selectedDimensions: Readonly<
    Partial<Record<ScopeDimension, string>>
  >;
  readonly establishedAt: string;
  readonly expiresAt: string;
}

/**
 * Creates the only context accepted by Wave 5 route adapters. The selected
 * organizational dimensions are navigation context, never authority; every
 * request is still evaluated against canonical proofs.
 */
export function createAuthorizationRequestContextV2(input: {
  readonly session: AuthorizationSessionV2;
  readonly expectedCatalogVersion: string;
  readonly mfaSatisfied: boolean;
  readonly sodSatisfied: boolean;
  readonly selectedDimensions?: Readonly<
    Partial<Record<ScopeDimension, string>>
  >;
  readonly now?: Date;
}): AuthorizationRequestContextV2 {
  const now = input.now ?? new Date();
  if (input.session.catalogVersion !== input.expectedCatalogVersion) {
    throw new Error("session/UI and server catalog versions diverged");
  }
  if (new Date(input.session.expiresAt) <= now) {
    throw new Error("authorization session is expired");
  }
  const selectedDimensions = cleanDimensions(
    input.selectedDimensions ?? {},
  );
  return Object.freeze({
    contractVersion: AUTHORIZATION_CONTEXT_CONTRACT_VERSION,
    plane: input.session.plane,
    tenantOrAccountId: input.session.tenantOrAccountId,
    principalId: input.session.principalId,
    identityBindingId: input.session.identityBindingId,
    catalogVersion: input.session.catalogVersion,
    authorizationFingerprint: input.session.authorizationFingerprint,
    mfaSatisfied: input.mfaSatisfied,
    sodSatisfied: input.sodSatisfied,
    selectedDimensions,
    establishedAt: now.toISOString(),
    expiresAt: input.session.expiresAt,
  });
}

export function contextSubject(
  context: AuthorizationRequestContextV2,
): CanonicalConsumerSubject {
  return {
    plane: context.plane,
    tenantOrAccountId: context.tenantOrAccountId,
    principalId: context.principalId,
    mfaSatisfied: context.mfaSatisfied,
    sodSatisfied: context.sodSatisfied,
  };
}

export function contextResource(
  context: AuthorizationRequestContextV2,
  input: {
    readonly entityId: string;
    readonly recordId: string;
    readonly dimensions?: ResourceCoordinates["dimensions"];
  },
): ResourceCoordinates {
  if (!input.entityId.trim() || !input.recordId.trim()) {
    throw new Error("exact entity and record IDs are required");
  }
  return {
    tenantOrAccountId: context.tenantOrAccountId,
    entityId: input.entityId,
    recordId: input.recordId,
    dimensions: {
      ...context.selectedDimensions,
      ...cleanDimensions(input.dimensions ?? {}),
    },
  };
}

function cleanDimensions(
  dimensions: Readonly<Partial<Record<ScopeDimension, string>>>,
): Readonly<Partial<Record<ScopeDimension, string>>> {
  const cleaned: Partial<Record<ScopeDimension, string>> = {};
  for (const [key, raw] of Object.entries(dimensions) as Array<
    [ScopeDimension, string | undefined]
  >) {
    const value = raw?.trim();
    if (!value) {
      throw new Error(`empty authorization context dimension: ${key}`);
    }
    cleaned[key] = value;
  }
  return Object.freeze(cleaned);
}
