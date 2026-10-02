import { createHash } from "node:crypto";
import {
  createEntityReadinessEvaluator,
  entityCapabilityRequirements,
  parseEntityDeploymentSupportPointer,
  type EntityRuntimeDescriptor,
  type EntityServingTarget,
} from "@athyper/server-contract-metadata";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import {
  createEntityDeploymentSupportLookup,
  ImmutableEntitySupportReceiptStore,
} from "@athyper/server-platform-metadata";
import { resolveAtlasEntityToolManifest } from "@athyper/server-platform-ai";
import type { HostConfig } from "../../../config/environment.js";

function digest(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
/** Trusted artifacts-bucket authority; no user/metadata-selected key or write endpoint. */
export function entitySupportPointerKey(target: EntityServingTarget): string {
  return `entity-framework/deployment-support/v1/current/${digest(target)}.json`;
}

/** Deployment custody registers every API instance expected to serve this artifact. */
export function entityActivationTargetsKey(
  environment: string,
  descriptor: EntityRuntimeDescriptor,
): string {
  return `entity-framework/deployment-support/v1/targets/${digest({ environment, plane: descriptor.planeKey, artifact: descriptor.compiledHash.replace(/^sha256:/, "") })}.json`;
}

/** Installed on every serving instance. Qualification never substitutes for authorization. */
export function createHostEntityReadiness(options: {
  readonly configuration: () => HostConfig | undefined;
  readonly storage?: Pick<ObjectStorage, "get" | "putIfAbsent">;
  readonly buildIdentity: () => string | null;
  readonly now?: () => number;
}) {
  const receipts = options.storage?.putIfAbsent
    ? new ImmutableEntitySupportReceiptStore(options.storage)
    : undefined;
  const lookup = createEntityDeploymentSupportLookup({
    receipts: receipts ?? {
      async get() {
        throw Error("ENTITY_SUPPORT_STORAGE_UNAVAILABLE");
      },
    },
    async current(target) {
      if (!options.storage) return null;
      const bytes = await options.storage.get(entitySupportPointerKey(target));
      return parseEntityDeploymentSupportPointer(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    },
  });
  function identity(descriptor: EntityRuntimeDescriptor) {
    const config = options.configuration();
    const build = options.buildIdentity();
    const deploymentId = config?.entityServingDeploymentId;
    const adapterVersions: Record<string, string> = {};
    if (build) adapterVersions["entity-host"] = build;
    const unavailableManifests: string[] = [];
    for (const binding of descriptor.aiManifestBindings?.tools ?? []) {
      try {
        const manifest = resolveAtlasEntityToolManifest(
          binding.id,
          binding.version,
          descriptor.planeKey,
        );
        adapterVersions[binding.id] = digest(manifest);
        // A receipt qualifies the published pins; it cannot make a different
        // installed contract compatible, even when its ID/version is unchanged.
        if (
          descriptor.aiManifestBindings?.plane !== manifest.plane ||
          binding.manifestHash !== manifest.manifestHash ||
          binding.inputSchemaHash !== manifest.inputSchemaHash ||
          binding.resultSchemaHash !== manifest.resultSchemaHash
        )
          unavailableManifests.push(binding.id);
      } catch {
        unavailableManifests.push(binding.id);
      }
    }
    return {
      valid: Boolean(deploymentId && build && receipts),
      unavailableManifests,
      adapterVersions,
      target: {
        deploymentId: deploymentId ?? "unconfigured",
        configurationRevision: digest(config ?? {}),
        plane: descriptor.planeKey,
        releaseArtifactHash: descriptor.compiledHash.replace(/^sha256:/, ""),
      } satisfies EntityServingTarget,
    };
  }
  async function evaluateDescriptor(descriptor: EntityRuntimeDescriptor) {
    const requirements = entityCapabilityRequirements(descriptor);
    const before = identity(descriptor);
    const evaluate = createEntityReadinessEvaluator({
      now: options.now,
      lookup: async (target) => {
        if (!before.valid) return null;
        const support = await lookup(target);
        const after = identity(descriptor);
        if (digest(before) !== digest(after))
          throw Error("ENTITY_SERVING_CONFIGURATION_CHANGED");
        if (
          support &&
          digest(support.current.adapterVersions) !==
            digest(before.adapterVersions)
        )
          throw Error("ENTITY_SERVING_ADAPTERS_CHANGED");
        return support;
      },
    });
    const result = await evaluate({ target: before.target, requirements });
    const unavailable = [...result.unavailable];
    for (const requirement of requirements) {
      if (
        before.unavailableManifests.includes(requirement.id) &&
        !unavailable.some((item) => item.id === requirement.id)
      )
        unavailable.push(
          Object.freeze({
            id: requirement.id,
            required: requirement.required,
            reason: "manifest_incompatible" as const,
          }),
        );
    }
    return Object.freeze({
      ...result,
      ready: !unavailable.some((item) => item.required),
      available: Object.freeze(
        result.available.filter(
          (id) => !before.unavailableManifests.includes(id),
        ),
      ),
      unavailable: Object.freeze(unavailable),
    });
  }
  return {
    evaluateDescriptor,
    async assertActivationDescriptors(
      descriptors: readonly EntityRuntimeDescriptor[],
    ) {
      for (const descriptor of descriptors) {
        const requirements = entityCapabilityRequirements(descriptor);
        if (!requirements.some((item) => item.required)) continue;
        const configuration = digest(options.configuration());
        const environment = options.configuration()?.env;
        if (!environment || !options.storage || !receipts)
          throw Error("ENTITY_ACTIVATION_TARGETS_UNAVAILABLE");
        const key = entityActivationTargetsKey(environment, descriptor);
        const bytes = await options.storage.get(key);
        const document: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
        if (
          !document ||
          typeof document !== "object" ||
          Array.isArray(document) ||
          Object.keys(document).sort().join() !== "schema,targets" ||
          !("schema" in document) ||
          document.schema !== "entity-serving-targets/1" ||
          !("targets" in document) ||
          !Array.isArray(document.targets) ||
          !document.targets.length
        )
          throw Error("ENTITY_ACTIVATION_TARGETS_INVALID");
        const targets = document.targets.map(
          parseEntityDeploymentSupportPointer,
        );
        if (
          new Set(targets.map((item) => item.target.deploymentId)).size !==
          targets.length
        )
          throw Error("ENTITY_ACTIVATION_TARGETS_INVALID");
        for (const expected of targets) {
          if (
            expected.target.plane !== descriptor.planeKey ||
            expected.target.releaseArtifactHash !==
              descriptor.compiledHash.replace(/^sha256:/, "") ||
            !expected.adapterVersions["entity-host"]
          )
            throw Error("ENTITY_ACTIVATION_TARGETS_INVALID");
          const evaluate = createEntityReadinessEvaluator({
            now: options.now,
            lookup: async (target) => {
              const support = await lookup(target);
              if (support && digest(support.current) !== digest(expected))
                throw Error("ENTITY_ACTIVATION_TARGET_CHANGED");
              return support;
            },
          });
          const result = await evaluate({
            target: expected.target,
            requirements,
          });
          if (!result.ready)
            throw Error(`ENTITY_DEPLOYMENT_NOT_READY:${descriptor.entityCode}`);
        }
        // A rolling deployment must not change the serving set while evidence is read.
        const currentBytes = await options.storage.get(key);
        if (
          digest(options.configuration()) !== configuration ||
          digest(bytes) !== digest(currentBytes)
        )
          throw Error("ENTITY_ACTIVATION_TARGETS_CHANGED");
      }
    },
    /** Qualification custody uses this exact instance binding; this is not a passed receipt. */
    describeDescriptor: identity,
    /** Also used on each readiness probe, so a changed configuration invalidates old support. */
    async assertDescriptors(descriptors: readonly EntityRuntimeDescriptor[]) {
      for (const descriptor of descriptors) {
        const result = await evaluateDescriptor(descriptor);
        if (!result.ready)
          throw Error(`ENTITY_DEPLOYMENT_NOT_READY:${descriptor.entityCode}`);
      }
    },
  };
}

/** Shared serving admission for both metadata reads and pinned release reads. */
export async function admitEntityDescriptor(
  readiness:
    | Pick<ReturnType<typeof createHostEntityReadiness>, "evaluateDescriptor">
    | undefined,
  descriptor: EntityRuntimeDescriptor,
): Promise<EntityRuntimeDescriptor> {
  if (!readiness) throw Error("ENTITY_DEPLOYMENT_READINESS_UNAVAILABLE");
  const capabilityReadiness = await readiness.evaluateDescriptor(descriptor);
  if (!capabilityReadiness.ready)
    throw Error(`ENTITY_DEPLOYMENT_NOT_READY:${descriptor.entityCode}`);
  return Object.freeze({ ...descriptor, capabilityReadiness });
}
