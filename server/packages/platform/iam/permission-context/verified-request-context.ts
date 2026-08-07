import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

import type { EffectivePermissionContext } from "./types.js";
import type { PlaneKey } from "./plane-key.js";

const VERIFIED_REQUEST_CONTEXT_LOCAL = "verifiedRequestContext";

/**
 * Canonical, transport-independent identity and authorization context for an
 * authenticated request. Mutation commands accept this object instead of JWT
 * claims or caller-controlled tenant/principal headers.
 */
export interface VerifiedRequestContext {
  readonly planeKey: PlaneKey;
  readonly realmKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly permissions: EffectivePermissionContext;
  /** Principal security epoch captured by the authenticated identity lookup. */
  readonly authEpoch: number;
  /** Stable authorization-profile hash copied from the permission snapshot. */
  readonly profileHash: string;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  /** Optional verified organizational scope selected within the tenant. */
  readonly organizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
}

export interface VerifiedIdentityInput {
  readonly realmKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
  readonly organizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
}

export interface ComposeVerifiedRequestContextInput {
  readonly identity: VerifiedIdentityInput;
  readonly permissions: EffectivePermissionContext;
  /** Plane selected by the authenticated API boundary. */
  readonly planeKey: PlaneKey;
  readonly requestId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly correlationId?: string | null;
}

export type ComposeVerifiedRequestContextResult =
  | { ok: true; context: VerifiedRequestContext }
  | {
      ok: false;
      status: 403;
      error: "AUTH_CONTEXT_MISMATCH";
      message: string;
    };

/**
 * Join the verified identity and effective-permission snapshots. A mismatch is
 * a security failure: never rebuild one side from the other or trust headers
 * to reconcile them.
 */
export function composeVerifiedRequestContext(
  input: ComposeVerifiedRequestContextInput,
): ComposeVerifiedRequestContextResult {
  const { identity, permissions, planeKey } = input;
  if (permissions.tenantId !== identity.tenantId) {
    return mismatch("Permission tenant does not match the verified identity tenant.");
  }
  if (permissions.principalId !== identity.principalId) {
    return mismatch("Permission principal does not match the verified identity principal.");
  }
  if (permissions.planeKey !== planeKey) {
    return mismatch("Permission plane does not match the authenticated request plane.");
  }

  return {
    ok: true,
    context: Object.freeze({
      planeKey,
      realmKey: identity.realmKey,
      tenantId: identity.tenantId,
      principalId: identity.principalId,
      permissions,
      authEpoch: identity.authEpoch,
      profileHash: permissions.profileHash,
      requestId: clean(input.requestId) ?? randomUUID(),
      ...(clean(input.idempotencyKey) ? { idempotencyKey: clean(input.idempotencyKey)! } : {}),
      ...(clean(input.correlationId) ? { correlationId: clean(input.correlationId)! } : {}),
      ...(clean(identity.organizationId) ? { organizationId: clean(identity.organizationId)! } : {}),
      ...(clean(identity.companyCodeId) ? { companyCodeId: clean(identity.companyCodeId)! } : {}),
      ...(clean(identity.legalEntityId) ? { legalEntityId: clean(identity.legalEntityId)! } : {}),
    }),
  };
}

/** Store the canonical context in the one supported Express local. */
export function storeVerifiedRequestContext(
  res: Response,
  context: VerifiedRequestContext,
): void {
  (res.locals as Record<string, unknown>)[VERIFIED_REQUEST_CONTEXT_LOCAL] = context;
}

/** Optional accessor for adapters that support authenticated and public paths. */
export function readVerifiedRequestContext(
  res: Response,
): VerifiedRequestContext | undefined {
  return (res.locals as Record<string, unknown>)[VERIFIED_REQUEST_CONTEXT_LOCAL] as
    | VerifiedRequestContext
    | undefined;
}

/**
 * Mandatory accessor for mutation routes and services. Missing middleware is
 * an application configuration error, not an anonymous request fallback.
 */
export function requireVerifiedRequestContext(res: Response): VerifiedRequestContext {
  const context = readVerifiedRequestContext(res);
  if (!context) throw new VerifiedRequestContextRequiredError();
  return context;
}

/**
 * The single route-boundary adapter for protected handlers. `req` is accepted
 * deliberately so handlers never need to reach back into headers or claims to
 * reconstruct identity; the canonical object still lives in `res.locals`.
 */
export function requireVerifiedContext(
  _req: Request,
  res: Response,
): VerifiedRequestContext {
  return requireVerifiedRequestContext(res);
}

export class VerifiedRequestContextRequiredError extends Error {
  readonly code = "VERIFIED_REQUEST_CONTEXT_REQUIRED";
  readonly status = 500;

  constructor() {
    super("The authenticated API boundary did not establish a verified request context.");
    this.name = "VerifiedRequestContextRequiredError";
  }
}

function mismatch(message: string): ComposeVerifiedRequestContextResult {
  return { ok: false, status: 403, error: "AUTH_CONTEXT_MISMATCH", message };
}

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
