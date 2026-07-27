import type { VerifiedRequestContext } from "@athyper/svc-iam";

/**
 * Authorization-safe read boundary for future Atlas tools and retrieval.
 *
 * The gateway deliberately owns no SQL or relay client. Callers provide
 * adapters backed by canonical entity/document services, while this class
 * guarantees that permission, scope authorization, immutable source metadata,
 * and field masking all succeed before data can enter model context.
 */

export type AtlasSourceKind = "record" | "attachment" | "content";

export interface AtlasDataReadRequest {
  readonly permissionCode: string;
  readonly entityCode?: string;
  readonly sourceKind: AtlasSourceKind;
  readonly sourceId: string;
  readonly requestedFields?: readonly string[];
}

export interface AtlasSourceIdentity {
  readonly sourceKind: AtlasSourceKind;
  readonly sourceId: string;
  /** Immutable row/document/content revision used for this read. */
  readonly sourceVersionId: string;
  readonly sourceChecksum?: string;
}

export interface AtlasLoadedData {
  readonly value: unknown;
  readonly source: AtlasSourceIdentity;
}

export type AtlasAuthorizationDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: string;
      readonly reason?: string;
    };

export type AtlasMaskingResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly code: string;
      readonly reason?: string;
    };

export interface AtlasDataGatewayDependencies {
  /**
   * Applies permission-specific company, legal-entity, organization,
   * visibility, and extended scopes. It must not infer scope from model input.
   */
  authorize(
    context: VerifiedRequestContext,
    request: AtlasDataReadRequest,
  ): Promise<AtlasAuthorizationDecision>;
  /** Loads through a canonical application service after authorization. */
  load(
    context: VerifiedRequestContext,
    request: AtlasDataReadRequest,
  ): Promise<AtlasLoadedData | null>;
  /** Applies field security and data-classification masking. */
  mask(
    context: VerifiedRequestContext,
    request: AtlasDataReadRequest,
    loaded: AtlasLoadedData,
  ): Promise<AtlasMaskingResult>;
}

export interface AtlasDataReadResult {
  readonly value: unknown;
  readonly source: AtlasSourceIdentity;
  readonly authorizationProfileHash: string;
}

export type AtlasDataGatewayErrorCode =
  | "INVALID_VERIFIED_CONTEXT"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_METADATA_REQUIRED"
  | "FIELD_MASKING_DENIED";

export class AtlasDataGatewayError extends Error {
  override readonly name = "AtlasDataGatewayError";

  constructor(
    readonly code: AtlasDataGatewayErrorCode,
    message: string,
    readonly detailCode?: string,
  ) {
    super(message);
  }
}

export class AtlasDataGateway {
  constructor(private readonly deps: AtlasDataGatewayDependencies) {}

  async read(
    context: VerifiedRequestContext,
    request: AtlasDataReadRequest,
  ): Promise<AtlasDataReadResult> {
    assertVerifiedContext(context);
    assertReadRequest(request);

    if (
      context.permissions.denied.has(request.permissionCode)
      || context.permissions.planLocked.has(request.permissionCode)
      || context.permissions.planeExcluded.has(request.permissionCode)
      || !context.permissions.allowed.has(request.permissionCode)
    ) {
      throw new AtlasDataGatewayError(
        "PERMISSION_DENIED",
        "The verified principal does not have the required Atlas data permission.",
        request.permissionCode,
      );
    }

    const authorization = await this.deps.authorize(context, request);
    if (!authorization.allowed) {
      throw new AtlasDataGatewayError(
        "SCOPE_DENIED",
        "The requested Atlas data is outside the verified authorization scope.",
        authorization.code,
      );
    }

    const loaded = await this.deps.load(context, request);
    if (!loaded) {
      throw new AtlasDataGatewayError(
        "SOURCE_NOT_FOUND",
        "The authorized Atlas data source is unavailable.",
      );
    }
    assertSourceIdentity(request, loaded.source);

    const masked = await this.deps.mask(context, request, loaded);
    if (!masked.ok) {
      throw new AtlasDataGatewayError(
        "FIELD_MASKING_DENIED",
        "Atlas field-security masking could not produce a safe result.",
        masked.code,
      );
    }

    return Object.freeze({
      value: masked.value,
      source: Object.freeze({ ...loaded.source }),
      authorizationProfileHash: context.profileHash,
    });
  }
}

function assertVerifiedContext(context: VerifiedRequestContext): void {
  const valid =
    nonEmpty(context.tenantId)
    && nonEmpty(context.principalId)
    && nonEmpty(context.realmKey)
    && nonEmpty(context.requestId)
    && nonEmpty(context.profileHash)
    && Number.isSafeInteger(context.authEpoch)
    && context.authEpoch >= 0
    && context.permissions.tenantId === context.tenantId
    && context.permissions.principalId === context.principalId
    && context.permissions.planeKey === context.planeKey
    && context.permissions.profileHash === context.profileHash;
  if (!valid) {
    throw new AtlasDataGatewayError(
      "INVALID_VERIFIED_CONTEXT",
      "Atlas data access requires one internally consistent verified request context.",
    );
  }
}

function assertReadRequest(request: AtlasDataReadRequest): void {
  if (
    !nonEmpty(request.permissionCode)
    || !nonEmpty(request.sourceId)
    || !["record", "attachment", "content"].includes(request.sourceKind)
  ) {
    throw new AtlasDataGatewayError(
      "SOURCE_METADATA_REQUIRED",
      "Atlas data access requires a permission and stable source identity.",
    );
  }
}

function assertSourceIdentity(
  request: AtlasDataReadRequest,
  source: AtlasSourceIdentity,
): void {
  if (
    source.sourceKind !== request.sourceKind
    || source.sourceId !== request.sourceId
    || !nonEmpty(source.sourceVersionId)
  ) {
    throw new AtlasDataGatewayError(
      "SOURCE_METADATA_REQUIRED",
      "The canonical data service did not return the requested immutable source revision.",
    );
  }
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
