import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  MetadataReader,
  EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import type {
  RecordRepository,
  RecordQueryService,
  RecordListScopeCoordinate,
} from "@athyper/server-contract-records";

/** Internal resolution for governed amendments. A stored FK discovers the
 * owner, but only ordinary authorized reads admit it. No client-supplied parent
 * coordinate can choose the case owner. This prepares evidence, never a write. */
export function createGovernedAmendmentTargetResolver<T>(options: {
  metadata: MetadataReader;
  repository: Pick<RecordRepository<T>, "get">;
  reads: Pick<RecordQueryService, "getWithProjection">;
}) {
  return async (
    input: {
      context: VerifiedRequestContext;
      entityCode: string;
      recordId: string;
      owner: "self" | "required_parent";
      scopeCoordinate?: RecordListScopeCoordinate;
    },
    transaction: T,
  ) => {
    const fail = (): never => {
      throw Error("GOVERNED_AMENDMENT_TARGET_UNAVAILABLE");
    };
    const read = options.reads.getWithProjection?.bind(options.reads);
    if (!read || !["self", "required_parent"].includes(input.owner))
      return fail();
    if (
      input.scopeCoordinate &&
      [
        "parentEntityCode",
        "parentRecordId",
        "relationshipKey",
        "parentDescriptorHash",
      ].some((key) => Object.hasOwn(input.scopeCoordinate!, key))
    )
      return fail();
    const target = await options.metadata.getEntityDescriptor(
      input.context,
      input.entityCode,
    );
    if (
      !target ||
      target.entityCode !== input.entityCode ||
      target.planeKey !== input.context.planeKey ||
      !target.storage.tenantField
    )
      return fail();
    let owner = target,
      ownerId = input.recordId;
    let scopeCoordinate = input.scopeCoordinate;
    if (input.owner === "self") {
      if (target.directoryScope?.parent) return fail();
    } else {
      const required = target.directoryScope?.parent;
      if (!required) return fail();
      const parent = await options.metadata.getEntityDescriptor(
        input.context,
        required.entityCode,
      );
      const relation = parent?.recordPresentation?.entityRelationships?.find(
        (r) => r.key === required.relationshipKey,
      );
      if (
        !parent ||
        parent.entityCode !== required.entityCode ||
        parent.planeKey !== target.planeKey ||
        parent.directoryScope?.parent ||
        !relation ||
        relation.targetEntity !== target.entityCode ||
        !parent.storage.tenantField ||
        relation.tenant.source !== parent.storage.tenantField ||
        relation.tenant.target !== target.storage.tenantField
      )
        return fail();
      // Discovery needs an explicit parent identity mapping. Additional relation
      // predicates remain enforced by the ordinary child reader below.
      const mappings = relation.fields.filter(
        (field) => field.source === parent.storage.idField,
      );
      if (mappings.length !== 1) return fail();
      const field = target.fields.find(
        (field) => field.key === mappings[0]!.target,
      );
      if (!field || field.type !== "uuid" || field.writableOn.length)
        return fail();
      const stored = await options.repository.get(
        target,
        input.context.tenantId,
        input.recordId,
        [target.storage.idField, target.storage.tenantField, field.key],
        transaction,
      );
      if (
        !stored ||
        stored[target.storage.idField] !== input.recordId ||
        stored[target.storage.tenantField] !== input.context.tenantId ||
        typeof stored[field.key] !== "string"
      )
        return fail();
      owner = parent;
      ownerId = stored[field.key] as string;
      scopeCoordinate = {
        ...input.scopeCoordinate,
        parentEntityCode: parent.entityCode,
        parentRecordId: ownerId,
        relationshipKey: required.relationshipKey,
        parentDescriptorHash: parent.compiledHash,
      };
    }
    const approvedOwner = await read({
      context: input.context,
      entityCode: owner.entityCode,
      recordId: ownerId,
      scopeCoordinate: input.scopeCoordinate,
    });
    const admitted = (
      expected: EntityRuntimeDescriptor,
      id: string,
      result: Awaited<ReturnType<typeof read>>,
    ) =>
      result.descriptor.entityCode === expected.entityCode &&
      result.descriptor.planeKey === expected.planeKey &&
      result.descriptor.compiledHash === expected.compiledHash &&
      result.descriptor.releaseId === expected.releaseId &&
      result.data?.[expected.storage.idField] === id &&
      result.data?.[expected.storage.tenantField!] === input.context.tenantId;
    if (!admitted(owner, ownerId, approvedOwner)) return fail();
    if (input.owner === "required_parent") {
      const approvedTarget = await read({
        context: input.context,
        entityCode: target.entityCode,
        recordId: input.recordId,
        scopeCoordinate,
      });
      if (!admitted(target, input.recordId, approvedTarget)) return fail();
      const relation = owner.recordPresentation!.entityRelationships!.find(
        (r) => r.key === target.directoryScope!.parent!.relationshipKey,
      )!;
      for (const field of relation.fields) {
        if (
          approvedOwner.data?.[field.source] === undefined ||
          approvedTarget.data?.[field.target] !==
            approvedOwner.data[field.source]
        )
          return fail();
      }
    }
    const rawVersion = owner.storage.versionField
      ? approvedOwner.data?.[owner.storage.versionField]
      : undefined;
    const version =
      typeof rawVersion === "number" ||
      (typeof rawVersion === "string" && /^[1-9][0-9]*$/.test(rawVersion))
        ? Number(rawVersion)
        : NaN;
    if (
      typeof version !== "number" ||
      !Number.isSafeInteger(version) ||
      version < 1
    )
      return fail();
    return Object.freeze({
      ownerEntityCode: owner.entityCode,
      ownerRecordId: ownerId,
      ownerRecordVersion: version,
      ownerReleaseId: owner.releaseId,
      ownerDescriptorHash: owner.compiledHash,
      amendmentTarget: Object.freeze({
        entityCode: target.entityCode,
        recordId: input.recordId,
        releaseId: target.releaseId,
        descriptorHash: target.compiledHash,
      }),
    });
  };
}
