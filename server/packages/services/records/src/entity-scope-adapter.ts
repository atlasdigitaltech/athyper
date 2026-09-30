import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityScopeResolverKey } from "@athyper/server-contract-metadata";
import type {
  EntityScopeAdapter,
  EntityScopeCoordinates,
} from "./entity-authorization.js";

export interface EntityOwnershipEvidence {
  readonly tenantId: string;
  readonly entityCode: string;
  readonly recordId: string;
  readonly resolver: EntityScopeResolverKey;
  readonly coordinates: EntityScopeCoordinates;
}
/** Owning services provide typed storage/catalog adapters; metadata never supplies SQL. */
export function createStoredEntityScopeAdapter(options: {
  readonly readOwnership: (input: {
    readonly context: VerifiedRequestContext;
    readonly entityCode: string;
    readonly recordId: string;
  }) => Promise<EntityOwnershipEvidence | null>;
  readonly validateSelection: (input: {
    readonly context: VerifiedRequestContext;
    readonly entityCode: string;
    readonly resolver: EntityScopeResolverKey;
    readonly coordinates: EntityScopeCoordinates;
    readonly target: "proposed" | "collection";
  }) => Promise<boolean>;
  readonly preflight: EntityScopeAdapter["preflight"];
}): EntityScopeAdapter {
  return {
    async resolve(input) {
      if (input.target === "existing") {
        if (!input.recordId) return { state: "invalid" };
        const evidence = await options.readOwnership({
          context: input.context,
          entityCode: input.entityCode,
          recordId: input.recordId,
        });
        if (
          !evidence ||
          evidence.tenantId !== input.context.tenantId ||
          evidence.entityCode !== input.entityCode ||
          evidence.recordId !== input.recordId ||
          evidence.resolver !== input.resolver
        )
          return { state: "invalid" };
        return { state: "resolved", coordinates: evidence.coordinates };
      }
      const coordinates = input.coordinates ?? {};
      if (
        !(await options.validateSelection({
          context: input.context,
          entityCode: input.entityCode,
          resolver: input.resolver,
          coordinates,
          target: input.target,
        }))
      )
        return { state: "invalid" };
      return { state: "resolved", coordinates };
    },
    preflight: options.preflight,
  };
}
