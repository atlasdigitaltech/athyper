import {
  parseEntityDirectoryScope,
  validateDirectoryScopeFields,
  type EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeConstraint } from "@athyper/server-contract-records";

/** Recheck the published binding at the query boundary; a constraint cannot change its fields. */
export function validateDirectoryFieldConstraint(
  descriptor: EntityRuntimeDescriptor,
  constraint: RecordCollectionScopeConstraint,
): void {
  if (constraint.kind !== "entity.directory.fields.v1") return;
  const scope = parseEntityDirectoryScope(descriptor.directoryScope);
  validateDirectoryScopeFields(scope, descriptor.fields);
  const binding = scope.fieldBinding;
  const expected = [binding?.companyField, binding?.organizationField].filter(
    (key): key is string => key !== undefined,
  );
  if (
    descriptor.planeKey !== "neon" ||
    !descriptor.storage.tenantField ||
    !binding ||
    expected.length !== constraint.predicates.length ||
    expected.some(
      (key) =>
        constraint.predicates.filter((predicate) => predicate.field === key)
          .length !== 1,
    ) ||
    constraint.predicates.some(
      (predicate) =>
        typeof predicate.value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          predicate.value,
        ),
    )
  )
    throw new Error(
      "Directory scope constraint does not match the published binding",
    );
}
