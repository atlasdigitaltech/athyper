import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import {
  PinnedCompiledEntityReader,
  type CompiledEntityReleaseCoordinate,
} from "@athyper/server-platform-metadata";

export interface EntityRuntimeOperationHandler {
  execute(input: {
    readonly context: VerifiedRequestContext;
    readonly entityCode: string;
    readonly recordId: string;
    readonly operationKey: string;
    readonly expectedVersion?: number;
    readonly idempotencyKey?: string;
    readonly input: Readonly<Record<string, unknown>>;
  }): Promise<Readonly<Record<string, unknown>>>;
}
export interface EntityRuntimeOperationHandlerRegistry {
  get(handlerKey: string): EntityRuntimeOperationHandler | undefined;
}
/** Composition resolves an operation artifact that belongs to a related entity
 * within the same admitted release. It never changes the release pin. */
export interface EntityRuntimeOperationArtifactResolver {
  resolve(input: {
    readonly entityCode: string;
    readonly operationKey: string;
  }):
    | Readonly<{
        readonly releaseEntityCode: string;
        readonly operationEntityCode: string;
      }>
    | undefined;
}
export class EntityRuntimeOperationError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Resolves one pinned operation declaration before dispatching an explicitly registered domain handler. */
export function createEntityOperationDispatcher(options: {
  readonly reader: PinnedCompiledEntityReader;
  readonly handlers: EntityRuntimeOperationHandlerRegistry;
  readonly artifacts?: EntityRuntimeOperationArtifactResolver;
  readonly capabilities?: ReturnType<typeof createEntityCapabilityPolicy>;
}) {
  return Object.freeze({
    async execute(input: {
      readonly context: VerifiedRequestContext;
      readonly entityCode: string;
      readonly recordId: string;
      readonly operationKey: string;
      readonly expectedVersion?: number;
      readonly idempotencyKey?: string;
      readonly input: Readonly<Record<string, unknown>>;
    }) {
      const capabilityMatch = /^(comments|attachments)\.([a-z_]+)$/.exec(
        input.operationKey,
      );
      if (capabilityMatch) {
        if (!options.capabilities)
          throw new EntityRuntimeOperationError(
            503,
            "ENTITY_RUNTIME_OPERATION_BINDING_UNSUPPORTED",
          );
        const resolved = await options.capabilities.resolve({
          ...input,
          kind: capabilityMatch[1] as "comments" | "attachments",
          action: capabilityMatch[2]!,
          input: {
            ...input.input,
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (
          resolved.action.concurrency === "revision" &&
          (!Number.isSafeInteger(input.expectedVersion) ||
            Number(input.expectedVersion) < 1)
        )
          throw new EntityRuntimeOperationError(
            409,
            "ENTITY_RUNTIME_OPERATION_VERSION_REQUIRED",
          );
        if (resolved.action.idempotency === "required" && !input.idempotencyKey)
          throw new EntityRuntimeOperationError(
            400,
            "ENTITY_RUNTIME_OPERATION_IDEMPOTENCY_REQUIRED",
          );
        const handler = options.handlers.get(resolved.action.handlerKey);
        if (!handler)
          throw new EntityRuntimeOperationError(
            503,
            "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
          );
        const receipt = await handler.execute(input);
        return Object.freeze({
          ...receipt,
          changedResources: changedResources(receipt, input),
        });
      }
      const artifactCoordinates = options.artifacts?.resolve({
        entityCode: input.entityCode,
        operationKey: input.operationKey,
      }) ?? {
        releaseEntityCode: input.entityCode,
        operationEntityCode: input.entityCode,
      };
      const release = await options.reader.resolve(
        coordinate(input.context, artifactCoordinates.releaseEntityCode),
      );
      if (!release)
        throw new EntityRuntimeOperationError(
          404,
          "ENTITY_RUNTIME_OPERATION_NOT_FOUND",
        );
      const artifact =
        artifactCoordinates.operationEntityCode ===
        artifactCoordinates.releaseEntityCode
          ? await options.reader.operation(release)
          : await options.reader.artifactByKey(
              release,
              `${artifactCoordinates.operationEntityCode}/operation`,
              "operation",
            );
      const operation = declaredOperation(artifact, input.operationKey);
      if (!operation)
        throw new EntityRuntimeOperationError(
          404,
          "ENTITY_RUNTIME_OPERATION_NOT_FOUND",
        );
      const permission = string(operation.permissionCode);
      if (
        !permission ||
        !input.context.permissions.allowed.includes(permission)
      )
        throw new EntityRuntimeOperationError(
          403,
          "ENTITY_RUNTIME_OPERATION_FORBIDDEN",
        );
      validateInput(operation, input.input);
      validateTarget(operation, input.recordId, input.input);
      validateContext(operation, input.context, input.input);
      if (operation.idempotency === "required" && !input.idempotencyKey)
        throw new EntityRuntimeOperationError(
          400,
          "ENTITY_RUNTIME_OPERATION_IDEMPOTENCY_REQUIRED",
        );
      const concurrency = artifact.content.concurrency;
      if (
        record(concurrency) &&
        concurrency.expectedRecordVersionRequired === true &&
        input.expectedVersion === undefined
      )
        throw new EntityRuntimeOperationError(
          409,
          "ENTITY_RUNTIME_OPERATION_VERSION_REQUIRED",
        );
      const handlerKey = record(operation.execution)
        ? string(operation.execution.handlerKey)
        : undefined;
      if (!handlerKey)
        throw new EntityRuntimeOperationError(
          503,
          "ENTITY_RUNTIME_OPERATION_BINDING_UNSUPPORTED",
        );
      const handler = options.handlers.get(handlerKey);
      if (!handler)
        throw new EntityRuntimeOperationError(
          503,
          "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
        );
      const receipt = await handler.execute(input);
      return Object.freeze({
        ...receipt,
        changedResources: changedResources(receipt, input),
      });
    },
  });
}
function coordinate(
  context: VerifiedRequestContext,
  entityCode: string,
): CompiledEntityReleaseCoordinate {
  return {
    tenantId: context.tenantId,
    principalId: context.principalId,
    planeKey: context.planeKey,
    entityCode,
  };
}
function declaredOperation(
  artifact: CompiledEntityArtifactV2,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  if (
    artifact.artifactType !== "operation" ||
    !Array.isArray(artifact.content.operations)
  )
    throw new EntityRuntimeOperationError(
      503,
      "ENTITY_RUNTIME_OPERATION_ARTIFACT_INVALID",
    );
  return artifact.content.operations.find(
    (item): item is Readonly<Record<string, unknown>> =>
      record(item) && item.key === key,
  );
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validateInput(
  operation: Readonly<Record<string, unknown>>,
  input: Readonly<Record<string, unknown>>,
) {
  const schema = record(operation.inputSchema)
    ? operation.inputSchema
    : undefined;
  if (!schema) return;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (
    required.some((key) => typeof key !== "string" || input[key] === undefined)
  )
    throw new EntityRuntimeOperationError(
      400,
      "ENTITY_RUNTIME_OPERATION_INPUT_REQUIRED",
    );
  const properties = record(schema.properties) ? schema.properties : undefined;
  if (!properties) return;
  if (
    schema.additionalProperties === false &&
    Object.keys(input).some((key) => !Object.hasOwn(properties, key))
  )
    throw new EntityRuntimeOperationError(
      400,
      "ENTITY_RUNTIME_OPERATION_INPUT_UNKNOWN",
    );
  for (const [key, definition] of Object.entries(properties)) {
    if (
      input[key] === undefined ||
      !record(definition) ||
      typeof definition.type !== "string"
    )
      continue;
    const value = input[key],
      type = definition.type;
    if (
      (type === "string" && typeof value !== "string") ||
      (type === "integer" &&
        (!Number.isInteger(value) || typeof value !== "number")) ||
      (type === "boolean" && typeof value !== "boolean") ||
      (type === "object" && !record(value))
    )
      throw new EntityRuntimeOperationError(
        400,
        "ENTITY_RUNTIME_OPERATION_INPUT_TYPE_INVALID",
      );
    if (Array.isArray(definition.enum) && !definition.enum.includes(value))
      throw new EntityRuntimeOperationError(
        400,
        "ENTITY_RUNTIME_OPERATION_INPUT_VALUE_INVALID",
      );
  }
}
function validateTarget(
  operation: Readonly<Record<string, unknown>>,
  recordId: string,
  input: Readonly<Record<string, unknown>>,
) {
  const target = record(operation.targetBinding)
    ? operation.targetBinding
    : undefined;
  if (!target || target.clientSuppliedTargetEntityCode !== "forbidden") return;
  const targetField = string(target.targetIdField);
  if (!targetField)
    throw new EntityRuntimeOperationError(
      503,
      "ENTITY_RUNTIME_OPERATION_ARTIFACT_INVALID",
    );
  if (input[targetField] !== undefined && input[targetField] !== recordId)
    throw new EntityRuntimeOperationError(
      400,
      "ENTITY_RUNTIME_OPERATION_TARGET_MISMATCH",
    );
}
function validateContext(
  operation: Readonly<Record<string, unknown>>,
  context: VerifiedRequestContext,
  input: Readonly<Record<string, unknown>>,
) {
  const binding = record(operation.scopeBinding)
    ? operation.scopeBinding
    : undefined;
  if (!binding || binding.scopeSource !== "validated_create_input") return;
  const coordinates = Array.isArray(binding.requiredContextCoordinates)
    ? binding.requiredContextCoordinates
    : [];
  if (
    coordinates.some(
      (key) =>
        typeof key !== "string" ||
        typeof input[key] !== "string" ||
        !input[key],
    )
  )
    throw new EntityRuntimeOperationError(
      400,
      "ENTITY_RUNTIME_OPERATION_CONTEXT_REQUIRED",
    );
  if (!context.tenantId || !context.principalId)
    throw new EntityRuntimeOperationError(
      403,
      "ENTITY_RUNTIME_OPERATION_CONTEXT_INVALID",
    );
}
function changedResources(
  receipt: Readonly<Record<string, unknown>>,
  input: { readonly entityCode: string; readonly recordId: string },
) {
  const supplied = Array.isArray(receipt.changedResources)
    ? receipt.changedResources.filter(record)
    : [];
  const resources = supplied.length
    ? supplied
    : [
        {
          entityCode: input.entityCode,
          recordId: input.recordId,
          kinds: ["action_summary"],
        },
      ];
  return Object.freeze(
    resources.map((item) =>
      Object.freeze({
        entityCode:
          typeof item.entityCode === "string"
            ? item.entityCode
            : input.entityCode,
        recordId:
          typeof item.recordId === "string" ? item.recordId : input.recordId,
        revision:
          typeof item.revision === "string" || typeof item.revision === "number"
            ? String(item.revision)
            : undefined,
        kinds: Array.isArray(item.kinds)
          ? item.kinds.filter(
              (value): value is string => typeof value === "string",
            )
          : ["action_summary"],
        sectionKeys: Array.isArray(item.sectionKeys)
          ? item.sectionKeys.filter(
              (value): value is string =>
                typeof value === "string" &&
                /^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(value),
            )
          : [],
      }),
    ),
  );
}
