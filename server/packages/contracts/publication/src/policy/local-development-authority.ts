/** Trusted adapters resolve these records from installed authority and verified
 * sessions. Never treat request-body copies as authority or human approval. */
export type LocalPublicationAction =
  "publish" | "retry" | "recover" | "rollback";
export type LocalPublicationScope =
  | { readonly kind: "product" }
  | { readonly kind: "tenant"; readonly tenantId: string };
export interface PublicationEnvironmentIdentity {
  readonly environment: string;
  readonly instance: string;
  readonly domainSuffix: string;
}
export interface LocalDevelopmentAuthority {
  readonly schema: "athyper.local-development-authority/1";
  readonly id: string;
  readonly version: number;
  readonly hash: string;
  readonly active: boolean;
  readonly validFrom: string;
  readonly expiresAt: string;
  readonly enrollmentReceiptId: string;
  readonly host: PublicationEnvironmentIdentity;
  readonly scope: LocalPublicationScope;
  /** Resolved membership, including governed role membership, at execution time. */
  readonly developerPrincipalIds: readonly string[];
  readonly authorWorkloadId: string;
  readonly publisherWorkloadId: string;
  readonly actions: readonly LocalPublicationAction[];
  readonly destinations: readonly {
    readonly plane: "studio" | "neon" | "mesh";
    readonly instance: string;
  }[];
}
export interface LocalPublicationAdmission {
  readonly host: PublicationEnvironmentIdentity;
  readonly developerPrincipalId: string;
  readonly authorWorkloadId: string;
  readonly publisherWorkloadId: string;
  readonly scope: LocalPublicationScope;
  readonly action: LocalPublicationAction;
  readonly targets: LocalDevelopmentAuthority["destinations"];
}
function requireLocal(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`LOCAL_PUBLICATION_${code}`);
}
export function assertLocalPublicationEnvironment(
  host: PublicationEnvironmentIdentity,
): void {
  requireLocal(
    host.environment === "local" &&
      host.instance === "dev" &&
      host.domainSuffix === "dev.athyper.test",
    "DEV_ONLY",
  );
}
/** Reusable authority is deliberately not pinned to an entity name, draft or
 * compiler. Each execution must separately bind its exact inputs and artifacts. */
export function assertLocalDevelopmentAuthority(
  authority: LocalDevelopmentAuthority,
  request: LocalPublicationAdmission,
  now = Date.now(),
): void {
  assertLocalPublicationEnvironment(request.host);
  assertLocalPublicationEnvironment(authority.host);
  requireLocal(
    authority.schema === "athyper.local-development-authority/1" &&
      authority.id.trim() &&
      Number.isSafeInteger(authority.version) &&
      authority.version > 0 &&
      /^[a-f0-9]{64}$/.test(authority.hash) &&
      authority.enrollmentReceiptId.trim(),
    "INVALID",
  );
  requireLocal(authority.active, "AUTHORITY_REVOKED");
  const start = Date.parse(authority.validFrom),
    end = Date.parse(authority.expiresAt);
  requireLocal(
    Number.isFinite(now) &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now &&
      now < end,
    "AUTHORITY_EXPIRED",
  );
  requireLocal(
    request.developerPrincipalId.trim() &&
      authority.developerPrincipalIds.includes(request.developerPrincipalId),
    "DEVELOPER_DENIED",
  );
  requireLocal(
    authority.authorWorkloadId.trim() &&
      authority.publisherWorkloadId.trim() &&
      request.authorWorkloadId === authority.authorWorkloadId &&
      request.publisherWorkloadId === authority.publisherWorkloadId &&
      new Set([
        request.developerPrincipalId,
        request.authorWorkloadId,
        request.publisherWorkloadId,
      ]).size === 3,
    "ACTOR_MISMATCH",
  );
  requireLocal(
    ["publish", "retry", "recover", "rollback"].includes(request.action) &&
      authority.actions.includes(request.action),
    "ACTION_DENIED",
  );
  requireLocal(
    (request.scope.kind === "product" && authority.scope.kind === "product") ||
      (request.scope.kind === "tenant" &&
        authority.scope.kind === "tenant" &&
        request.scope.tenantId.trim() &&
        request.scope.tenantId === authority.scope.tenantId),
    "SCOPE_DENIED",
  );
  requireLocal(
    authority.destinations.length > 0 &&
      authority.destinations.every(
        (d) =>
          ["studio", "neon", "mesh"].includes(d.plane) && d.instance === "dev",
      ) &&
      new Set(authority.destinations.map((d) => d.plane)).size ===
        authority.destinations.length,
    "AUTHORITY_TARGETS_INVALID",
  );
  requireLocal(
    request.targets.length > 0 &&
      new Set(request.targets.map((d) => d.plane)).size ===
        request.targets.length &&
      request.targets.every((t) =>
        authority.destinations.some(
          (d) => d.plane === t.plane && d.instance === t.instance,
        ),
      ),
    "TARGET_DENIED",
  );
}
