import {
  parseEntityAiManifestBindings,
  type EntityAiDescriptorV1,
} from "@athyper/server-contract-metadata";
import type {
  CompiledEntityRegistry,
  PublicationPlane,
} from "@athyper/server-contract-publication";

/** Add compiler-owned pins after lowering and before artifact hashing. Legacy
 * composition without the port retains its wire shape; the standard host installs it. */
export function compileEntityAiManifestBindings(
  descriptor: Readonly<Record<string, unknown>>,
  plane: PublicationPlane,
  registry: CompiledEntityRegistry,
): Readonly<Record<string, unknown>> {
  if (Object.hasOwn(descriptor, "aiManifestBindings"))
    throw new TypeError("ENTITY_AI_MANIFEST_AUTHORING_FORBIDDEN");
  if (!descriptor.ai) return descriptor;
  if (!registry.resolveAiToolManifest) {
    const refs = (descriptor.ai as EntityAiDescriptorV1).insightProviders;
    if (Array.isArray(refs) && refs.some((ref) => ref.required !== undefined))
      throw new TypeError("ENTITY_AI_MANIFEST_RESOLVER_UNAVAILABLE");
    return descriptor;
  }
  const ai = descriptor.ai as EntityAiDescriptorV1;
  if (
    !Array.isArray(ai.insightProviders) ||
    ai.insightProviders.length > 16 ||
    ai.insightProviders.some(
      (ref) =>
        !ref ||
        typeof ref.id !== "string" ||
        ref.version !== 1 ||
        (ref.required !== undefined && typeof ref.required !== "boolean"),
    )
  )
    throw new TypeError("ENTITY_AI_MANIFEST_DECLARATION_INVALID");
  const tools = ai.insightProviders
    .map((ref) => {
      const identity = registry.resolveAiToolManifest!(
        ref.id,
        String(ref.version),
        plane,
      );
      if (
        identity.plane !== plane ||
        identity.manifest.toolCode !== ref.id ||
        identity.manifest.version !== String(ref.version)
      )
        throw new TypeError("ENTITY_AI_MANIFEST_RESOLUTION_MISMATCH");
      return {
        ...(ref.required === undefined ? {} : { required: ref.required }),
        id: ref.id,
        version: String(ref.version),
        manifestHash: identity.manifestHash,
        inputSchemaHash: identity.inputSchemaHash,
        resultSchemaHash: identity.resultSchemaHash,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...descriptor,
    aiManifestBindings: parseEntityAiManifestBindings(
      { schema: "entity-ai-manifest-bindings/1", plane, tools },
      ai,
      plane,
    ),
  };
}

/** Recheck immutable pins against trusted composition before signing/dispatch.
 * Historical artifacts without pins retain compatibility. */
export function assertEntityAiManifestBindings(
  descriptor: Readonly<Record<string, unknown>>,
  plane: PublicationPlane,
  registry: CompiledEntityRegistry,
): void {
  if (descriptor.aiManifestBindings === undefined) {
    const refs = (descriptor.ai as EntityAiDescriptorV1 | undefined)?.insightProviders;
    if (Array.isArray(refs) && refs.some((ref) => ref.required !== undefined))
      throw new TypeError("ENTITY_AI_MANIFEST_BINDINGS_REQUIRED");
    return;
  }
  const bindings = parseEntityAiManifestBindings(
    descriptor.aiManifestBindings,
    descriptor.ai as EntityAiDescriptorV1 | undefined,
    plane,
  );
  if (!registry.resolveAiToolManifest)
    throw new TypeError("ENTITY_AI_MANIFEST_RESOLVER_UNAVAILABLE");
  for (const binding of bindings.tools) {
    const current = registry.resolveAiToolManifest(
      binding.id,
      binding.version,
      plane,
    );
    if (
      current.plane !== plane ||
      current.manifest.toolCode !== binding.id ||
      current.manifest.version !== binding.version ||
      current.manifestHash !== binding.manifestHash ||
      current.inputSchemaHash !== binding.inputSchemaHash ||
      current.resultSchemaHash !== binding.resultSchemaHash
    )
      throw new TypeError("ENTITY_AI_MANIFEST_CHANGED");
  }
}
