import {
  FoundationContractError,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { sha256, canonicalJson } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
export function createLegacyNativeReferenceCapabilityAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly binding: {
    readonly runtimeId: string;
    readonly key: string;
    readonly version: number;
    readonly resource: NativeConversionResource;
  };
}): NativeNestedConversionAdapter {
  input = structuredClone(input);
  validateConversionJsonData(input, "/capability");
  const fail = (): never => {
    throw new FoundationContractError(
      "NATIVE_REFERENCE_CAPABILITY_INVALID",
      "/capability",
    );
  };
  if (
    Object.keys(input).sort().join() !== "binding,resource,source,sourceHash" ||
    sha256(input.source) !== input.sourceHash
  )
    fail();
  const binding = input.binding;
  if (
    Object.keys(binding).sort().join() !== "key,resource,runtimeId,version" ||
    binding.resource.key !== binding.key ||
    binding.resource.version !== binding.version ||
    input.source.runtimeProfiles?.filter((r) => r.id === binding.runtimeId)
      .length !== 1
  )
    fail();
  const surfaces =
    input.source.surfaces?.filter((s) =>
      Object.hasOwn(s.layoutConfig ?? {}, "referenceCapability"),
    ) ?? [];
  if (
    !surfaces.length ||
    new Set(surfaces.map((s) => s.id)).size !== surfaces.length ||
    surfaces.some(
      (s) => !s.id || s.layoutConfig!.referenceCapability !== binding.key,
    )
  )
    fail();
  const surfaceIds = new Set(surfaces.map((s) => s.id));
  const prepared: MetaEntityGraph = {
    ...input.source,
    surfaces: input.source.surfaces!.map((s) => {
      if (!surfaceIds.has(s.id)) return s;
      const layoutConfig = { ...s.layoutConfig };
      delete layoutConfig.referenceCapability;
      // Preserve the source envelope while other nested paths remain.
      return { ...s, layoutConfig };
    }),
  };
  return {
    resource: structuredClone(input.resource),
    dependencies: [structuredClone(binding.resource)],
    forward(graph) {
      if (sha256(graph) !== input.sourceHash) fail();
      return structuredClone(prepared);
    },
    reverse(graph, target) {
      const runtime = target.runtimeProfiles.filter(
        (r) => r.id === binding.runtimeId,
      );
      if (
        runtime.length !== 1 ||
        runtime[0]!.referenceCapabilityKey !== binding.key ||
        runtime[0]!.referenceCapabilityVersion !== binding.version ||
        target.surfaces.filter((s) => surfaceIds.has(s.id)).length !==
          surfaceIds.size
      )
        fail();
      const result = {
        ...graph,
        surfaces: graph.surfaces!.map((s) =>
          surfaceIds.has(s.id)
            ? {
                ...s,
                layoutConfig: {
                  ...s.layoutConfig,
                  referenceCapability: runtime[0]!.referenceCapabilityKey,
                },
              }
            : s,
        ),
      };
      if (canonicalJson(result) !== canonicalJson(input.source)) fail();
      return result;
    },
  };
}
