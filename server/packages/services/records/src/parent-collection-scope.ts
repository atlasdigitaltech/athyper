import type { MetadataReader } from "@athyper/server-contract-metadata";
import type {
  RecordCollectionScopeResolver,
  RecordQueryService,
} from "@athyper/server-contract-records";

/** Wrap the existing list scope resolver; preserve all of its constraints.
 * Parent coordinates select a published relationship, never a client-authored predicate. */
export function createParentCollectionScopeResolver(options: {
  metadata: MetadataReader;
  readParent: RecordQueryService["get"];
  fallback?: RecordCollectionScopeResolver;
}): RecordCollectionScopeResolver {
  return {
    async resolve(input) {
      const { parentEntityCode, parentRecordId, relationshipKey, ...rest } =
        input.coordinate ?? {};
      const baseline = (await options.fallback?.resolve({
        ...input,
        coordinate: rest,
      })) ?? {
        status: "ready" as const,
        authorizationResource: {},
        constraints: [],
        labels: [],
        fingerprintMaterial: { mode: "tenant" },
      };
      if (baseline.status !== "ready") return baseline;
      if (
        parentEntityCode === undefined &&
        parentRecordId === undefined &&
        relationshipKey === undefined
      )
        return baseline;
      const denied = {
        status: "forbidden" as const,
        code: "ENTITY_PARENT_ACCESS_DENIED",
        message: "This related list is unavailable.",
        labels: [],
      };
      if (
        !parentEntityCode ||
        !parentRecordId ||
        !relationshipKey ||
        input.operationCode !== "read"
      )
        return denied;
      const parent = await options.metadata.getEntityDescriptor(
        input.context,
        parentEntityCode,
      );
      const relation = parent?.recordPresentation?.entityRelationships?.find(
        (relation) => relation.key === relationshipKey,
      );
      if (
        !parent ||
        !relation ||
        !input.descriptor.operations[relation.readOperation] ||
        relation.targetEntity !== input.descriptor.entityCode ||
        parent.planeKey !== input.descriptor.planeKey ||
        relation.tenant.source !== parent.storage.tenantField ||
        relation.tenant.target !== input.descriptor.storage.tenantField
      )
        return denied;
      for (const mapping of [relation.tenant, ...relation.fields]) {
        const source = parent.fields.find(
            (field) => field.key === mapping.source,
          ),
          target = input.descriptor.fields.find(
            (field) => field.key === mapping.target,
          );
        if (
          !source ||
          !target ||
          source.type !== target.type ||
          source.writableOn.length ||
          target.writableOn.length
        )
          return denied;
      }
      // The ordinary record reader enforces current parent authorization/RLS. A route
      // or relationship declaration alone is never evidence of parent access.
      const record = await options.readParent({
        context: input.context,
        entityCode: parentEntityCode,
        recordId: parentRecordId,
      });
      if (!record.data) return denied;
      const predicates: { field: string; value: string | number | boolean }[] =
        [];
      for (const mapping of relation.fields) {
        const value = record.data[mapping.source];
        if (
          !["string", "number", "boolean"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value))
        )
          return denied;
        predicates.push({
          field: mapping.target,
          value: value as string | number | boolean,
        });
      }
      return {
        ...baseline,
        constraints: [
          ...baseline.constraints,
          {
            kind: "entity.parent.v1" as const,
            entityCode: input.descriptor.entityCode,
            storageSchema: input.descriptor.storage.schema,
            storageObject: input.descriptor.storage.object,
            predicates,
          },
        ],
        labels: [
          ...baseline.labels,
          { key: "parent", label: "Record scope", value: parentRecordId },
        ],
        fingerprintMaterial: {
          ...baseline.fingerprintMaterial,
          parentEntityCode,
          parentRecordId,
          relationshipKey,
          parentRelease: parent.releaseId,
          childRelease: input.descriptor.releaseId,
          parentPredicates: JSON.stringify(predicates),
        },
      };
    },
  };
}
