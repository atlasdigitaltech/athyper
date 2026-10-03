import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";

type Row = Readonly<Record<string, unknown>>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("COMPILED_ENTITY_OPERATION_CONTRACT_INVALID");
  return value as Row;
}

/** Publication admission, separate from partial read-contract preparation.
 * Every operation in a runtime-bearing entity's source must survive lowering.
 * Collection contracts keep their existing scope-binding path; this check does
 * not invent handler registrations for them or grant any operation access. */
export function assertCompleteRuntimeOperations(
  artifacts: readonly CompiledEntityArtifactV2[],
): void {
  const byKey = new Map(
    artifacts.map((artifact) => [artifact.artifactKey, artifact]),
  );
  if (byKey.size !== artifacts.length)
    throw Error("COMPILED_ENTITY_ARTIFACT_DUPLICATE");
  for (const runtime of artifacts.filter(
    (artifact) => artifact.artifactType === "runtime_contract",
  )) {
    const source = byKey.get(`${runtime.entityCode}/operation`);
    if (!source || !Array.isArray(source.content.operations))
      throw Error(
        `COMPILED_ENTITY_OPERATION_SOURCE_REQUIRED:${runtime.entityCode}`,
      );
    const descriptor = object(runtime.content.descriptor);
    const operations = object(descriptor.operations);
    const profile = object(descriptor.authorization);
    if (!Array.isArray(profile.operations))
      throw Error("COMPILED_ENTITY_OPERATION_CONTRACT_INVALID");
    const authored = new Map<string, Row>();
    for (const raw of source.content.operations) {
      const operation = object(raw);
      if (
        typeof operation.key !== "string" ||
        !operation.key ||
        authored.has(operation.key)
      )
        throw Error("COMPILED_ENTITY_OPERATION_SOURCE_AMBIGUOUS");
      authored.set(operation.key, operation);
    }
    const executable = new Map<string, Row>();
    for (const raw of profile.operations) {
      const operation = object(raw);
      if (typeof operation.key !== "string" || executable.has(operation.key))
        throw Error("COMPILED_ENTITY_OPERATION_RUNTIME_AMBIGUOUS");
      executable.set(operation.key, operation);
    }
    for (const [key, operation] of authored) {
      const published = operations[key],
        authorization = executable.get(key);
      if (!published || !authorization)
        throw Error(
          `COMPILED_ENTITY_OPERATION_UNLOWERED:${runtime.entityCode}:${key}`,
        );
      if (
        object(published).permissionCode !== operation.permissionCode ||
        authorization.permissionCode !== operation.permissionCode
      )
        throw Error(
          `COMPILED_ENTITY_OPERATION_PERMISSION_CHANGED:${runtime.entityCode}:${key}`,
        );
      for (const control of [
        "scope",
        "target",
        "effect",
        "requiresParentRead",
        "requiresPreflight",
      ]) {
        if (
          operation[control] !== undefined &&
          operation[control] !== authorization[control]
        )
          throw Error(
            `COMPILED_ENTITY_OPERATION_CONTROL_CHANGED:${runtime.entityCode}:${key}:${control}`,
          );
      }
      const execution =
        operation.execution === undefined
          ? undefined
          : object(operation.execution);
      if (execution?.handlerKey !== undefined) {
        const bindings = object(descriptor.authorizationRuntime).bindings;
        if (!Array.isArray(bindings))
          throw Error("COMPILED_ENTITY_OPERATION_CONTRACT_INVALID");
        const matches = bindings
          .map(object)
          .filter((binding) => binding.operation === key);
        if (
          matches.length !== 1 ||
          matches[0]!.handler !== execution.handlerKey
        )
          throw Error(
            `COMPILED_ENTITY_OPERATION_HANDLER_CHANGED:${runtime.entityCode}:${key}`,
          );
        const scope =
          operation.scopeBinding === undefined
            ? undefined
            : object(operation.scopeBinding);
        if (
          scope?.resolverKey !== undefined &&
          matches[0]!.resolver !== scope.resolverKey
        )
          throw Error(
            `COMPILED_ENTITY_OPERATION_RESOLVER_CHANGED:${runtime.entityCode}:${key}`,
          );
      }
    }
    for (const key of new Set([
      ...Object.keys(operations),
      ...executable.keys(),
    ])) {
      if (!authored.has(key))
        throw Error(
          `COMPILED_ENTITY_OPERATION_UNAUTHORED:${runtime.entityCode}:${key}`,
        );
    }
  }
}
