import type { RecordSourceAuthorityResolver } from "@athyper/server-service-records";

/** Minimal authority evidence, not personal data or an authorization grant.
 * A reader must positively enumerate governed linkage and hold its write fence
 * through the caller's transaction. An RLS-filtered empty result is incomplete. */
export interface VerifiedProfileSourceSnapshot {
  readonly tenantId: string;
  readonly principalId: string;
  readonly revision: string;
  readonly complete: boolean;
  readonly fenced: boolean;
  readonly state: "confirmed_unlinked" | "linked" | "unresolved";
  readonly sources: readonly {
    readonly plane: "studio" | "neon" | "mesh";
    readonly tenantId: string;
    readonly entityCode: string;
    readonly recordId: string;
    readonly verified: boolean;
  }[];
}

export interface VerifiedProfileSourceReader<Transaction> {
  /** Uses the requested owner, including administrator-on-behalf-of requests.
   * Throws on unavailable authority; never substitutes actor identity. */
  lockAndRead: (
    input: Parameters<RecordSourceAuthorityResolver<Transaction>>[0],
    transaction: Transaction,
  ) => Promise<VerifiedProfileSourceSnapshot>;
}

/** Resolves ownership only. Source reads/edits still require independent Entity
 * authorization in the source plane and tenant; no data is copied locally. */
export function createVerifiedProfileSourceResolver<Transaction>(
  reader: VerifiedProfileSourceReader<Transaction>,
): RecordSourceAuthorityResolver<Transaction> {
  return async (input, transaction) => {
    const evidence = await reader.lockAndRead(input, transaction);
    const unavailable = {
      state: "unavailable" as const,
      tenantId: input.context.tenantId,
      principalId: input.ownerPrincipalId,
      revision: evidence?.revision || "unresolved",
    };
    if (
      !evidence ||
      evidence.tenantId !== input.context.tenantId ||
      evidence.principalId !== input.ownerPrincipalId ||
      typeof evidence.revision !== "string" ||
      !evidence.revision.trim() ||
      evidence.complete !== true ||
      evidence.fenced !== true ||
      !Array.isArray(evidence.sources)
    )
      return unavailable;
    const result = {
      tenantId: evidence.tenantId,
      principalId: evidence.principalId,
      revision: evidence.revision,
    };
    if (
      evidence.state === "confirmed_unlinked" &&
      evidence.sources.length === 0
    )
      return { ...result, state: "local" };
    if (
      evidence.state !== "linked" ||
      evidence.sources.length === 0 ||
      evidence.sources.some(
        (source) =>
          source.verified !== true ||
          !["studio", "neon", "mesh"].includes(source.plane) ||
          !source.tenantId ||
          !source.recordId ||
          !/^[a-z][a-z0-9_]{1,62}$/.test(source.entityCode),
      )
    )
      return unavailable;
    // A Person may have both internal and external workforce roles. Multiple
    // proofs of the same source are valid; competing personal sources are not.
    const distinct = new Set(
      evidence.sources.map((source) =>
        JSON.stringify([
          source.plane,
          source.tenantId,
          source.entityCode,
          source.recordId,
        ]),
      ),
    );
    if (distinct.size !== 1) return unavailable;
    const source = evidence.sources[0]!;
    return { ...result, state: "linked", source: { plane: source.plane, tenantId: source.tenantId, entityCode: source.entityCode, recordId: source.recordId } };
  };
}
