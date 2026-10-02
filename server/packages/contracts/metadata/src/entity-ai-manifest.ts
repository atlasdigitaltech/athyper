import type { EntityAiDescriptorV1 } from "./entity-ai.js";

/** Compiler-owned immutable requirements; neither readiness nor authorization. */
export interface EntityAiManifestBindingV1 {
  readonly id: string;
  readonly version: string;
  readonly manifestHash: string;
  readonly inputSchemaHash: string;
  readonly resultSchemaHash: string;
}
export interface EntityAiManifestBindingsV1 {
  readonly schema: "entity-ai-manifest-bindings/1";
  readonly plane: "studio" | "neon" | "mesh";
  readonly tools: readonly (EntityAiManifestBindingV1 & {
    readonly required?: boolean;
  })[];
}
export function parseEntityAiManifestBindings(
  value: unknown,
  ai: EntityAiDescriptorV1 | undefined,
  plane: string,
): EntityAiManifestBindingsV1 {
  const invalid = (): never => {
    throw new TypeError("ENTITY_AI_MANIFEST_BINDINGS_INVALID");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).sort().join() !== "plane,schema,tools" ||
    item.schema !== "entity-ai-manifest-bindings/1" ||
    item.plane !== plane ||
    !["studio", "neon", "mesh"].includes(plane) ||
    !ai ||
    !Array.isArray(item.tools) ||
    item.tools.length !== ai.insightProviders.length
  )
    return invalid();
  const seen = new Set<string>();
  const tools = item.tools.map(
    (raw): EntityAiManifestBindingsV1["tools"][number] => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return invalid();
      const tool = raw as Record<string, unknown>;
      if (
        Object.keys(tool)
          .filter((key) => key !== "required")
          .sort()
          .join() !==
          "id,inputSchemaHash,manifestHash,resultSchemaHash,version" ||
        (tool.required !== undefined && typeof tool.required !== "boolean") ||
        tool.required !==
          ai.insightProviders.find((ref) => ref.id === tool.id)?.required ||
        typeof tool.id !== "string" ||
        typeof tool.version !== "string" ||
        seen.has(tool.id) ||
        !ai.insightProviders.some(
          (ref) => ref.id === tool.id && String(ref.version) === tool.version,
        ) ||
        [tool.manifestHash, tool.inputSchemaHash, tool.resultSchemaHash].some(
          (hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash),
        )
      )
        return invalid();
      seen.add(tool.id);
      return Object.freeze({
        id: tool.id,
        version: tool.version,
        manifestHash: tool.manifestHash as string,
        inputSchemaHash: tool.inputSchemaHash as string,
        resultSchemaHash: tool.resultSchemaHash as string,
        ...(tool.required === undefined
          ? {}
          : { required: tool.required as boolean }),
      });
    },
  );
  return Object.freeze({
    schema: "entity-ai-manifest-bindings/1",
    plane: plane as EntityAiManifestBindingsV1["plane"],
    tools: Object.freeze(tools),
  });
}
