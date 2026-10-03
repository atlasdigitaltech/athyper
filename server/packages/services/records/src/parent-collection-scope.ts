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
      const {
        parentEntityCode,
        parentRecordId,
        relationshipKey,
        parentDescriptorHash,
        ...rest
      } = input.coordinate ?? {};
      const required = input.descriptor.directoryScope?.parent;
      if (
        required &&
        (parentEntityCode !== required.entityCode ||
          relationshipKey !== required.relationshipKey ||
          !parentRecordId ||
          !parentDescriptorHash)
      )
        return {
          status: "forbidden" as const,
          code: "ENTITY_PARENT_ACCESS_DENIED",
          message: "Published parent scope is required.",
          labels: [],
        };
      if (
        required &&
        input.descriptor.directoryScope?.mode !== "tenant" &&
        !options.fallback
      )
        return {
          status: "forbidden" as const,
          code: "DIRECTORY_SCOPE_RESOLVER_REQUIRED",
          message:
            "The published organization or company scope requires an installed resolver.",
          labels: [],
        };
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
        relationshipKey === undefined &&
        parentDescriptorHash === undefined
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
        !/^[a-z][a-z0-9_]{1,62}$/.test(parentEntityCode) ||
        !/^[a-z][a-z0-9_]{1,62}$/.test(relationshipKey) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parentRecordId,
        ) ||
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
        parent.directoryScope?.parent !== undefined ||
        parent.entityCode !== parentEntityCode ||
        parent.planeKey !== input.context.planeKey ||
        (parentDescriptorHash !== undefined &&
          parent.compiledHash !== parentDescriptorHash) ||
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
      if (
        !record.data ||
        record.data[parent.storage.idField] !== parentRecordId ||
        (Object.hasOwn(record.data, parent.storage.tenantField) &&
          record.data[parent.storage.tenantField] !== input.context.tenantId)
      )
        return denied;
      if (
        required &&
        (!parentTitle(parent, record.data) ||
          parent.fields.find(
            (field) => field.key === parent.recordPresentation?.titleField,
          )?.type !== "string")
      )
        return {
          status: "forbidden" as const,
          code: "ENTITY_PARENT_PRESENTATION_REQUIRED",
          message:
            "Publish a readable string title for the parent record scope.",
          labels: [],
        };
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
          // Name the parent by its published title (read through the same governed
          // reader above); the id stands in only when the title is not readable.
          {
            key: "parent",
            label: "Record scope",
            value: parentTitle(parent, record.data) ?? parentRecordId,
          },
        ],
        fingerprintMaterial: {
          ...baseline.fingerprintMaterial,
          parentEntityCode,
          parentRecordId,
          relationshipKey,
          parentRelease: parent.releaseId,
          parentDescriptorHash: parent.compiledHash,
          scopeResolver: "entity.parent.v1",
          childRelease: input.descriptor.releaseId,
          parentPredicates: JSON.stringify(predicates),
        },
      };
    },
  };
}

function parentTitle(
  parent: { readonly recordPresentation?: { readonly titleField?: string } },
  data: Readonly<Record<string, unknown>>,
): string | undefined {
  const field = parent.recordPresentation?.titleField,
    value = field ? data[field] : undefined;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : undefined;
}
